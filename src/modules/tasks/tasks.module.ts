import { Module } from '@nestjs/common';
import { AnswersModule } from '../answers/answers.module';
import { TasksController } from './tasks.controller';

@Module({
  imports: [AnswersModule],
  controllers: [TasksController],
})
export class TasksModule {}
