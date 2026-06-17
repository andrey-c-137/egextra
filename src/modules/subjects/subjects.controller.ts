import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';

// Subject & Topic Module — эндпойнты Subjects из 7.5
@ApiTags('subjects')
@Controller()
export class SubjectsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('subjects')
  subjects() {
    return this.prisma.subject.findMany({ where: { isActive: true } });
  }

  @Get('subjects/:id/topics')
  topics(@Param('id') id: string) {
    return this.prisma.topic.findMany({
      where: { subjectId: id },
      orderBy: { orderIndex: 'asc' },
    });
  }

  // Задания темы = активные задания предмета, чьи номера входят в тему (Topic.egeTaskNumbers).
  // На номер задания возвращаем один представитель (остальные варианты — «решать похожие»).
  @Get('topics/:id/tasks')
  async tasks(@Param('id') id: string) {
    const topic = await this.prisma.topic.findUnique({ where: { id } });
    if (!topic) return [];
    const tasks = await this.prisma.task.findMany({
      where: {
        subjectId: topic.subjectId,
        isActive: true,
        egeTaskNumber: { in: topic.egeTaskNumbers },
      },
      orderBy: [{ egeTaskNumber: 'asc' }, { id: 'asc' }],
    });
    // по одному заданию на номер
    const byNumber = new Map<number, (typeof tasks)[number]>();
    for (const t of tasks) if (t.egeTaskNumber != null && !byNumber.has(t.egeTaskNumber)) byNumber.set(t.egeTaskNumber, t);
    return [...byNumber.values()];
  }
}
