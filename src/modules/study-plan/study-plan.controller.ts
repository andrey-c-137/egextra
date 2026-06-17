import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OnboardingGuard } from '../../common/guards/onboarding.guard';
import { RequireActiveSubscriptionGuard } from '../../common/guards/subscription.guard';
import { StudyPlanService } from './study-plan.service';

// Study Plan Module — календарный план подготовки (раздел 7)
@ApiTags('study-plan')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RequireActiveSubscriptionGuard, OnboardingGuard)
@Controller('study-plan')
export class StudyPlanController {
  constructor(private readonly plans: StudyPlanService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.plans.list(user.id);
  }

  @Get('today')
  today(@CurrentUser() user: AuthUser) {
    return this.plans.today(user.id);
  }

  // subjectId не указан → пересобрать планы по всем предметам.
  @Post('generate')
  generate(@CurrentUser() user: AuthUser, @Body('subjectId') subjectId?: string) {
    return this.plans.generate(user.id, subjectId);
  }

  @Post('rebuild')
  rebuild(@CurrentUser() user: AuthUser, @Body('subjectId') subjectId?: string) {
    return this.plans.generate(user.id, subjectId);
  }

  // Действие над задачей дня: выполнить / пропустить / перенести.
  @Patch('item/:dayId/:itemId')
  updateItem(
    @CurrentUser() user: AuthUser,
    @Param('dayId') dayId: string,
    @Param('itemId') itemId: string,
    @Body('action') action: 'done' | 'skip' | 'reschedule',
  ) {
    return this.plans.updateItem(user.id, dayId, itemId, action);
  }
}
