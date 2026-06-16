import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

// Score Forecast Module — диапазон текущих баллов и вероятность достижения цели
@ApiTags('score-forecast')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('score-forecast')
export class ScoreForecastController {
  @Get()
  forecast(@CurrentUser() user: AuthUser) {
    // TODO: оценка по точности тем + весам заданий → диапазон [min, max] и P(goal).
    return { userId: user.id, range: { min: 0, max: 0 }, goalProbability: 0 };
  }
}
