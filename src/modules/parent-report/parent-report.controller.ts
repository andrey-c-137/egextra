import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

// Parent Report Module — недельный отчёт родителю (на MVP можно отложить)
@ApiTags('parent-report')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PARENT)
@Controller('parent-report')
export class ParentReportController {
  @Get(':studentId/weekly')
  weekly(@Param('studentId') studentId: string) {
    // TODO: занятия, темы, слабые места, прогноз, план за неделю.
    return { studentId, week: [], summary: null };
  }
}
