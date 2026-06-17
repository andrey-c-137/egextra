import { Module } from '@nestjs/common';
import { ParentReportController } from './parent-report.controller';
import { ParentReportService } from './parent-report.service';

@Module({
  controllers: [ParentReportController],
  providers: [ParentReportService],
})
export class ParentReportModule {}
