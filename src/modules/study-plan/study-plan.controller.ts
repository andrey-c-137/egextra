import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OnboardingGuard } from '../../common/guards/onboarding.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { StudyPlanService } from './study-plan.service';

// Study Plan Module — генерация и перестройка персонального плана (эндпойнты Study Plan из 7.5)
@ApiTags('study-plan')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OnboardingGuard)
@Controller('study-plan')
export class StudyPlanController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: StudyPlanService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.plans.list(user.id);
  }

  @Get('today')
  today(@CurrentUser() user: AuthUser) {
    return this.plans.today(user.id);
  }

  @Post('generate')
  generate(@CurrentUser() user: AuthUser, @Body('subjectId') subjectId: string) {
    return this.plans.generate(user.id, subjectId);
  }

  @Post('rebuild')
  rebuild(@CurrentUser() user: AuthUser, @Body('subjectId') subjectId: string) {
    // Перестройка после пробника / пропусков / частых ошибок (раздел 8, шаг 12):
    // перегенерируем план с учётом текущего прогресса.
    return this.plans.generate(user.id, subjectId);
  }

  @Patch('day/:id')
  updateDay(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.prisma.studyPlanDay.update({ where: { id }, data: body as never });
  }
}
