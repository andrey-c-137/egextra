import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TopicStatus } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';

// Progress Module — статистика, слабые темы, точность, streak (эндпойнты Progress из 7.5)
@ApiTags('progress')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('progress')
export class ProgressController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  overview(@CurrentUser() user: AuthUser) {
    return this.prisma.topicProgress.findMany({
      where: { userId: user.id },
      orderBy: { accuracyPercent: 'asc' },
      include: {
        topic: { select: { name: true, egeBlock: true } },
        subject: { select: { name: true, code: true } },
      },
    });
  }

  @Get('weak-topics')
  weakTopics(@CurrentUser() user: AuthUser) {
    return this.prisma.topicProgress.findMany({
      where: { userId: user.id, status: { in: [TopicStatus.RED, TopicStatus.YELLOW] } },
      orderBy: { accuracyPercent: 'asc' },
      include: {
        topic: { select: { name: true, egeBlock: true } },
        subject: { select: { name: true, code: true } },
      },
    });
  }

  @Get('streak')
  async streak(@CurrentUser() user: AuthUser) {
    // Реальный streak: число подряд идущих дней с активностью, заканчивая сегодня/вчера.
    const answers = await this.prisma.userAnswer.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (answers.length === 0) return { streakDays: 0, lastActivityAt: null };

    const dayKey = (d: Date) => {
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      return x.getTime();
    };
    const days = [...new Set(answers.map((a) => dayKey(a.createdAt)))].sort((a, b) => b - a);
    const DAY = 86_400_000;
    const today = dayKey(new Date());

    // Streak активен, только если последняя активность была сегодня или вчера.
    let streak = 0;
    if (days[0] === today || days[0] === today - DAY) {
      streak = 1;
      for (let i = 1; i < days.length; i++) {
        if (days[i - 1] - days[i] === DAY) streak++;
        else break;
      }
    }
    return { streakDays: streak, lastActivityAt: answers[0].createdAt };
  }

  @Get('summary')
  async summary(@CurrentUser() user: AuthUser) {
    const [answers, correct] = await Promise.all([
      this.prisma.userAnswer.count({ where: { userId: user.id } }),
      this.prisma.userAnswer.count({ where: { userId: user.id, isCorrect: true } }),
    ]);
    return { totalAnswers: answers, correct, accuracy: answers ? correct / answers : 0 };
  }
}
