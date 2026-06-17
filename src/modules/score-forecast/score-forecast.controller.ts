import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ScoreForecastService } from './score-forecast.service';

// Score Forecast Module — диапазон текущих баллов и вероятность достижения цели
@ApiTags('score-forecast')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('score-forecast')
export class ScoreForecastController {
  constructor(private readonly forecastService: ScoreForecastService) {}

  @Get()
  forecast(@CurrentUser() user: AuthUser) {
    return this.forecastService.forecast(user.id);
  }
}
