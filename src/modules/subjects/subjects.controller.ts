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

  @Get('topics/:id/tasks')
  tasks(@Param('id') id: string) {
    return this.prisma.task.findMany({ where: { topicId: id } });
  }
}
