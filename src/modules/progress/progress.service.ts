import { Injectable, Logger } from '@nestjs/common';
import { TopicStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Ядро обучающего цикла: после каждой проверенной попытки пересчитываем
 * карту тем (topic_progress) — точность, средний балл, цвет статуса.
 * Используется AnswersService и MockExamsController.
 */
@Injectable()
export class ProgressService {
  private readonly logger = new Logger(ProgressService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Порог цвета темы по точности (в процентах). */
  static statusFor(accuracyPercent: number, attempts: number): TopicStatus {
    if (attempts === 0) return TopicStatus.GRAY;
    if (accuracyPercent >= 80) return TopicStatus.GREEN;
    if (accuracyPercent >= 50) return TopicStatus.YELLOW;
    return TopicStatus.RED;
  }

  /**
   * Пересчитать прогресс по теме задания, на которое ответил ученик.
   * Считаем по факту из user_answers (join по task.topicId) — без накопления ошибок округления.
   */
  async recomputeTopic(userId: string, subjectId: string, topicId: string) {
    const answers = await this.prisma.userAnswer.findMany({
      where: { userId, task: { topicId } },
      select: { isCorrect: true, score: true, createdAt: true },
    });

    const attempts = answers.length;
    const correct = answers.filter((a) => a.isCorrect === true).length;
    const accuracyPercent = attempts ? (correct / attempts) * 100 : 0;
    const scored = answers.filter((a) => typeof a.score === 'number');
    const averageScore = scored.length
      ? scored.reduce((s, a) => s + (a.score ?? 0), 0) / scored.length
      : 0;
    const lastPracticedAt = answers.reduce<Date | null>(
      (latest, a) => (!latest || a.createdAt > latest ? a.createdAt : latest),
      null,
    );

    return this.prisma.topicProgress.upsert({
      where: { userId_topicId: { userId, topicId } },
      create: {
        userId,
        subjectId,
        topicId,
        attempts,
        accuracyPercent,
        averageScore,
        status: ProgressService.statusFor(accuracyPercent, attempts),
        lastPracticedAt,
      },
      update: {
        attempts,
        accuracyPercent,
        averageScore,
        status: ProgressService.statusFor(accuracyPercent, attempts),
        lastPracticedAt,
      },
    });
  }

  /**
   * Зафиксировать результат попытки в карте тем. Если у задания нет темы —
   * прогресс по темам не ведём (нечего обновлять), молча выходим.
   */
  async recordAnswer(userId: string, task: { subjectId: string; topicId: string | null }) {
    if (!task.topicId) return null;
    try {
      return await this.recomputeTopic(userId, task.subjectId, task.topicId);
    } catch (err) {
      // Прогресс — побочный эффект проверки; его сбой не должен ронять ответ ученику.
      this.logger.error(`Не удалось обновить прогресс темы ${task.topicId}: ${(err as Error).message}`);
      return null;
    }
  }
}
