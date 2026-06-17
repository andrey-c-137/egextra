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

  // «Решать похожие» — другое активное задание с тем же номером (другой вариант).
  @Get(':id/similar')
  async similar(@Param('id') id: string) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) return null;
    const pool = await this.prisma.task.findMany({
      where: {
        subjectId: task.subjectId,
        egeTaskNumber: task.egeTaskNumber,
        isActive: true,
        id: { not: id },
      },
    });
    if (!pool.length) return task; // других вариантов нет — вернём то же
    return pool[Math.floor(Math.random() * pool.length)];
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

  // Краткое ИИ-пояснение по заданию (в чём ошибка / как проверить / верный ход).
  @Post(':id/explain')
  explain(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body('studentAnswer') studentAnswer?: string,
  ) {
    return this.answers.explain(user.id, id, studentAnswer);
  }
}
