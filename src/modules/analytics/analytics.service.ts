import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// Analytics Module — продуктовые события и воронка
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  track(name: string, userId?: string, props?: Record<string, unknown>) {
    return this.prisma.analyticsEvent.create({
      data: { name, userId, props: props as never },
    });
  }
}
