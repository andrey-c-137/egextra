import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PlanStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

interface PerTask { egeTaskNumber?: number; score?: number; maxScore?: number }
interface Target { n: number; ratio: number; difficulty: number; topicId: string | null; taskIds: string[] }
interface PlanDay {
  date: Date; title: string; note: string; kind: string; priority: number;
  topics: string[]; tasks: string[]; estimatedMinutes: number;
}

/**
 * Движок плана подготовки (MVP-логика):
 *  1) готовность считаем по НОМЕРАМ заданий (из пробников + практики);
 *  2) «быстрые победы» — простые задания и те, где балл близок к максимуму;
 *  3) «темы по пересечению» — темы, встречающиеся в нескольких незакрытых заданиях
 *     (закрыв тему, поднимаем сразу несколько заданий);
 *  4) нерешаемые («нули») — в конец.
 * План пересчитывается автоматически после каждого обновления данных (ответ/пробник).
 */
@Injectable()
export class StudyPlanService {
  private readonly logger = new Logger(StudyPlanService.name);
  private static readonly MAX_DAYS = 14;

  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.studyPlan.findMany({
      where: { userId },
      include: { days: { orderBy: [{ priority: 'asc' }, { date: 'asc' }] }, subject: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  today(userId: string) {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    return this.prisma.studyPlanDay.findMany({
      where: { plan: { userId, status: PlanStatus.ACTIVE }, date: { gte: start, lt: end } },
      orderBy: { priority: 'asc' },
    });
  }

  /** Ручной вызов из контроллера (generate/rebuild). */
  async generate(userId: string, subjectId: string) {
    if (!subjectId) throw new BadRequestException('Не указан предмет');
    const subject = await this.prisma.subject.findUnique({ where: { id: subjectId } });
    if (!subject) throw new NotFoundException('Предмет не найден');
    const result = await this.rebuild(userId, subjectId);
    if (!result) {
      return { created: false, reason: 'no_data', message: 'Недостаточно данных. Решите пробник или прорешайте задания — план построится автоматически.' };
    }
    return result;
  }

  /**
   * Пересобрать план по предмету из текущих данных готовности.
   * Возвращает созданный план или null, если данных/целей для плана нет.
   * Безопасен для фонового вызова — ошибки не пробрасывает наружу при autoRebuild.
   */
  async rebuild(userId: string, subjectId: string) {
    const [tasks, topics, profile] = await Promise.all([
      this.prisma.task.findMany({
        where: { subjectId, egeTaskNumber: { not: null }, isActive: true },
        select: { id: true, egeTaskNumber: true, topicId: true, maxScore: true, difficulty: true },
      }),
      this.prisma.topic.findMany({
        where: { subjectId },
        select: { id: true, name: true, difficultyLevel: true, egeTaskNumbers: true },
      }),
      this.prisma.studentProfile.findUnique({ where: { userId } }),
    ]);
    if (tasks.length === 0) return null;

    // Мета по номеру задания: список заданий-вариантов, тема, сложность, макс. балл.
    const numbers = new Map<number, { taskIds: string[]; topicId: string | null; difficulty: number; maxScore: number }>();
    for (const t of tasks) {
      const n = t.egeTaskNumber!;
      const meta = numbers.get(n) ?? { taskIds: [], topicId: t.topicId, difficulty: t.difficulty, maxScore: t.maxScore };
      meta.taskIds.push(t.id);
      meta.topicId = t.topicId ?? meta.topicId;
      meta.maxScore = Math.max(meta.maxScore, t.maxScore);
      numbers.set(n, meta);
    }

    const readiness = await this.readinessByNumber(userId, subjectId);
    if (readiness.size === 0) return null; // нет данных — план строить не из чего

    // Цели (для метаданных плана).
    const studentSubject = profile
      ? await this.prisma.studentSubject.findUnique({ where: { profileId_subjectId: { profileId: profile.id, subjectId } } })
      : null;
    const dailyMinutes = profile?.dailyMinutes ?? 60;

    // Незакрытые задания (есть данные и балл < максимума).
    const targets: Target[] = [];
    for (const [n, meta] of numbers) {
      const ratio = readiness.get(n);
      if (ratio == null || ratio >= 1) continue;
      // Сложность — по уровню задания из методкарты (task.difficulty: Б=1/П=2/В=3),
      // а не по теме (у тем уровень не задан и одинаков).
      const difficulty = meta.difficulty || 1;
      targets.push({ n, ratio, difficulty, topicId: meta.topicId, taskIds: meta.taskIds });
    }
    if (targets.length === 0) return null; // всё закрыто — план не нужен

    // (1) Быстрые победы: простые (difficulty=1) ИЛИ близкие к максимуму (ratio>=0.5).
    const quickWins = targets
      .filter((t) => t.difficulty === 1 || t.ratio >= 0.5)
      .sort((a, b) => a.difficulty - b.difficulty || b.ratio - a.ratio);
    const quickSet = new Set(quickWins.map((t) => t.n));

    // (2) Темы по пересечению: тема (из файла тем) покрывает ≥2 незакрытых задания.
    //     Закрыв такую тему, поднимаем сразу несколько заданий.
    const targetByN = new Map(targets.map((t) => [t.n, t]));
    const leverageTopics = topics
      // отбрасываем мета-темы-«каталоги» (покрывают слишком много заданий — неконкретны)
      .filter((tp) => tp.egeTaskNumbers.length > 0 && tp.egeTaskNumbers.length <= 8)
      .map((tp) => {
        const nums = tp.egeTaskNumbers.filter((n) => targetByN.has(n));
        return { topicId: tp.id, name: tp.name, numbers: nums, count: nums.length, gap: nums.reduce((s, n) => s + (1 - targetByN.get(n)!.ratio), 0) };
      })
      .filter((t) => t.count >= 2)
      .sort((a, b) => b.count - a.count || b.gap - a.gap);

    // (3) Тяжёлые/нули: остальные незакрытые, кроме покрытых темой-рычагом и быстрых побед.
    const leverageNumbers = new Set<number>(leverageTopics.flatMap((l) => l.numbers));
    const hard = targets
      .filter((t) => !quickSet.has(t.n) && !leverageNumbers.has(t.n))
      .sort((a, b) => b.ratio - a.ratio);

    const topicNumbers = new Map(topics.map((t) => [t.id, t.egeTaskNumbers]));
    const tasksOfTopic = (topicId: string) => {
      const nums = topicNumbers.get(topicId) ?? [];
      return tasks.filter((t) => t.egeTaskNumber != null && nums.includes(t.egeTaskNumber)).map((t) => t.id);
    };

    // Собираем дни.
    const days: PlanDay[] = [];
    let pr = 0;
    const dayDate = (i: number) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i); return d; };
    const push = (d: Omit<PlanDay, 'date' | 'priority' | 'estimatedMinutes'>) => {
      days.push({ ...d, priority: pr, date: dayDate(days.length), estimatedMinutes: dailyMinutes });
      pr++;
    };

    for (const t of quickWins) {
      push({
        kind: 'quick_win',
        title: `Добить задание №${t.n}`,
        note: t.ratio > 0
          ? `Балл ${Math.round(t.ratio * 100)}% — близко к максимуму, легко довести до 100%`
          : 'Простое задание — быстрый прирост баллов',
        topics: t.topicId ? [t.topicId] : [],
        tasks: t.taskIds,
      });
    }
    for (const lt of leverageTopics) {
      push({
        kind: 'topic',
        title: `Закрыть тему: ${lt.name}`,
        note: `Тема в заданиях ${lt.numbers.map((n) => '№' + n).join(', ')} — закрыв её, поднимете сразу несколько заданий`,
        topics: [lt.topicId],
        tasks: tasksOfTopic(lt.topicId),
      });
    }
    for (const t of hard) {
      push({
        kind: 'weak',
        title: `Разобрать задание №${t.n}`,
        note: t.ratio > 0 ? `Балл ${Math.round(t.ratio * 100)}% — нужна проработка` : 'Пока не решается — разберём с нуля',
        topics: t.topicId ? [t.topicId] : [],
        tasks: t.taskIds,
      });
    }

    const finalDays = days.slice(0, StudyPlanService.MAX_DAYS);

    const plan = await this.prisma.$transaction(async (tx) => {
      await tx.studyPlan.updateMany({
        where: { userId, subjectId, status: PlanStatus.ACTIVE },
        data: { status: PlanStatus.ARCHIVED },
      });
      return tx.studyPlan.create({
        data: {
          userId, subjectId,
          targetScore: studentSubject?.targetScore ?? null,
          examDate: profile?.examDate ?? null,
          dailyMinutes,
          status: PlanStatus.ACTIVE,
          days: { create: finalDays },
        },
        include: { days: { orderBy: { priority: 'asc' } }, subject: { select: { name: true } } },
      });
    });
    return plan;
  }

  /** Фоновый пересчёт после ответа/пробника — ошибки не валят основной поток. */
  async autoRebuild(userId: string, subjectId: string) {
    try { await this.rebuild(userId, subjectId); }
    catch (e) { this.logger.warn(`autoRebuild ${subjectId}: ${(e as Error).message}`); }
  }

  /**
   * Готовность по номеру задания: практика (свежее) перекрывает пробник.
   * Возвращает Map<номер задания, доля 0..1>.
   */
  private async readinessByNumber(userId: string, subjectId: string): Promise<Map<number, number>> {
    const result = new Map<number, number>();

    // Из последнего пробника по предмету (per-task разбивка в aiSummary).
    const lastMock = await this.prisma.mockExamResult.findFirst({
      where: { userId, mockExam: { subjectId } },
      orderBy: { createdAt: 'desc' },
    });
    const perTask = (lastMock?.aiSummary as { perTask?: PerTask[] } | null)?.perTask;
    if (Array.isArray(perTask)) {
      for (const pt of perTask) {
        if (pt.egeTaskNumber != null && pt.maxScore) result.set(pt.egeTaskNumber, (pt.score ?? 0) / pt.maxScore);
      }
    }

    // Из практики (перекрывает пробник): агрегируем по номеру задания.
    const answers = await this.prisma.userAnswer.findMany({
      where: { userId, task: { subjectId, egeTaskNumber: { not: null } } },
      select: { score: true, isCorrect: true, task: { select: { egeTaskNumber: true, maxScore: true } } },
    });
    const agg = new Map<number, { score: number; max: number }>();
    for (const a of answers) {
      const n = a.task.egeTaskNumber!;
      const cur = agg.get(n) ?? { score: 0, max: 0 };
      cur.score += a.score ?? (a.isCorrect ? a.task.maxScore : 0);
      cur.max += a.task.maxScore;
      agg.set(n, cur);
    }
    for (const [n, v] of agg) if (v.max > 0) result.set(n, v.score / v.max);

    return result;
  }
}
