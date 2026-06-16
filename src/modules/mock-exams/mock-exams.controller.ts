import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';

// Mock Exam Module — пробники, таймер, результат, диагноз (эндпойнты Mock Exams из 7.5)
@ApiTags('mock-exams')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('mock-exams')
export class MockExamsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.mockExam.findMany({ where: { isActive: true } });
  }

  @Post(':id/start')
  start(@Param('id') id: string) {
    return { mockExamId: id, startedAt: new Date().toISOString() };
  }

  @Post(':id/answer')
  answer(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return { mockExamId: id, accepted: true, ...body };
  }

  @Post(':id/finish')
  async finish(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body('answers') answers: Record<string, string>,
  ) {
    // TODO: посчитать первичный балл, диагноз и слабые темы → запустить rebuild плана (раздел 8).
    return this.prisma.mockExamResult.create({
      data: { userId: user.id, mockExamId: id, answers, primaryScore: 0, weakTopics: [] },
    });
  }
}
