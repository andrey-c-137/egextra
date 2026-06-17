import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AiRequestType, AnswerType, CheckingType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { PromptsService } from '../ai/prompts/prompts.service';
import { getEssayPrompt } from '../ai/prompts/essay-grading';
import { ProgressService } from '../progress/progress.service';
import { StudyPlanService } from '../study-plan/study-plan.service';

// Answer Checking Module — приём ответа, автопроверка, ИИ-проверка, сохранение попытки
@Injectable()
export class AnswersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiOrchestratorService,
    private readonly prompts: PromptsService,
    private readonly progress: ProgressService,
    private readonly plans: StudyPlanService,
  ) {}

  async submit(userId: string, taskId: string, answer: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { subject: { select: { code: true, examType: true } } },
    });
    if (!task) throw new NotFoundException('Задание не найдено');
    if (!task.isActive) throw new BadRequestException('Это задание пока недоступно');

    // Короткий ответ → дешёвая автопроверка по эталону.
    if (task.answerType === AnswerType.SHORT) {
      const isCorrect = this.matches(answer, task.correctAnswer);
      const saved = await this.save(userId, task, {
        answer,
        isCorrect,
        score: isCorrect ? task.maxScore : 0,
        checkingType: CheckingType.AUTO,
      });
      // Показываем эталон только после попытки (для разбора неверного ответа).
      return { ...saved, correctAnswer: task.correctAnswer ?? null };
    }

    // Развёрнутый ответ по русскому (сочинение/изложение) → ИИ-проверка по критериям.
    const essayPrompt = getEssayPrompt(task.subject.examType, task.subject.code, task.egeTaskNumber);
    if (task.answerType === AnswerType.ESSAY && essayPrompt) {
      const system = await this.prompts.getSystem(essayPrompt.key, essayPrompt.system);
      const { data } = await this.ai.run<{ score_estimate?: number; main_mistakes?: string[] }>({
        userId,
        type: AiRequestType.CHECK_ESSAY,
        system,
        user: `Задание:\n${task.text}\n\nОтвет ученика:\n${answer}`,
        jsonMode: true,
      });
      const score = Math.max(0, Math.min(task.maxScore, Math.round(data.score_estimate ?? 0)));
      const saved = await this.save(userId, task, {
        answer,
        isCorrect: score >= task.maxScore,
        score,
        checkingType: CheckingType.AI,
        aiFeedback: data,
        mistakes: data.main_mistakes ?? [],
      });
      return { ...saved, aiFeedback: data };
    }

    // Прочие развёрнутые → общий ИИ-разбор.
    const { data } = await this.ai.run<{ score_estimate?: number; main_mistakes?: string[] }>({
      userId,
      type: AiRequestType.CHECK_ANSWER,
      system:
        'Ты — эксперт ЕГЭ. Проверь ответ ученика, объясни ошибки. Верни JSON: {score_estimate, max_score, is_correct, main_mistakes[], explanation, confidence_score}.',
      user: `Задание: ${task.text}\nЭталон: ${task.correctAnswer ?? '—'}\nОтвет ученика: ${answer}`,
      jsonMode: true,
    });

    return this.save(userId, task, {
      answer,
      isCorrect: (data.score_estimate ?? 0) >= task.maxScore,
      score: data.score_estimate ?? 0,
      checkingType: CheckingType.AI,
      aiFeedback: data,
      mistakes: data.main_mistakes ?? [],
    });
  }

  /**
   * Краткое объяснение задания от ИИ: в чём ошибка, как проверить, верный подход.
   * Кешируется, если ответ ученика не передан (общее объяснение задания).
   */
  async explain(userId: string, taskId: string, studentAnswer?: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Задание не найдено');

    const { data } = await this.ai.run<Record<string, unknown>>({
      userId,
      type: AiRequestType.EXPLAIN_TASK,
      system:
        'Ты — доброжелательный репетитор ЕГЭ/ОГЭ. Объясни кратко и понятно, без воды (3–5 предложений). ' +
        'Верни строго JSON: {mistake: "в чём типичная ошибка или почему ответ неверен", ' +
        'how_to_check: "как рассуждать/проверить себя", correct_approach: "верный ход решения", ' +
        'answer: "правильный ответ кратко"}.',
      user:
        `Задание: ${task.text}\n` +
        `Правильный ответ: ${task.correctAnswer ?? '—'}\n` +
        (studentAnswer ? `Ответ ученика (неверный): ${studentAnswer}` : 'Объясни решение этого задания.'),
      jsonMode: true,
      cacheable: !studentAnswer,
    });
    return data;
  }

  private async save(
    userId: string,
    task: { id: string; subjectId: string; topicId: string | null },
    data: {
      answer: string;
      isCorrect: boolean;
      score: number;
      checkingType: CheckingType;
      aiFeedback?: object;
      mistakes?: string[];
    },
  ) {
    const saved = await this.prisma.userAnswer.create({
      data: {
        userId,
        taskId: task.id,
        answer: data.answer,
        isCorrect: data.isCorrect,
        score: data.score,
        checkingType: data.checkingType,
        aiFeedback: data.aiFeedback,
        mistakes: data.mistakes ?? [],
      },
    });

    // Замыкаем обучающий цикл: пересчитываем карту тем (зелёный/жёлтый/красный)
    // и план подготовки (приоритеты заданий/тем меняются после каждого ответа).
    const progress = await this.progress.recordAnswer(userId, task);
    await this.plans.autoRebuild(userId, task.subjectId);
    return { ...saved, topicProgress: progress };
  }

  /**
   * Сверка короткого ответа с эталоном. Эталон может содержать несколько допустимых
   * вариантов через «;» или «|» (напр. «23;32» — любой порядок цифр).
   */
  private matches(answer: string, correct: string | null): boolean {
    if (!correct) return false;
    const variants = correct.split(/[;|]/).map((v) => this.normalize(v)).filter(Boolean);
    const norm = this.normalize(answer);
    return variants.includes(norm);
  }

  private normalize(s: string): string {
    return (s ?? '')
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[\s.,;:!?'"«»()\-–—]/g, '') // убираем пробелы и пунктуацию
      .trim();
  }
}
