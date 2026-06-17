import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SubscriptionsService } from './subscriptions.service';

// Subscription Module — тарифы, доступ к кабинету, платежи, dev-управление
@ApiTags('subscription')
@Controller('subscription')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  // Каталог тарифов — публичный (нужен лендингу до входа).
  @Get('plans')
  plans() {
    return this.subscriptions.catalog();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get()
  current(@CurrentUser() user: AuthUser) {
    return this.subscriptions.current(user.id);
  }

  // Доступ к кабинету: hasAccess + текущий тариф (для гейтинга на фронте).
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('access')
  access(@CurrentUser() user: AuthUser) {
    return this.subscriptions.access(user.id);
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

  // --- DEV / ADMIN: тестирование тарифов без оплаты ---

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('dev/set')
  devSet(@CurrentUser() user: AuthUser, @Body('planCode') planCode: string) {
    return this.subscriptions.setPlan(user.id, planCode);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('dev/clear')
  devClear(@CurrentUser() user: AuthUser) {
    return this.subscriptions.clearPlan(user.id);
  }
}
