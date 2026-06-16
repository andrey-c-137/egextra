import { AiProvider } from '@prisma/client';

export type AiTier = 'fast' | 'smart' | 'heavy';

export interface AiCompletionRequest {
  system: string;
  user: string;
  tier: AiTier;
  /** Просим модель вернуть строгий JSON. */
  jsonMode?: boolean;
  maxTokens?: number;
  /** base64-изображение для фото-заданий (если провайдер поддерживает vision). */
  imageBase64?: string;
}

export interface AiCompletionResult {
  provider: AiProvider;
  model: string;
  /** Сырой текст ответа модели. */
  text: string;
  inputTokens: number;
  outputTokens: number;
}

/** Единый контракт для любого LLM-провайдера. */
export interface AiProviderClient {
  readonly provider: AiProvider;
  isConfigured(): boolean;
  complete(req: AiCompletionRequest): Promise<AiCompletionResult>;
  /** Оценка стоимости запроса в USD по числу токенов. */
  estimateCost(model: string, inputTokens: number, outputTokens: number): number;
}

export const AI_PROVIDERS = Symbol('AI_PROVIDERS');
