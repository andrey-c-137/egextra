import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ExamType } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SetSubjectsDto, SetTrackDto } from './dto/onboarding.dto';
import { OnboardingService } from './onboarding.service';

// Обязательный онбординг: welcome → register → шаг1 (трек+класс) → шаг2 (экзамены) → completed
@ApiTags('onboarding')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  // Текущее состояние онбординга — фронт знает, какой экран показать.
  @Get('state')
  state(@CurrentUser() user: AuthUser) {
    return this.onboarding.getState(user.id);
  }

  // Каталог экзаменов трека для экрана выбора.
  @Get('catalog')
  catalog(@Query('examType') examType: ExamType) {
    return this.onboarding.catalog(examType);
  }

  // Шаг 1: трек ОГЭ/ЕГЭ + класс.
  @Post('track')
  setTrack(@CurrentUser() user: AuthUser, @Body() dto: SetTrackDto) {
    return this.onboarding.setTrack(user.id, dto);
  }

  // Шаг 2: выбор экзаменов с целями (завершает онбординг).
  @Post('subjects')
  setSubjects(@CurrentUser() user: AuthUser, @Body() dto: SetSubjectsDto) {
    return this.onboarding.setSubjects(user.id, dto.subjects);
  }
}
