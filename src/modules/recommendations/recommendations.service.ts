import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanItem, StudyPlanService } from '../study-plan/study-plan.service';

export interface RecommendedAction {
  kind: PlanItem['kind'] | 'practice';
  title: string;
  reason: string;
  subjectId: string | null;
  subjectName: string | null;
  egeTaskNumber: number | null;
  topicId: string | null;
  taskIds: string[];
  mockExamId: string | null;
  overdue: boolean;
}

/**
 * Рекомендации «что делать сегодня» = незакрытые задачи сегодняшнего плана,
 * упорядоченные по приоритету типа. Без ИИ — дёшево и предсказуемо.
 * Если плана/данных ещё нет — мягкий фолбэк (пройти пробник / начать практику).
 */
@Injectable()
export class RecommendationsService {
  // приоритет типа задачи в ленте рекомендаций (меньше = выше)
  private static readonly ORDER: Record<string, number> = {
    error_review: 0,
    quick_win: 1,
    weak_topic: 2,
    key_task: 3,
    repetition: 4,
    mock_exam: 5,
    ai_check: 6,
    lesson_placeholder: 7,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: StudyPlanService,
  ) {}

  async today(userId: string): Promise<{ actions: RecommendedAction[] }> {
    const items = (await this.plans.today(userId)).filter(
      (i) => i.status !== 'done' && i.status !== 'skipped',
    );

    if (items.length === 0) {
      return { actions: await this.fallback(userId) };
    }

    const subjectNames = await this.subjectNames(items.map((i) => i.subjectId));
    const actions = items
      .sort((a, b) => {
        if (!!b.overdue !== !!a.overdue) return a.overdue ? -1 : 1; // просрочено вперёд
        return (RecommendationsService.ORDER[a.kind] ?? 9) - (RecommendationsService.ORDER[b.kind] ?? 9);
      })
      .slice(0, 6)
      .map((i) => ({
        kind: i.kind,
        title: i.title,
        reason: i.overdue ? 'Просрочено — закрыть в первую очередь' : i.reason,
        subjectId: i.subjectId,
        subjectName: subjectNames.get(i.subjectId) ?? null,
        egeTaskNumber: i.egeTaskNumber,
        topicId: i.topicId,
        taskIds: i.taskIds,
        mockExamId: i.mockExamId ?? null,
        overdue: !!i.overdue,
      }));

    return { actions };
  }

  private async fallback(userId: string): Promise<RecommendedAction[]> {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId },
      include: { subjects: { include: { subject: { select: { id: true, name: true } } } } },
    });
    const first = profile?.subjects[0];
    const subjectId = first?.subjectId ?? null;
    const subjectName = first?.subject.name ?? null;
    return [
      {
        kind: 'mock_exam',
        title: 'Пройдите пробник или введите результат',
        reason: 'Это даст данные для персонального плана и аналитики',
        subjectId,
        subjectName,
        egeTaskNumber: null,
        topicId: null,
        taskIds: [],
        mockExamId: null,
        overdue: false,
      },
      {
        kind: 'practice',
        title: 'Начните практику по выбранному предмету',
        reason: 'Решённые задания формируют карту готовности',
        subjectId,
        subjectName,
        egeTaskNumber: null,
        topicId: null,
        taskIds: [],
        mockExamId: null,
        overdue: false,
      },
    ];
  }

  private async subjectNames(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    const rows = await this.prisma.subject.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((r) => [r.id, r.name]));
  }
}
