import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProvider, AiRequestStatus, AiRequestType } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AnthropicProvider } from './providers/anthropic.provider';
import {
  AiCompletionRequest,
  AiProviderClient,
  AiTier,
} from './providers/ai-provider.interface';
import { GroqProvider } from './providers/groq.provider';
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
    groq: GroqProvider,
  ) {
    this.providers = {
      [AiProvider.ANTHROPIC]: anthropic,
      [AiProvider.OPENAI]: openai,
      [AiProvider.GROQ]: groq,
    };
  }

  private defaultProvider(): AiProvider {
    switch (this.config.get<string>('AI_DEFAULT_PROVIDER', 'anthropic')) {
      case 'openai':
        return AiProvider.OPENAI;
      case 'groq':
        return AiProvider.GROQ;
      default:
        return AiProvider.ANTHROPIC;
    }
  }

  /**
   * Выбор провайдера: дефолт из конфига, с фолбэком на сконфигурированный.
   * Для vision (фото) Groq на free-плане не подходит — берём только vision-провайдеры.
   */
  private pickProvider(needsVision = false): AiProviderClient {
    const visionCapable = new Set<AiProvider>([AiProvider.ANTHROPIC, AiProvider.OPENAI]);
    const eligible = (p: AiProviderClient) =>
      p.isConfigured() && (!needsVision || visionCapable.has(p.provider));

    const preferred = this.providers[this.defaultProvider()];
    if (eligible(preferred)) return preferred;

    const fallback = Object.values(this.providers).find(eligible);
    if (!fallback) {
      throw new BadRequestException(
        needsVision
          ? 'Для фото-задания нужен vision-провайдер (ANTHROPIC_API_KEY или OPENAI_API_KEY)'
          : 'Не настроен ни один AI-провайдер (ANTHROPIC_API_KEY / OPENAI_API_KEY / GROQ_API_KEY)',
      );
    }
    if (fallback !== preferred) {
      this.logger.warn(`Провайдер ${preferred.provider} не подходит, использую ${fallback.provider}`);
    }
    return fallback;
  }

  /** Биллингуемые типы запросов — считаются в дневной лимит тарифа. */
  private static readonly BILLABLE: ReadonlySet<AiRequestType> = new Set([
    AiRequestType.CHECK_ESSAY,
    AiRequestType.CHECK_ANSWER,
    AiRequestType.EXPLAIN_TASK,
    AiRequestType.PHOTO_TASK,
    AiRequestType.GENERATE_PLAN,
  ]);

  /**
   * Проверка дневного лимита ИИ-проверок по тарифу (subscription.limits.aiChecksPerDay).
   * Кеш-хиты сюда не доходят (проверяется раньше), повторно не списываем.
   */
  private async assertQuota(userId: string, type: AiRequestType): Promise<void> {
    if (!AiOrchestratorService.BILLABLE.has(type)) return;

    const sub = await this.prisma.subscription.findFirst({
      where: { userId },
      orderBy: { startedAt: 'desc' },
    });
    const limits = (sub?.limits ?? {}) as { aiChecksPerDay?: number };
    const limit = typeof limits.aiChecksPerDay === 'number' ? limits.aiChecksPerDay : 3;
    if (limit < 0) return; // отрицательное = безлимит

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const usedToday = await this.prisma.aiRequest.count({
      where: {
        userId,
        requestType: { in: [...AiOrchestratorService.BILLABLE] },
        status: { in: [AiRequestStatus.DONE, AiRequestStatus.PROCESSING] },
        createdAt: { gte: startOfDay },
      },
    });

    if (usedToday >= limit) {
      throw new HttpException(
        `Дневной лимит ИИ-проверок исчерпан (${limit}/день на тарифе ${sub?.planName ?? 'FREE'}). ` +
          'Оформите подписку для увеличения лимита.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
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

    // Лимит тарифа проверяем только для реальных (не кешированных) платных запросов.
    if (params.userId) await this.assertQuota(params.userId, params.type);

    const provider = this.pickProvider(Boolean(params.imageBase64));
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
