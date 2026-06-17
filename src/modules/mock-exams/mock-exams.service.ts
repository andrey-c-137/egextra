import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AnswerType, CheckingType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProgressService } from '../progress/progress.service';
import { StudyPlanService } from '../study-plan/study-plan.service';

interface PerTask { taskId: string; egeTaskNumber: number | null; topicId: string | null; score: number; maxScore: number }

/**
 * Mock Exam Module — полные пробники: прохождение с автоскорингом короткой части,
 * ручной ввод результата прошлого пробника, история с фильтром и динамика баллов.
 * После результата пересобирает план подготовки.
 */
@Injectable()
export class MockExamsService {
  constructor(
    private readonly prisma: PrismaService,
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
    const tasks = await this.prisma.task.findMany({ where: { id: { in: mock.tasks } } });

    const perTask: PerTask[] = [];
    let autoChecked = 0;
    let needsManual = 0;

    for (const task of tasks) {
      const answer = answers[task.id];
      let score = 0;
      if (task.answerType === AnswerType.SHORT) {
        autoChecked++;
        const isCorrect = answer != null && answer !== '' && this.matches(answer, task.correctAnswer);
        score = isCorrect ? task.maxScore : 0;
        await this.prisma.userAnswer.create({
          data: { userId, taskId: task.id, answer: answer ?? '', isCorrect, score, checkingType: CheckingType.AUTO },
        });
        await this.progress.recordAnswer(userId, task);
      } else {
        needsManual++;
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
