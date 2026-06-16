import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProvider, AiRequestType } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AnthropicProvider } from './providers/anthropic.provider';
import {
  AiCompletionRequest,
  AiProviderClient,
  AiTier,
} from './providers/ai-provider.interface';
import { OpenAiProvider } from './providers/openai.provider';

/** Маршрутизация: какой «класс» модели нужен под каждый тип задачи. */
const TIER_BY_TYPE: Record<AiRequestType, AiTier> = {
  CHECK_ANSWER: 'fast',
  RECOMMENDATION: 'fast',
  EXPLAIN_TASK: 'smart',
  CHECK_ESSAY: 'smart',
  GENERATE_PLAN: 'smart',
  PHOTO_TASK: 'heavy',
};

export interface OrchestrateParams {
  userId?: string;
  type: AiRequestType;
  system: string;
  user: string;
  jsonMode?: boolean;
  imageBase64?: string;
  /** Кеш одинаковых разборов (напр. объяснение одного задания). */
  cacheable?: boolean;
}

@Injectable()
export class AiOrchestratorService {
  private readonly logger = new Logger(AiOrchestratorService.name);
  private readonly providers: Record<AiProvider, AiProviderClient>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    anthropic: AnthropicProvider,
    openai: OpenAiProvider,
  ) {
    this.providers = {
      [AiProvider.ANTHROPIC]: anthropic,
      [AiProvider.OPENAI]: openai,
    };
  }

  /** Выбор провайдера: дефолт из конфига, с фолбэком на сконфигурированный. */
  private pickProvider(): AiProviderClient {
    const preferred = (
      this.config.get<string>('AI_DEFAULT_PROVIDER', 'anthropic') === 'openai'
        ? AiProvider.OPENAI
        : AiProvider.ANTHROPIC
    );
    if (this.providers[preferred].isConfigured()) return this.providers[preferred];

    const fallback = Object.values(this.providers).find((p) => p.isConfigured());
    if (!fallback) {
      throw new BadRequestException('Не настроен ни один AI-провайдер (ANTHROPIC_API_KEY / OPENAI_API_KEY)');
    }
    this.logger.warn(`Провайдер ${preferred} не настроен, использую ${fallback.provider}`);
    return fallback;
  }

  async run<T = unknown>(params: OrchestrateParams): Promise<{ data: T; requestId: string }> {
    const tier = TIER_BY_TYPE[params.type];
    const cacheKey = params.cacheable ? this.cacheKey(params) : null;

    // Кеш: повторяемые объяснения не гоняем через модель заново.
    if (cacheKey) {
      const cached = await this.prisma.aiRequest.findFirst({
        where: { cacheKey, status: 'DONE' },
        orderBy: { createdAt: 'desc' },
      });
      if (cached?.outputPayload) {
        return { data: cached.outputPayload as T, requestId: cached.id };
      }
    }

    const provider = this.pickProvider();
    const req: AiCompletionRequest = {
      system: params.system,
      user: params.user,
      tier,
      jsonMode: params.jsonMode,
      imageBase64: params.imageBase64,
    };

    // Стартовая запись лога (раздел 7.6: логировать каждый запрос).
    const log = await this.prisma.aiRequest.create({
      data: {
        userId: params.userId,
        requestType: params.type,
        provider: provider.provider,
        model: '(pending)',
        inputPayload: { system: params.system, user: params.user.slice(0, 4000) },
        status: 'PROCESSING',
        cacheKey,
      },
    });

    try {
      const result = await provider.complete(req);
      const data = params.jsonMode ? this.parseJson<T>(result.text) : (result.text as unknown as T);
      const cost = provider.estimateCost(result.model, result.inputTokens, result.outputTokens);
      const confidence =
        params.jsonMode && data && typeof data === 'object'
          ? (data as Record<string, unknown>).confidence_score
          : undefined;

      await this.prisma.aiRequest.update({
        where: { id: log.id },
        data: {
          model: result.model,
          outputPayload: data as object,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          estimatedCost: cost,
          confidenceScore: typeof confidence === 'number' ? confidence : null,
          status: 'DONE',
          completedAt: new Date(),
        },
      });

      return { data, requestId: log.id };
    } catch (err) {
      await this.prisma.aiRequest.update({
        where: { id: log.id },
        data: { status: 'FAILED', error: (err as Error).message, completedAt: new Date() },
      });
      this.logger.error(`AI запрос ${params.type} упал: ${(err as Error).message}`);
      throw err;
    }
  }

  private parseJson<T>(text: string): T {
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim();
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      throw new BadRequestException('Модель вернула невалидный JSON');
    }
  }

  private cacheKey(params: OrchestrateParams): string {
    return createHash('sha256')
      .update(`${params.type}:${params.system}:${params.user}`)
      .digest('hex');
  }
}
