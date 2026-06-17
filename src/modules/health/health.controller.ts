import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';

// Health Module — liveness/readiness для мониторинга и тестового UI.
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async health() {
    let db = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'up';
    } catch {
      db = 'down';
    }

    const providers = {
      groq: Boolean(this.config.get('GROQ_API_KEY')),
      anthropic: Boolean(this.config.get('ANTHROPIC_API_KEY')),
      openai: Boolean(this.config.get('OPENAI_API_KEY')),
    };

    return {
      status: db === 'up' ? 'ok' : 'degraded',
      db,
      aiProviders: providers,
      defaultProvider: this.config.get('AI_DEFAULT_PROVIDER', 'anthropic'),
      time: new Date().toISOString(),
    };
  }
}
