import { Module } from '@nestjs/common';
import { StudyPlanModule } from '../study-plan/study-plan.module';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';

@Module({
  imports: [StudyPlanModule],
  controllers: [RecommendationsController],
  providers: [RecommendationsService],
})
export class RecommendationsModule {}
