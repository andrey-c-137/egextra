import { Module } from '@nestjs/common';
import { StudyPlanController } from './study-plan.controller';

@Module({ controllers: [StudyPlanController] })
export class StudyPlanModule {}
