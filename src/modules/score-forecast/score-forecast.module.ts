import { Module } from '@nestjs/common';
import { ScoreForecastController } from './score-forecast.controller';
import { ScoreForecastService } from './score-forecast.service';

@Module({
  controllers: [ScoreForecastController],
  providers: [ScoreForecastService],
})
export class ScoreForecastModule {}
