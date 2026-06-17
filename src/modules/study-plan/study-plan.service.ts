import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PlanDayStatus, PlanStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ReadinessService, TaskReadiness } from '../readiness/readiness.service';

const DAY = 86_400_000;
const DEFAULT_DAILY = 60;

export type PlanItemKind =
  | 'quick_win'
  | 'weak_topic'
  | 'key_task'
  | 'repetition'
  | 'mock_exam'
  | 'error_review'
  | 'ai_check'
  | 'lesson_placeholder';

export type PlanItemStatus = 'planned' | 'today' | 'done' | 'skipped' | 'overdue';

export interface PlanItem {
  id: string;
  kind: PlanItemKind;
  title: string;
  reason: string; // человекочитаемая причина назначения
  note?: string; // деталь (тема/проценты)
  minutes: number;
  status: PlanItemStatus;
  subjectId: string;
  egeTaskNumber: number | null;
  topicId: string | null;
  topicName: string | null;
  taskIds: string[];
  mockExamId?: string | null;
  overdue?: boolean;
}

const REASON: Record<PlanItemKind, string> = {
  quick_win: 'Быстрая победа',
  weak_topic: 'Слабая тема',
  key_task: 'Ключевое задание',
  repetition: 'Повторение',
  mock_exam: 'Подготовка к пробнику',
  error_review: 'Разбор ошибок',
  ai_check: 'AI-проверка',
  lesson_placeholder: 'Занятие по теме',
};

const MINUTES: Record<PlanItemKind, number> = {
  quick_win: 15,
  weak_topic: 35,
  key_task: 30,
  repetition: 20,
  mock_exam: 60,
  error_review: 15,
  ai_check: 20,
  lesson_placeholder: 30,
};

const REPEAT_OFFSETS = [1, 3, 7];

/**
 * Календарный движок плана (согласованная модель).
 *
 * 1) Бэклог типизированных задач строится из готовности (ReadinessService):
 *    error_review → quick_win → weak_topic/key_task → ai_check, плюс mock_exam по кадансу.
 * 2) Жадная раскладка по дням от сегодня до даты экзамена в пределах dailyMinutes.
 * 3) Интервальное повторение: после weak_topic/key_task ставим repetition на +1/+3/+7 дн.
 * 4) Просроченные незавершённые задачи прошлых дней подтягиваются в сегодня.
 * 5) Пересборка идемпотентна: переписываем расписание вперёд, статусы done/skipped за
 *    сегодня переносим по ключу, чтобы фоновые пересборки не сбрасывали отметки дня.
 *
 * Задачи дня хранятся в StudyPlanDay.items (JSON) — структура = будущая таблица PlanTask.
 */
@Injectable()
export class StudyPlanService {
  private readonly logger = new Logger(StudyPlanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly readiness: ReadinessService,
  ) {}

  // ---------- чтение ----------

  async list(userId: string) {
    let plans = await this.fetchActive(userId);
    if (plans.length === 0) {
      await this.generate(userId);
      plans = await this.fetchActive(userId);
    }
    return plans;
  }

  private fetchActive(userId: string) {
    return this.prisma.studyPlan.findMany({
      where: { userId, status: PlanStatus.ACTIVE },
      include: {
        days: { orderBy: { date: 'asc' } },
        subject: { select: { name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Задачи на сегодня по всем активным планам (для Главной и рекомендаций). */
  async today(userId: string): Promise<PlanItem[]> {
    const start = midnight();
    const end = new Date(start.getTime() + DAY);
    const days = await this.prisma.studyPlanDay.findMany({
      where: { plan: { userId, status: PlanStatus.ACTIVE }, date: { gte: start, lt: end } },
    });
    return days.flatMap((d) => this.parseItems(d.items));
  }

  // ---------- генерация ----------

  /** Перестроить план: subjectId задан → один предмет; иначе все выбранные предметы. */
  async generate(userId: string, subjectId?: string) {
    if (subjectId) {
      const subject = await this.prisma.subject.findUnique({ where: { id: subjectId } });
      if (!subject) throw new NotFoundException('Предмет не найден');
      const res = await this.rebuild(userId, subjectId);
      if (!res) {
        return {
          created: false,
          reason: 'no_data',
          message:
            'Недостаточно данных. Решите пробник или прорешайте задания — план построится автоматически.',
        };
      }
      return res;
    }

    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId },
      include: { subjects: true },
    });
    if (!profile || profile.subjects.length === 0) {
      throw new BadRequestException('Сначала выберите предметы в онбординге');
    }
    let built = 0;
    for (const ss of profile.subjects) {
      const res = await this.rebuild(userId, ss.subjectId);
      if (res) built++;
    }
    return { created: built > 0, built, subjects: profile.subjects.length };
  }

  /** Фоновый безопасный пересчёт после ответа/пробника. */
  async autoRebuild(userId: string, subjectId: string) {
    try {
      await this.rebuild(userId, subjectId);
    } catch (e) {
      this.logger.warn(`autoRebuild ${subjectId}: ${(e as Error).message}`);
    }
  }

  /** Пересборка плана по предмету. Возвращает план или null, если данных нет. */
  async rebuild(userId: string, subjectId: string) {
    const [analytics, taskRows, profile, mock] = await Promise.all([
      this.readiness.subjectAnalytics(userId, subjectId),
      this.prisma.task.findMany({
        where: { subjectId, egeTaskNumber: { not: null }, isActive: true },
        select: { id: true, egeTaskNumber: true, topicId: true },
      }),
      this.prisma.studentProfile.findUnique({ where: { userId } }),
      this.prisma.mockExam.findFirst({ where: { subjectId, isActive: true }, orderBy: { title: 'asc' } }),
    ]);

    const hasData = analytics.tasks.some((t) => t.attempts > 0);
    if (!hasData) return null;

    const studentSubject = profile
      ? await this.prisma.studentSubject.findUnique({
          where: { profileId_subjectId: { profileId: profile.id, subjectId } },
        })
      : null;
    const dailyMinutes = profile?.dailyMinutes ?? DEFAULT_DAILY;
    const examDate = profile?.examDate ?? null;

    // Сопоставления: номер задания → id заданий; тема → id заданий.
    const numToTasks = new Map<number, string[]>();
    const topicToTasks = new Map<string, string[]>();
    for (const t of taskRows) {
      if (t.egeTaskNumber != null) {
        numToTasks.set(t.egeTaskNumber, [...(numToTasks.get(t.egeTaskNumber) ?? []), t.id]);
      }
      if (t.topicId) topicToTasks.set(t.topicId, [...(topicToTasks.get(t.topicId) ?? []), t.id]);
    }

    // --- горизонт и каданс ---
    const today = midnight();
    const daysToExam = examDate
      ? Math.max(1, Math.round((midnight(examDate).getTime() - today.getTime()) / DAY))
      : null;
    const horizon = daysToExam ? clamp(daysToExam, 3, 30) : 14;
    const cadence = daysToExam == null || daysToExam > 30 ? 14 : daysToExam > 14 ? 8 : daysToExam > 4 ? 4 : 3;

    const dayRemaining = Array.from({ length: horizon }, () => dailyMinutes);
    const dayItems: PlanItem[][] = Array.from({ length: horizon }, () => []);
    const repetitionQueue: { earliestDay: number; item: PlanItem }[] = [];
    const mkId = () => randomUUID();

    const place = (item: PlanItem, fromDay: number): number => {
      for (let d = Math.max(0, fromDay); d < horizon; d++) {
        if (dayRemaining[d] >= item.minutes || (dayItems[d].length === 0 && item.minutes <= dailyMinutes)) {
          dayItems[d].push({ ...item, status: d === 0 ? 'today' : 'planned' });
          dayRemaining[d] -= item.minutes;
          return d;
        }
      }
      return -1;
    };

    // (0) Просроченное из прошлых дней + статусы сегодня для переноса.
    const prev = await this.prisma.studyPlan.findFirst({
      where: { userId, subjectId, status: PlanStatus.ACTIVE },
      include: { days: true },
    });
    const overdue: PlanItem[] = [];
    const todayDone = new Set<string>();
    const todaySkipped = new Set<string>();
    if (prev) {
      for (const d of prev.days) {
        const items = this.parseItems(d.items);
        const isPast = midnight(d.date).getTime() < today.getTime();
        const isToday = midnight(d.date).getTime() === today.getTime();
        for (const it of items) {
          if (isPast && (it.status === 'planned' || it.status === 'today' || it.status === 'overdue')) {
            if (overdue.length < 5) overdue.push({ ...it, id: mkId(), overdue: true, status: 'today' });
          }
          if (isToday && it.status === 'done') todayDone.add(itemKey(it));
          if (isToday && it.status === 'skipped') todaySkipped.add(itemKey(it));
        }
      }
    }
    for (const it of overdue) place(it, 0);

    // (1) Пробники по кадансу (резервируют день целиком).
    if (mock) {
      for (let d = cadence - 1; d < horizon; d += cadence) {
        dayItems[d].push({
          id: mkId(),
          kind: 'mock_exam',
          title: `Пробник: ${mock.title}`,
          reason: REASON.mock_exam,
          note: 'После пробника план пересоберётся под свежие результаты',
          minutes: Math.min(dailyMinutes, MINUTES.mock_exam),
          status: d === 0 ? 'today' : 'planned',
          subjectId,
          egeTaskNumber: null,
          topicId: null,
          topicName: null,
          taskIds: [],
          mockExamId: mock.id,
        });
        dayRemaining[d] = 0;
        if (d + 1 < horizon) {
          repetitionQueue.push({
            earliestDay: d + 1,
            item: {
              id: mkId(),
              kind: 'error_review',
              title: 'Разбор ошибок пробника',
              reason: REASON.error_review,
              minutes: MINUTES.error_review,
              status: 'planned',
              subjectId,
              egeTaskNumber: null,
              topicId: null,
              topicName: null,
              taskIds: [],
            },
          });
        }
      }
    }

    // (2) Разбор недавних ошибок (последние 3 дня).
    const recentErrors = await this.prisma.userAnswer.findMany({
      where: {
        userId,
        isCorrect: false,
        createdAt: { gte: new Date(Date.now() - 3 * DAY) },
        task: { subjectId, egeTaskNumber: { not: null } },
      },
      select: { task: { select: { egeTaskNumber: true, topicId: true } } },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    const errNums = [...new Set(recentErrors.map((e) => e.task.egeTaskNumber!))].slice(0, 2);
    for (const n of errNums) {
      place(
        {
          id: mkId(),
          kind: 'error_review',
          title: `Разобрать ошибку в задании №${n}`,
          reason: REASON.error_review,
          minutes: MINUTES.error_review,
          status: 'planned',
          subjectId,
          egeTaskNumber: n,
          topicId: null,
          topicName: null,
          taskIds: numToTasks.get(n) ?? [],
        },
        0,
      );
    }

    // (3) Быстрые победы.
    for (const q of analytics.quickWins) {
      place(
        {
          id: mkId(),
          kind: 'quick_win',
          title: `Добить задание №${q.egeTaskNumber}`,
          reason: REASON.quick_win,
          note: `Готовность ${q.readiness}% — близко к зелёной зоне`,
          minutes: MINUTES.quick_win,
          status: 'planned',
          subjectId,
          egeTaskNumber: q.egeTaskNumber,
          topicId: q.topicId,
          topicName: q.topicName,
          taskIds: numToTasks.get(q.egeTaskNumber) ?? [],
        },
        0,
      );
    }

    // (4) Слабые: группируем по теме (≥2 слабых задания → тренировка темы), иначе ключевое задание.
    const byTopic = new Map<string, TaskReadiness[]>();
    const loners: TaskReadiness[] = [];
    for (const w of analytics.weakTasks) {
      if (w.topicId) byTopic.set(w.topicId, [...(byTopic.get(w.topicId) ?? []), w]);
      else loners.push(w);
    }
    const scheduleRepetition = (base: PlanItem, dayPlaced: number) => {
      for (const off of REPEAT_OFFSETS) {
        const d = dayPlaced + off;
        if (d >= horizon) continue;
        repetitionQueue.push({
          earliestDay: d,
          item: {
            ...base,
            id: mkId(),
            kind: 'repetition',
            title: `Повторение: ${base.note || base.title}`,
            reason: REASON.repetition,
            note: `Интервальное повторение (+${off} дн)`,
            minutes: MINUTES.repetition,
            status: 'planned',
          },
        });
      }
    };
    for (const [topicId, ws] of byTopic) {
      if (ws.length >= 2) {
        const nums = ws.map((w) => w.egeTaskNumber);
        const taskIds = [...new Set(ws.flatMap((w) => numToTasks.get(w.egeTaskNumber) ?? []))];
        const item: PlanItem = {
          id: mkId(),
          kind: 'weak_topic',
          title: `Тренировка темы: ${ws[0].topicName ?? 'тема'}`,
          reason: REASON.weak_topic,
          note: `${ws[0].topicName ?? 'Тема'} — задания ${nums.map((n) => '№' + n).join(', ')}`,
          minutes: MINUTES.weak_topic,
          status: 'planned',
          subjectId,
          egeTaskNumber: null,
          topicId,
          topicName: ws[0].topicName,
          taskIds: taskIds.length ? taskIds : topicToTasks.get(topicId) ?? [],
        };
        const d = place(item, 0);
        if (d >= 0) scheduleRepetition(item, d);
      } else {
        loners.push(...ws);
      }
    }
    for (const w of loners) {
      const item: PlanItem = {
        id: mkId(),
        kind: 'key_task',
        title: `Разобрать задание №${w.egeTaskNumber}`,
        reason: REASON.key_task,
        note: w.topicName ?? undefined,
        minutes: MINUTES.key_task,
        status: 'planned',
        subjectId,
        egeTaskNumber: w.egeTaskNumber,
        topicId: w.topicId,
        topicName: w.topicName,
        taskIds: numToTasks.get(w.egeTaskNumber) ?? [],
      };
      const d = place(item, 0);
      if (d >= 0) scheduleRepetition(item, d);
    }

    // (5) AI-проверка письменных — для русского.
    const subjectMeta = await this.prisma.subject.findUnique({ where: { id: subjectId }, select: { code: true } });
    if (subjectMeta?.code?.includes('rus')) {
      place(
        {
          id: mkId(),
          kind: 'ai_check',
          title: 'Написать и проверить сочинение через AI',
          reason: REASON.ai_check,
          minutes: MINUTES.ai_check,
          status: 'planned',
          subjectId,
          egeTaskNumber: null,
          topicId: null,
          topicName: null,
          taskIds: [],
        },
        0,
      );
    }

    // (6) Интервальные повторения и разборы пробников.
    repetitionQueue.sort((a, b) => a.earliestDay - b.earliestDay);
    for (const r of repetitionQueue) place(r.item, r.earliestDay);

    // Перенос отметок сегодня (done/skipped) на новые задачи дня 0.
    for (const it of dayItems[0]) {
      const key = itemKey(it);
      if (todayDone.has(key)) it.status = 'done';
      else if (todaySkipped.has(key)) it.status = 'skipped';
    }

    // --- запись плана (одна активная версия на предмет) ---
    const daysToCreate = dayItems
      .map((items, i) => ({ i, items }))
      .filter(({ i, items }) => items.length > 0 || i === 0)
      .map(({ i, items }) => ({
        date: new Date(today.getTime() + i * DAY),
        title: items[0]?.title ?? 'Свободный день',
        note: items[0]?.reason ?? null,
        kind: items[0]?.kind ?? null,
        priority: i,
        topics: [...new Set(items.flatMap((x) => (x.topicId ? [x.topicId] : [])))],
        tasks: [...new Set(items.flatMap((x) => x.taskIds))],
        items: items as unknown as object,
        estimatedMinutes: items.reduce((s, x) => s + x.minutes, 0),
        status: PlanDayStatus.PLANNED,
      }));

    const plan = await this.prisma.$transaction(async (tx) => {
      await tx.studyPlan.updateMany({
        where: { userId, subjectId, status: PlanStatus.ACTIVE },
        data: { status: PlanStatus.ARCHIVED },
      });
      return tx.studyPlan.create({
        data: {
          userId,
          subjectId,
          targetScore: studentSubject?.targetScore ?? null,
          examDate,
          dailyMinutes,
          status: PlanStatus.ACTIVE,
          days: { create: daysToCreate },
        },
        include: { days: { orderBy: { date: 'asc' } }, subject: { select: { name: true, code: true } } },
      });
    });
    return plan;
  }

  // ---------- действия над задачами дня ----------

  async updateItem(userId: string, dayId: string, itemId: string, action: 'done' | 'skip' | 'reschedule') {
    const day = await this.prisma.studyPlanDay.findUnique({
      where: { id: dayId },
      include: { plan: { select: { userId: true } } },
    });
    if (!day || day.plan.userId !== userId) throw new NotFoundException('День плана не найден');

    const items = this.parseItems(day.items);
    const item = items.find((x) => x.id === itemId);
    if (!item) throw new NotFoundException('Задача не найдена');

    if (action === 'done') item.status = 'done';
    else if (action === 'skip') item.status = 'skipped';
    else if (action === 'reschedule') {
      item.status = 'skipped';
      item.note = (item.note ? item.note + '. ' : '') + 'Перенесено';
    }

    const allClosed = items.every((x) => x.status === 'done' || x.status === 'skipped');
    await this.prisma.studyPlanDay.update({
      where: { id: dayId },
      data: {
        items: items as unknown as object,
        status: allClosed ? PlanDayStatus.DONE : day.status,
      },
    });
    return { ok: true, items };
  }

  // ---------- утилиты ----------

  private parseItems(raw: unknown): PlanItem[] {
    if (Array.isArray(raw)) return raw as PlanItem[];
    return [];
  }
}

function midnight(d?: Date): Date {
  const x = d ? new Date(d) : new Date();
  x.setHours(0, 0, 0, 0);
  return x;
}
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
function itemKey(it: PlanItem): string {
  return `${it.kind}:${it.egeTaskNumber ?? it.topicId ?? it.mockExamId ?? it.title}`;
}
