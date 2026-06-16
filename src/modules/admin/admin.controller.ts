import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PrismaService } from '../../prisma/prisma.service';

// Admin Module — управление контентом, пользователями, тарифами, промптами, ИИ-логами (7.5)
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('subjects')
  createSubject(@Body() body: { name: string; examType?: string }) {
    return this.prisma.subject.create({ data: { name: body.name, examType: body.examType ?? 'EGE' } });
  }

  @Post('topics')
  createTopic(@Body() body: Record<string, unknown>) {
    return this.prisma.topic.create({ data: body as never });
  }

  @Post('tasks')
  createTask(@Body() body: Record<string, unknown>) {
    return this.prisma.task.create({ data: body as never });
  }

  @Get('users')
  users() {
    return this.prisma.user.findMany({
      select: { id: true, email: true, role: true, createdAt: true },
      take: 100,
    });
  }

  // ИИ-логи: контроль стоимости и качества (раздел 7.6).
  @Get('ai-requests')
  aiRequests() {
    return this.prisma.aiRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }

  @Get('stats')
  async stats() {
    const [users, answers, aiCost] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.userAnswer.count(),
      this.prisma.aiRequest.aggregate({ _sum: { estimatedCost: true } }),
    ]);
    return { users, answers, totalAiCostUsd: aiCost._sum.estimatedCost ?? 0 };
  }

  // Версионируемые промпты для AI Orchestrator.
  @Patch('prompts/:id')
  updatePrompt(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.prisma.promptTemplate.update({ where: { id }, data: body as never });
  }
}
