import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AiRequestType, ExamType, Role } from '@prisma/client';
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
  createSubject(
    @Body()
    body: {
      code: string;
      name: string;
      examType: ExamType;
      isMandatory?: boolean;
      orderIndex?: number;
    },
  ) {
    return this.prisma.subject.create({
      data: {
        code: body.code,
        name: body.name,
        examType: body.examType,
        isMandatory: body.isMandatory ?? false,
        orderIndex: body.orderIndex ?? 0,
      },
    });
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

  // --- Версионируемые промпты для AI Orchestrator ---

  @Get('prompts')
  prompts(@Query('key') key?: string) {
    return this.prisma.promptTemplate.findMany({
      where: { key: key || undefined },
      orderBy: [{ key: 'asc' }, { version: 'desc' }],
    });
  }

  // Создать новую версию промпта (автоинкремент version по ключу).
  @Post('prompts')
  async createPrompt(
    @Body() body: { key: string; type: AiRequestType; template: string; activate?: boolean },
  ) {
    const last = await this.prisma.promptTemplate.findFirst({
      where: { key: body.key },
      orderBy: { version: 'desc' },
    });
    const version = (last?.version ?? 0) + 1;

    if (body.activate) {
      await this.prisma.promptTemplate.updateMany({
        where: { key: body.key },
        data: { isActive: false },
      });
    }
    return this.prisma.promptTemplate.create({
      data: {
        key: body.key,
        version,
        type: body.type,
        template: body.template,
        isActive: body.activate ?? false,
      },
    });
  }

  // Сделать версию активной (и выключить остальные версии этого ключа).
  @Patch('prompts/:id/activate')
  async activatePrompt(@Param('id') id: string) {
    const tpl = await this.prisma.promptTemplate.findUnique({ where: { id } });
    if (!tpl) return { error: 'not found' };
    await this.prisma.promptTemplate.updateMany({
      where: { key: tpl.key },
      data: { isActive: false },
    });
    return this.prisma.promptTemplate.update({ where: { id }, data: { isActive: true } });
  }

  @Patch('prompts/:id')
  updatePrompt(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.prisma.promptTemplate.update({ where: { id }, data: body as never });
  }
}
