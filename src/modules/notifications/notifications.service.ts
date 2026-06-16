import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// Notification Module — email/push/Telegram/внутренние уведомления
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async send(userId: string, channel: NotificationChannel, title: string, body: string) {
    const notification = await this.prisma.notification.create({
      data: { userId, channel, title, body },
    });
    // TODO: реальная доставка по каналу (SMTP / push / Telegram).
    this.logger.log(`[${channel}] → ${userId}: ${title}`);
    return notification;
  }
}
