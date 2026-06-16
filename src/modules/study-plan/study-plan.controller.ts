import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AiRequestType } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OnboardingGuard } from '../../common/guards/onboarding.guard';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { PrismaService } from '../../prisma/prisma.service';

// Study Plan Module — генерация и перестройка персонального плана (эндпойнты Study Plan из 7.5)
@ApiTags('study-plan')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OnboardingGuard)
@Controller('study-plan')
export class StudyPlanController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiOrchestratorService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.prisma.studyPlan.findMany({ where: { userId: user.id }, include: { days: true } });
  }

  @Get('today')
  async today(@CurrentUser() user: AuthUser) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.prisma.studyPlanDay.findMany({
      where: { plan: { userId: user.id }, date: today },
    });
  }

  @Post('generate')
  async generate(@CurrentUser() user: AuthUser, @Body('subjectId') subjectId: string) {
    const profile = await this.prisma.studentProfile.findUnique({ where: { userId: user.id } });
    // Цель/уровень теперь хранятся per-subject в StudentSubject.
    const studentSubject = profile
      ? await this.prisma.studentSubject.findUnique({
          where: { profileId_subjectId: { profileId: profile.id, subjectId } },
        })
      : null;
    const { data } = await this.ai.run({
      userId: user.id,
      type: AiRequestType.GENERATE_PLAN,
      system:
        'Ты — методист ЕГЭ. Составь персональный план подготовки по дням с учётом цели, даты и доступного времени. Верни JSON: {days:[{date, topics[], tasks[], estimated_minutes}], confidence_score}.',
      user: `Предмет: ${subjectId}; цель: ${studentSubject?.targetScore ?? '—'}; дата экзамена: ${
        profile?.examDate ?? '—'
      }; минут/день: ${profile?.dailyMinutes ?? '—'}; текущий уровень: ${studentSubject?.currentScore ?? '—'}`,
      jsonMode: true,
    });
    // TODO: распарсить data.days и сохранить StudyPlan + StudyPlanDay[]
    return data;
  }

  @Post('rebuild')
  rebuild(@CurrentUser() user: AuthUser, @Body('planId') planId: string) {
    // Перестройка после пробника / пропусков / частых ошибок (раздел 8, шаг 12).
    return { planId, status: 'rebuild-queued', userId: user.id };
  }

  @Patch('day/:id')
  updateDay(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.prisma.studyPlanDay.update({ where: { id }, data: body as never });
  }
}
