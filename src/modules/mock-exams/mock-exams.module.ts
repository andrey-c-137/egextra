import { Module } from '@nestjs/common';
import { ProgressModule } from '../progress/progress.module';
import { StudyPlanModule } from '../study-plan/study-plan.module';
import { MockExamsController } from './mock-exams.controller';
import { MockExamsService } from './mock-exams.service';

@Module({
  imports: [ProgressModule, StudyPlanModule],
  controllers: [MockExamsController],
  providers: [MockExamsService],
})
export class MockExamsModule {}
