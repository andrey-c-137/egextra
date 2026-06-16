import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AiRequestType } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AiOrchestratorService } from './ai-orchestrator.service';
import { CheckEssayDto, PhotoTaskDto } from './dto/ai.dto';
import {
  buildEssayUserPrompt,
  ESSAY_CHECK_PROMPT_KEY,
  ESSAY_CHECK_SYSTEM,
} from './prompts/essay-check.prompt';
import { PromptsService } from './prompts/prompts.service';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(
    private readonly orchestrator: AiOrchestratorService,
    private readonly prompts: PromptsService,
  ) {}

  // Ключевая MVP-фича: проверка сочинения по критериям ФИПИ.
  // Системный промпт берётся из prompt_templates (key=essay_check_ru) с фолбэком на дефолт.
  @Post('check-essay')
  async checkEssay(@CurrentUser() user: AuthUser, @Body() dto: CheckEssayDto) {
    const system = await this.prompts.getSystem(ESSAY_CHECK_PROMPT_KEY, ESSAY_CHECK_SYSTEM);
    return this.orchestrator.run({
      userId: user.id,
      type: AiRequestType.CHECK_ESSAY,
      system,
      user: buildEssayUserPrompt(dto.essay, dto.topic),
      jsonMode: true,
    });
  }

  // Фото-задание → heavy-модель с vision. В проде уходит в очередь BullMQ.
  @Post('photo-task')
  photoTask(@CurrentUser() user: AuthUser, @Body() dto: PhotoTaskDto) {
    return this.orchestrator.run({
      userId: user.id,
      type: AiRequestType.PHOTO_TASK,
      system:
        'Ты — репетитор ЕГЭ. Разбери задание с фото пошагово, объясни ход решения, не выдавай только ответ. Верни JSON с полями steps, answer, topics, confidence_score.',
      user: dto.question ?? 'Разбери это задание.',
      imageBase64: dto.imageBase64,
      jsonMode: true,
    });
  }

  // Остальные эндпоинты (check-answer, explain-task, generate-plan) делегируются
  // профильным модулям (AnswersModule, TasksModule, StudyPlanModule),
  // которые внутри вызывают AiOrchestratorService.
}
