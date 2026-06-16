import { Global, Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiOrchestratorService } from './ai-orchestrator.service';
import { PromptsService } from './prompts/prompts.service';
import { AnthropicProvider } from './providers/anthropic.provider';
import { GroqProvider } from './providers/groq.provider';
import { OpenAiProvider } from './providers/openai.provider';

@Global()
@Module({
  controllers: [AiController],
  providers: [AiOrchestratorService, PromptsService, AnthropicProvider, OpenAiProvider, GroqProvider],
  exports: [AiOrchestratorService, PromptsService],
})
export class AiModule {}
