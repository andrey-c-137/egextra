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

/** Цена за 1M токенов (USD), input/output. Сверяйте с актуальным прайсом OpenAI. */
const PRICING: Record<string, { in: number; out: number }> = {
  'gpt-4o': { in: 2.5, out: 10 },
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
};

@Injectable()
export class OpenAiProvider implements AiProviderClient {
  readonly provider = AiProvider.OPENAI;
  private readonly client: OpenAI | null;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  private modelForTier(tier: AiTier): string {
    const smart = this.config.get('OPENAI_MODEL_SMART', 'gpt-4o');
    const fast = this.config.get('OPENAI_MODEL_FAST', 'gpt-4o-mini');
    return tier === 'fast' ? fast : smart;
  }

  async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    if (!this.client) throw new Error('OPENAI_API_KEY не задан');
    const model = this.modelForTier(req.tier);

    const userContent: OpenAI.Chat.ChatCompletionContentPart[] = req.imageBase64
      ? [
          { type: 'text', text: req.user },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${req.imageBase64}` } },
        ]
      : [{ type: 'text', text: req.user }];

    const res = await this.client.chat.completions.create({
      model,
      max_tokens: req.maxTokens ?? 2048,
      response_format: req.jsonMode ? { type: 'json_object' } : undefined,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: userContent },
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
    const p = PRICING[model] ?? { in: 2.5, out: 10 };
    return (inputTokens * p.in + outputTokens * p.out) / 1_000_000;
  }
}
