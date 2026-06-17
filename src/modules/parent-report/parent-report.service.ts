import { ForbiddenException, Injectable } from '@nestjs/common';
import { TopicStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Parent Report — недельная сводка по ученику для родителя.
 * Доступ только при подтверждённой связи parent_links (isApproved).
 */
@Injectable()
export class ParentReportService {
  constructor(private readonly prisma: PrismaService) {}

  async weekly(parentId: string, studentId: string) {
    const link = await this.prisma.parentLink.findUnique({
      where: { parentId_studentId: { parentId, studentId } },
    });
    if (!link || !link.isApproved) {
      throw new ForbiddenException('Нет подтверждённого доступа к этому ученику');
    }

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [answers, correct, weakTopics, mockResults, activeDays] = await Promise.all([
      this.prisma.userAnswer.count({ where: { userId: studentId, createdAt: { gte: weekAgo } } }),
      this.prisma.userAnswer.count({
        where: { userId: studentId, isCorrect: true, createdAt: { gte: weekAgo } },
      }),
      this.prisma.topicProgress.findMany({
        where: { userId: studentId, status: { in: [TopicStatus.RED, TopicStatus.YELLOW] } },
        orderBy: { accuracyPercent: 'asc' },
        take: 5,
        include: { topic: { select: { name: true } } },
      }),
      this.prisma.mockExamResult.findMany({
        where: { userId: studentId, createdAt: { gte: weekAgo } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.userAnswer.findMany({
        where: { userId: studentId, createdAt: { gte: weekAgo } },
        select: { createdAt: true },
      }),
    ]);

    // Дни недели, в которые была активность (для оценки регулярности).
    const distinctDays = new Set(activeDays.map((a) => a.createdAt.toISOString().slice(0, 10)));

    return {
      studentId,
      period: { from: weekAgo.toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) },
      summary: {
        answers,
        correct,
        accuracy: answers ? Math.round((correct / answers) * 100) / 100 : 0,
        activeDays: distinctDays.size,
        mockExamsTaken: mockResults.length,
      },
      weakTopics: weakTopics.map((t) => ({
        name: t.topic.name,
        accuracy: Math.round(t.accuracyPercent),
        status: t.status,
      })),
      mockExams: mockResults.map((m) => ({
        primaryScore: m.primaryScore,
        testScore: m.testScore,
        date: m.createdAt.toISOString().slice(0, 10),
      })),
    };
  }
}
