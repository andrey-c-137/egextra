import { Injectable } from '@nestjs/common';
import { PlanStatus, TopicStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface RecommendedAction {
  type: 'plan' | 'weak_topic' | 'practice' | 'essay';
  priority: number;
  title: string;
  reason: string;
  subjectId?: string;
  topicId?: string;
  taskIds?: string[];
}

/**
 * Recommendation Module — детерминированная сборка «что делать сегодня»
 * из плана на сегодня + слабых тем (красные/жёлтые). Без ИИ — дёшево и предсказуемо.
 */
@Injectable()
export class RecommendationsService {
  constructor(private readonly prisma: PrismaService) {}

  async today(userId: string): Promise<{ userId: string; actions: RecommendedAction[] }> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const [planDays, weakTopics] = await Promise.all([
      this.prisma.studyPlanDay.findMany({
        where: { plan: { userId, status: PlanStatus.ACTIVE }, date: { gte: start, lt: end } },
      }),
      this.prisma.topicProgress.findMany({
        where: { userId, status: { in: [TopicStatus.RED, TopicStatus.YELLOW] } },
        orderBy: { accuracyPercent: 'asc' },
        take: 3,
        include: { topic: { select: { id: true, name: true } } },
      }),
    ]);

    const actions: RecommendedAction[] = [];

    // 1. План на сегодня — наивысший приоритет.
    for (const day of planDays) {
      if (day.topics.length || day.tasks.length) {
        actions.push({
          type: 'plan',
          priority: 1,
          title: 'Выполните задания из плана на сегодня',
          reason: `В плане на сегодня ${day.topics.length} тем и ${day.tasks.length} заданий`,
          taskIds: day.tasks,
        });
      }
    }

    // 2. Слабые темы — подтянуть в первую очередь.
    weakTopics.forEach((tp, i) => {
      actions.push({
        type: 'weak_topic',
        priority: 2 + i,
        title: `Повторите тему: ${tp.topic.name}`,
        reason: `Точность ${Math.round(tp.accuracyPercent)}% (${tp.status === TopicStatus.RED ? 'красная' : 'жёлтая'} зона)`,
        subjectId: tp.subjectId,
        topicId: tp.topicId,
      });
    });

    // 3. Если совсем пусто — предложить базовое действие (онбординг уже пройден).
    if (actions.length === 0) {
      actions.push({
        type: 'practice',
        priority: 5,
        title: 'Прорешайте задания, чтобы построить карту тем',
        reason: 'Пока нет данных о прогрессе — начните практику или сгенерируйте план',
      });
    }

    actions.sort((a, b) => a.priority - b.priority);
    return { userId, actions };
  }
}
