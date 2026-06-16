import { Module } from '@nestjs/common';
import { ScoreForecastController } from './score-forecast.controller';

@Module({ controllers: [ScoreForecastController] })
export class ScoreForecastModule {}
