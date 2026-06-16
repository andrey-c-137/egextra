import { Global, Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiOrchestratorService } from './ai-orchestrator.service';
import { AnthropicProvider } from './providers/anthropic.provider';
import { OpenAiProvider } from './providers/openai.provider';

@Global()
@Module({
  controllers: [AiController],
  providers: [AiOrchestratorService, AnthropicProvider, OpenAiProvider],
  exports: [AiOrchestratorService],
})
export class AiModule {}
