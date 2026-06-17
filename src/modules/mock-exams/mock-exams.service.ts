import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AiRequestType, AnswerType, CheckingType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { PromptsService } from '../ai/prompts/prompts.service';
import { getEssayPrompt } from '../ai/prompts/essay-grading';
import { ProgressService } from '../progress/progress.service';
import { StudyPlanService } from '../study-plan/study-plan.service';

interface PerTask { taskId: string; egeTaskNumber: number | null; topicId: string | null; score: number; maxScore: number }

/**
 * Mock Exam Module — полные пробники: прохождение с автоскорингом короткой части
 * и ИИ-проверкой развёрнутых заданий по русскому, ручной ввод результата прошлого
 * пробника, история с фильтром и динамика баллов. После результата пересобирает план.
 */
@Injectable()
export class MockExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiOrchestratorService,
    private readonly prompts: PromptsService,
    private readonly progress: ProgressService,
    private readonly plans: StudyPlanService,
  ) {}

  list(subjectId?: string) {
    return this.prisma.mockExam.findMany({
      where: { isActive: true, subjectId: subjectId || undefined },
      include: { subject: { select: { name: true } } },
      orderBy: { title: 'asc' },
    });
  }

  /** Прохождение пробника: автоскоринг короткой части (часть 1). */
  async finish(userId: string, mockExamId: string, answers: Record<string, string>) {
    const mock = await this.prisma.mockExam.findUnique({ where: { id: mockExamId } });
    if (!mock) throw new NotFoundException('Пробник не найден');
    const tasks = await this.prisma.task.findMany({
      where: { id: { in: mock.tasks } },
      include: { subject: { select: { code: true, examType: true } } },
    });

    const perTask: PerTask[] = [];
    let autoChecked = 0;
    let needsManual = 0;

    for (const task of tasks) {
      const answer = answers[task.id];
      let score = 0;
      let checking: CheckingType = CheckingType.AUTO;
      let isCorrect = false;

      if (task.answerType === AnswerType.SHORT) {
        autoChecked++;
        isCorrect = answer != null && answer !== '' && this.matches(answer, task.correctAnswer);
        score = isCorrect ? task.maxScore : 0;
      } else if (task.answerType === AnswerType.ESSAY && answer && answer.trim()) {
        // Развёрнутый ответ по русскому → ИИ-проверка по критериям (Grok).
        const prompt = getEssayPrompt(task.subject.examType, task.subject.code, task.egeTaskNumber);
        if (prompt) {
          try {
            const system = await this.prompts.getSystem(prompt.key, prompt.system);
            const { data } = await this.ai.run<{ score_estimate?: number }>({
              userId, type: AiRequestType.CHECK_ESSAY, system,
              user: `Задание:\n${task.text}\n\nОтвет ученика:\n${answer}`, jsonMode: true,
            });
            score = Math.max(0, Math.min(task.maxScore, Math.round(data.score_estimate ?? 0)));
            checking = CheckingType.AI;
          } catch { needsManual++; }
        } else needsManual++;
      } else {
        needsManual++;
      }

      if (task.answerType === AnswerType.SHORT || checking === CheckingType.AI) {
        await this.prisma.userAnswer.create({
          data: { userId, taskId: task.id, answer: answer ?? '', isCorrect, score, checkingType: checking },
        });
        await this.progress.recordAnswer(userId, task);
      }
      perTask.push({ taskId: task.id, egeTaskNumber: task.egeTaskNumber, topicId: task.topicId, score, maxScore: task.maxScore });
    }

    const result = await this.saveResult(userId, mock, answers, perTask, { autoChecked, needsManual });
    await this.plans.autoRebuild(userId, mock.subjectId);
    return result;
  }

  /** Ручной ввод результата ранее решённого пробника: № задания → балл. */
  async manualResult(userId: string, mockExamId: string, scores: Record<string, number>) {
    const mock = await this.prisma.mockExam.findUnique({ where: { id: mockExamId } });
    if (!mock) throw new NotFoundException('Пробник не найден');
    if (!scores || typeof scores !== 'object') throw new BadRequestException('Передайте баллы по заданиям');
    const tasks = await this.prisma.task.findMany({ where: { id: { in: mock.tasks } } });

    const perTask: PerTask[] = tasks.map((task) => {
      const raw = scores[String(task.egeTaskNumber)] ?? scores[task.id];
      const score = Math.max(0, Math.min(task.maxScore, Number(raw) || 0));
      return { taskId: task.id, egeTaskNumber: task.egeTaskNumber, topicId: task.topicId, score, maxScore: task.maxScore };
    });

    const result = await this.saveResult(userId, mock, scores, perTask, { manual: true });
    await this.plans.autoRebuild(userId, mock.subjectId);
    return result;
  }

  /** История пробников с фильтром по предмету. */
  async history(userId: string, subjectId?: string) {
    const results = await this.prisma.mockExamResult.findMany({
      where: { userId, mockExam: subjectId ? { subjectId } : undefined },
      include: { mockExam: { select: { title: true, subjectId: true, maxPrimaryScore: true, subject: { select: { name: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
    return results.map((r) => ({
      id: r.id,
      date: r.createdAt,
      title: r.mockExam.title,
      subjectId: r.mockExam.subjectId,
      subjectName: r.mockExam.subject.name,
      primaryScore: r.primaryScore,
      maxPrimaryScore: r.mockExam.maxPrimaryScore,
      testScore: r.testScore,
      weakTopics: r.weakTopics.length,
    }));
  }

  private async saveResult(
    userId: string,
    mock: { id: string; subjectId: string; maxPrimaryScore: number },
    answers: Record<string, unknown>,
    perTask: PerTask[],
    extra: Record<string, unknown>,
  ) {
    const primaryScore = perTask.reduce((s, t) => s + t.score, 0);
    const maxPrimaryScore = mock.maxPrimaryScore || perTask.reduce((s, t) => s + t.maxScore, 0);
    const testScore = maxPrimaryScore ? Math.round((primaryScore / maxPrimaryScore) * 100) : null;
    const weakTopics = [...new Set(perTask.filter((t) => t.score < t.maxScore && t.topicId).map((t) => t.topicId!))];

    return this.prisma.mockExamResult.create({
      data: {
        userId,
        mockExamId: mock.id,
        answers: answers as object,
        primaryScore,
        testScore,
        weakTopics,
        aiSummary: { perTask, maxPrimaryScore, ...extra } as object,
      },
    });
  }

  private matches(answer: string, correct: string | null): boolean {
    if (!correct) return false;
    const variants = correct.split(/[;|]/).map((v) => this.normalize(v)).filter(Boolean);
    return variants.includes(this.normalize(answer));
  }
  private normalize(s: string): string {
    return (s ?? '').toLowerCase().replace(/ё/g, 'е').replace(/[\s.,;:!?'"«»()\-–—]/g, '').trim();
  }
}
