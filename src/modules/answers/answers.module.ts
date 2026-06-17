import { Module } from '@nestjs/common';
import { ProgressModule } from '../progress/progress.module';
import { StudyPlanModule } from '../study-plan/study-plan.module';
import { AnswersService } from './answers.service';

@Module({
  imports: [ProgressModule, StudyPlanModule],
  providers: [AnswersService],
  exports: [AnswersService],
})
export class AnswersModule {}
