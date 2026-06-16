import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

// Recommendation Module — что делать сегодня/на неделе на основе прогресса
@ApiTags('recommendations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('recommendations')
export class RecommendationsController {
  @Get('today')
  today(@CurrentUser() user: AuthUser) {
    // TODO: собрать слабые темы + план дня → краткие действия (fast-модель).
    return { userId: user.id, actions: [] };
  }
}
