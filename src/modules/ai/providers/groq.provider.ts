import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProvider } from '@prisma/client';
import OpenAI from 'openai';
import {
  AiCompletionRequest,
  AiCompletionResult,
  AiProviderClient,
  AiTier,
} from './ai-provider.interface';

/**
 * Groq — OpenAI-совместимый API (base URL https://api.groq.com/openai/v1).
 * Дёшево и быстро, хорош для тестового запуска MVP.
 * Цена за 1M токенов (USD), input/output — сверяйте с https://groq.com/pricing/.
 */
const PRICING: Record<string, { in: number; out: number }> = {
  'llama-3.3-70b-versatile': { in: 0.59, out: 0.79 },
  'llama-3.1-8b-instant': { in: 0.05, out: 0.08 },
  'openai/gpt-oss-120b': { in: 0.15, out: 0.6 },
};

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

@Injectable()
export class GroqProvider implements AiProviderClient {
  readonly provider = AiProvider.GROQ;
  private readonly client: OpenAI | null;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('GROQ_API_KEY');
    this.client = apiKey ? new OpenAI({ apiKey, baseURL: GROQ_BASE_URL }) : null;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  private modelForTier(tier: AiTier): string {
    // У Groq нет бесплатного vision, поэтому heavy = та же сильная текстовая модель.
    const smart = this.config.get('GROQ_MODEL_SMART', 'llama-3.3-70b-versatile');
    const fast = this.config.get('GROQ_MODEL_FAST', 'llama-3.1-8b-instant');
    return tier === 'fast' ? fast : smart;
  }

  async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    if (!this.client) throw new Error('GROQ_API_KEY не задан');
    if (req.imageBase64) {
      // На free-плане Groq vision недоступен — фото-разбор маршрутизируем на Claude/OpenAI.
      throw new Error('Groq (free) не поддерживает vision: используйте Anthropic/OpenAI для photo-task');
    }
    const model = this.modelForTier(req.tier);

    const res = await this.client.chat.completions.create({
      model,
      max_tokens: req.maxTokens ?? 2048,
      response_format: req.jsonMode ? { type: 'json_object' } : undefined,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
    });

    return {
      provider: this.provider,
      model,
      text: res.choices[0]?.message?.content ?? '',
      inputTokens: res.usage?.prompt_tokens ?? 0,
      outputTokens: res.usage?.completion_tokens ?? 0,
    };
  }

  estimateCost(model: string, inputTokens: number, outputTokens: number): number {
    const p = PRICING[model] ?? { in: 0.59, out: 0.79 };
    return (inputTokens * p.in + outputTokens * p.out) / 1_000_000;
  }
}
