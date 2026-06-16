import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AnswersService } from '../answers/answers.service';
import { PrismaService } from '../../prisma/prisma.service';

// Task Bank Module — эндпойнты Tasks из 7.5
@ApiTags('tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly answers: AnswersService,
  ) {}

  @Get()
  list(@Query('subjectId') subjectId?: string, @Query('topicId') topicId?: string) {
    return this.prisma.task.findMany({
      where: { subjectId: subjectId || undefined, topicId: topicId || undefined },
      take: 50,
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.prisma.task.findUnique({ where: { id } });
  }

  @Post(':id/start')
  start(@Param('id') id: string) {
    return { taskId: id, startedAt: new Date().toISOString() };
  }

  @Post(':id/answer')
  answer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body('answer') answer: string,
  ) {
    return this.answers.submit(user.id, id, answer);
  }
}
