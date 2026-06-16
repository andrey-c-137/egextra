import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';

// Subscription Module — тарифы, лимиты, платежи, webhook (эндпойнты Subscription из 7.5)
@ApiTags('subscription')
@Controller('subscription')
export class SubscriptionsController {
  constructor(private readonly prisma: PrismaService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get()
  current(@CurrentUser() user: AuthUser) {
    return this.prisma.subscription.findFirst({
      where: { userId: user.id },
      orderBy: { startedAt: 'desc' },
    });
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('checkout')
  checkout(@CurrentUser() user: AuthUser, @Body('planName') planName: string) {
    // TODO: создать платёж у провайдера (ЮKassa) и вернуть payment_url.
    return { userId: user.id, planName, paymentUrl: 'https://payments.example/checkout/...' };
  }

  // Webhook без JWT — проверяется подписью провайдера (YOOKASSA_WEBHOOK_SECRET).
  @Post('webhook')
  webhook(@Body() payload: Record<string, unknown>) {
    // TODO: верифицировать подпись, обновить Payment.status и Subscription.status.
    return { received: true, payload };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('cancel')
  cancel(@CurrentUser() user: AuthUser) {
    return { userId: user.id, status: 'cancel-scheduled' };
  }
}
