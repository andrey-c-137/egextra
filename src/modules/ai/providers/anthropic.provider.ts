import Anthropic from '@anthropic-ai/sdk';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProvider } from '@prisma/client';
import {
  AiCompletionRequest,
  AiCompletionResult,
  AiProviderClient,
  AiTier,
} from './ai-provider.interface';

/** Цена за 1M токенов (USD), input/output. Сверяйте с актуальным прайсом Anthropic. */
const PRICING: Record<string, { in: number; out: number }> = {
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-haiku-4-5-20251001': { in: 1, out: 5 },
};

@Injectable()
export class AnthropicProvider implements AiProviderClient {
  readonly provider = AiProvider.ANTHROPIC;
  private readonly client: Anthropic | null;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  private modelForTier(tier: AiTier): string {
    const map: Record<AiTier, string> = {
      fast: this.config.get('AI_MODEL_FAST', 'claude-haiku-4-5-20251001'),
      smart: this.config.get('AI_MODEL_SMART', 'claude-sonnet-4-6'),
      heavy: this.config.get('AI_MODEL_HEAVY', 'claude-opus-4-8'),
    };
    return map[tier];
  }

  async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    if (!this.client) throw new Error('ANTHROPIC_API_KEY не задан');
    const model = this.modelForTier(req.tier);

    const content: Anthropic.MessageParam['content'] = req.imageBase64
      ? [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: req.imageBase64 } },
          { type: 'text', text: req.user },
        ]
      : req.user;

    const system = req.jsonMode
      ? `${req.system}\n\nОтвечай ТОЛЬКО валидным JSON, без markdown-обёртки.`
      : req.system;

    const res = await this.client.messages.create({
      model,
      max_tokens: req.maxTokens ?? 2048,
      system,
      messages: [{ role: 'user', content }],
    });

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    return {
      provider: this.provider,
      model,
      text,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
    };
  }

  estimateCost(model: string, inputTokens: number, outputTokens: number): number {
    const p = PRICING[model] ?? { in: 3, out: 15 };
    return (inputTokens * p.in + outputTokens * p.out) / 1_000_000;
  }
}
