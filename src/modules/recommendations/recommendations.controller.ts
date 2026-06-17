import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequireActiveSubscriptionGuard } from '../../common/guards/subscription.guard';
import { RecommendationsService } from './recommendations.service';

// Recommendation Module — что делать сегодня/на неделе на основе прогресса
@ApiTags('recommendations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RequireActiveSubscriptionGuard)
@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly recommendations: RecommendationsService) {}

  @Get('today')
  today(@CurrentUser() user: AuthUser) {
    return this.recommendations.today(user.id);
  }
}
