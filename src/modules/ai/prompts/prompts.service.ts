import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Загрузка активного системного промпта из таблицы prompt_templates.
 * Берёт последнюю активную версию по ключу; если в БД нет — отдаёт fallback из кода.
 * Так методист правит/версионирует промпты через админку без перевыката.
 */
@Injectable()
export class PromptsService {
  private readonly logger = new Logger(PromptsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSystem(key: string, fallback: string): Promise<string> {
    const tpl = await this.prisma.promptTemplate.findFirst({
      where: { key, isActive: true },
      orderBy: { version: 'desc' },
    });
    if (!tpl) {
      this.logger.debug(`Промпт "${key}" не найден в БД — использую дефолт из кода`);
      return fallback;
    }
    return tpl.template;
  }
}
