import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { SubscriptionsService } from '../../modules/subscriptions/subscriptions.service';

/**
 * Гейтинг кабинета: пропускает только пользователей с активным рабочим тарифом.
 * Применяется ПОСЛЕ JwtAuthGuard (нужен request.user).
 *
 * Без доступа кидает 403 с кодом SUBSCRIPTION_REQUIRED — фронт показывает paywall
 * («Выберите план, чтобы продолжить»), не путая это с другими 403.
 */
@Injectable()
export class RequireActiveSubscriptionGuard implements CanActivate {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException({ code: 'AUTH_REQUIRED', message: 'Требуется вход' });

    if (await this.subscriptions.hasAccess(user.id)) return true;

    throw new ForbiddenException({
      code: 'SUBSCRIPTION_REQUIRED',
      message: 'Выберите план, чтобы продолжить',
    });
  }
}
