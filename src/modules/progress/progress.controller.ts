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
    return this.prisma.topicProgress.findMany({ where: { userId: user.id } });
  }

  @Get('weak-topics')
  weakTopics(@CurrentUser() user: AuthUser) {
    return this.prisma.topicProgress.findMany({
      where: { userId: user.id, status: { in: [TopicStatus.RED, TopicStatus.YELLOW] } },
      orderBy: { accuracyPercent: 'asc' },
    });
  }

  @Get('streak')
  async streak(@CurrentUser() user: AuthUser) {
    // Заглушка: реальный streak считается по дням активности (user_answers).
    const last = await this.prisma.userAnswer.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    return { streakDays: 0, lastActivityAt: last?.createdAt ?? null };
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
