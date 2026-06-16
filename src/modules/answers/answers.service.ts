import { Injectable, NotFoundException } from '@nestjs/common';
import { AiRequestType, AnswerType, CheckingType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';

// Answer Checking Module — приём ответа, автопроверка, ИИ-проверка, сохранение попытки
@Injectable()
export class AnswersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiOrchestratorService,
  ) {}

  async submit(userId: string, taskId: string, answer: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Задание не найдено');

    // Короткий ответ → дешёвая автопроверка по эталону.
    if (task.answerType === AnswerType.SHORT) {
      const isCorrect = this.normalize(answer) === this.normalize(task.correctAnswer ?? '');
      return this.save(userId, taskId, {
        answer,
        isCorrect,
        score: isCorrect ? task.maxScore : 0,
        checkingType: CheckingType.AUTO,
      });
    }

    // Сложный ответ (сочинение/код) → ИИ-проверка через оркестратор.
    const { data } = await this.ai.run<{
      score_estimate?: number;
      main_mistakes?: string[];
    }>({
      userId,
      type: AiRequestType.CHECK_ANSWER,
      system:
        'Ты — эксперт ЕГЭ. Проверь ответ ученика, объясни ошибки. Верни JSON: {score, max_score, is_correct, mistakes[], explanation, confidence_score}.',
      user: `Задание: ${task.text}\nЭталон: ${task.correctAnswer ?? '—'}\nОтвет ученика: ${answer}`,
      jsonMode: true,
    });

    return this.save(userId, taskId, {
      answer,
      isCorrect: (data.score_estimate ?? 0) >= task.maxScore,
      score: data.score_estimate ?? 0,
      checkingType: CheckingType.AI,
      aiFeedback: data,
      mistakes: data.main_mistakes ?? [],
    });
  }

  private save(
    userId: string,
    taskId: string,
    data: {
      answer: string;
      isCorrect: boolean;
      score: number;
      checkingType: CheckingType;
      aiFeedback?: object;
      mistakes?: string[];
    },
  ) {
    return this.prisma.userAnswer.create({
      data: {
        userId,
        taskId,
        answer: data.answer,
        isCorrect: data.isCorrect,
        score: data.score,
        checkingType: data.checkingType,
        aiFeedback: data.aiFeedback,
        mistakes: data.mistakes ?? [],
      },
    });
  }

  private normalize(s: string): string {
    return s.trim().toLowerCase().replace(/\s+/g, '');
  }
}
