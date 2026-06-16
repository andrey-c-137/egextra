import { Module } from '@nestjs/common';
import { ParentReportController } from './parent-report.controller';

@Module({ controllers: [ParentReportController] })
export class ParentReportModule {}
