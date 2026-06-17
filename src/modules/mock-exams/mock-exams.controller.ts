import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MockExamsService } from './mock-exams.service';

// Mock Exam Module — полные пробники: прохождение, ручной ввод, история, динамика
@ApiTags('mock-exams')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('mock-exams')
export class MockExamsController {
  constructor(private readonly mockExams: MockExamsService) {}

  @Get()
  list(@Query('subjectId') subjectId?: string) {
    return this.mockExams.list(subjectId);
  }

  @Get('history')
  history(@CurrentUser() user: AuthUser, @Query('subjectId') subjectId?: string) {
    return this.mockExams.history(user.id, subjectId);
  }

  @Post(':id/start')
  start(@Param('id') id: string) {
    return { mockExamId: id, startedAt: new Date().toISOString() };
  }

  @Post(':id/finish')
  finish(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body('answers') answers: Record<string, string>,
  ) {
    return this.mockExams.finish(user.id, id, answers ?? {});
  }

  // Ручной ввод результата ранее решённого пробника: { scores: { "<№задания>": балл } }.
  @Post(':id/manual')
  manual(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body('scores') scores: Record<string, number>,
  ) {
    return this.mockExams.manualResult(user.id, id, scores ?? {});
  }
}
