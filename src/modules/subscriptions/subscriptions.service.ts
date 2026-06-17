import { BadRequestException, Injectable } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ENABLED_PLAN_CODES,
  FREE_LIMITS,
  isEnabledPlan,
  PLANS,
  PlanCode,
  planByCode,
} from './plans.config';

export interface AccessInfo {
  hasAccess: boolean; // открыт ли функционал кабинета
  planCode: string | null; // текущий код тарифа (или FREE/null)
  planName: string | null; // маркетинговое имя
  status: SubscriptionStatus | null;
  expiresAt: Date | null;
  limits: Record<string, unknown> | null;
}

/**
 * Логика подписок: текущий тариф, проверка доступа к кабинету и dev-управление
 * (включить/выключить тариф без оплаты — для роли ADMIN).
 *
 * «Нет подписки» = тариф FREE или отсутствие активной записи → кабинет закрыт.
 * Доступ открыт, если тариф входит в ENABLED_PLAN_CODES, статус активен и срок не истёк.
 */
@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Весь каталог тарифов (для лендинга и paywall). Публичные данные. */
  catalog() {
    return {
      plans: PLANS.map((p) => ({
        code: p.code,
        name: p.name,
        tagline: p.tagline,
        price: p.price,
        available: p.available,
        highlight: p.highlight,
        features: p.features,
        aiChecksPerDay: p.limits.aiChecksPerDay,
      })),
      enabled: ENABLED_PLAN_CODES,
    };
  }

  current(userId: string) {
    return this.prisma.subscription.findFirst({
      where: { userId },
      orderBy: { startedAt: 'desc' },
    });
  }

  async access(userId: string): Promise<AccessInfo> {
    const sub = await this.current(userId);
    if (!sub) {
      return { hasAccess: false, planCode: null, planName: null, status: null, expiresAt: null, limits: null };
    }
    const notExpired = !sub.expiresAt || sub.expiresAt.getTime() > Date.now();
    const statusOk =
      sub.status === SubscriptionStatus.ACTIVE || sub.status === SubscriptionStatus.TRIAL;
    const hasAccess = isEnabledPlan(sub.planName) && statusOk && notExpired;
    const def = planByCode(sub.planName);
    return {
      hasAccess,
      planCode: sub.planName,
      planName: def?.name ?? sub.planName,
      status: sub.status,
      expiresAt: sub.expiresAt,
      limits: sub.limits as Record<string, unknown>,
    };
  }

  async hasAccess(userId: string): Promise<boolean> {
    return (await this.access(userId)).hasAccess;
  }

  /** Dev/ADMIN: выдать пользователю тариф (создаёт активную подписку). */
  async setPlan(userId: string, planCode: string) {
    const def = planByCode(planCode);
    if (!def) throw new BadRequestException(`Неизвестный тариф: ${planCode}`);
    return this.prisma.subscription.create({
      data: {
        userId,
        planName: def.code,
        status: SubscriptionStatus.ACTIVE,
        limits: def.limits as object,
        startedAt: new Date(),
        expiresAt: null,
      },
    });
  }

  /** Dev/ADMIN: снять подписку (вернуть состояние «без тарифа»). */
  async clearPlan(userId: string) {
    return this.prisma.subscription.create({
      data: {
        userId,
        planName: 'FREE',
        status: SubscriptionStatus.EXPIRED,
        limits: FREE_LIMITS as object,
        startedAt: new Date(),
        expiresAt: new Date(),
      },
    });
  }

  /** Список кодов тарифов для dev-панели. */
  devPlanCodes(): PlanCode[] {
    return PLANS.map((p) => p.code);
  }
}
