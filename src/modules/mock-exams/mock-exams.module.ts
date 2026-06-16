import { Module } from '@nestjs/common';
import { MockExamsController } from './mock-exams.controller';

@Module({ controllers: [MockExamsController] })
export class MockExamsModule {}
