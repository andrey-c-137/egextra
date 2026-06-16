import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Блокирует «обучающие» эндпойнты, пока ученик не завершил онбординг.
 * Применяется ПОСЛЕ JwtAuthGuard (нужен request.user). Роли кроме STUDENT пропускаются.
 */
@Injectable()
export class OnboardingGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest();
    if (!user || user.role !== 'STUDENT') return true;

    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId: user.id },
      select: { onboardingCompleted: true },
    });
    if (!profile?.onboardingCompleted) {
      throw new ForbiddenException('Сначала завершите онбординг (/onboarding)');
    }
    return true;
  }
}
