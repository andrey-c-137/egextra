import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ParentReportService } from './parent-report.service';

// Parent Report Module — недельный отчёт родителю
@ApiTags('parent-report')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PARENT)
@Controller('parent-report')
export class ParentReportController {
  constructor(private readonly report: ParentReportService) {}

  @Get(':studentId/weekly')
  weekly(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string) {
    return this.report.weekly(user.id, studentId);
  }
}
