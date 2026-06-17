import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OnboardingGuard } from '../../common/guards/onboarding.guard';
import { RequireActiveSubscriptionGuard } from '../../common/guards/subscription.guard';
import { ReadinessService } from './readiness.service';

// Analytics Module — готовность по заданиям и экзамену, прогноз, слабые/быстрые победы
@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RequireActiveSubscriptionGuard, OnboardingGuard)
@Controller('analytics')
export class ReadinessController {
  constructor(private readonly readiness: ReadinessService) {}

  // Сводка по всем предметам (для переключателя экзамена).
  @Get()
  overview(@CurrentUser() user: AuthUser) {
    return this.readiness.overview(user.id);
  }

  // Детальная аналитика по предмету.
  @Get('subject/:subjectId')
  subject(@CurrentUser() user: AuthUser, @Param('subjectId') subjectId: string) {
    return this.readiness.subjectAnalytics(user.id, subjectId);
  }
}
