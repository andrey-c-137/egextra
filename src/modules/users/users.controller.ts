import { Body, Controller, Get, NotFoundException, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';

// User Profile Module — раздел 7.3 / эндпойнты Profile из 7.5.
// Выбор экзаменов делается в онбординге; здесь — просмотр и пост-онбординг правки.
@ApiTags('profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('profile')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.prisma.studentProfile.findUnique({
      where: { userId: user.id },
      include: { subjects: { include: { subject: true } } },
    });
  }

  // Профильные поля: класс, минут/день, дата экзамена.
  @Patch()
  update(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.prisma.studentProfile.update({ where: { userId: user.id }, data: body as never });
  }

  // Выбранные экзамены с целями.
  @Get('subjects')
  async subjects(@CurrentUser() user: AuthUser) {
    const profile = await this.profile(user.id);
    return this.prisma.studentSubject.findMany({
      where: { profileId: profile.id },
      include: { subject: true },
    });
  }

  // Правка цели/уровня по конкретному экзамену (после онбординга).
  @Patch('subjects/:subjectId')
  async updateSubject(
    @CurrentUser() user: AuthUser,
    @Param('subjectId') subjectId: string,
    @Body() body: { targetScore?: number; currentScore?: number },
  ) {
    const profile = await this.profile(user.id);
    return this.prisma.studentSubject.update({
      where: { profileId_subjectId: { profileId: profile.id, subjectId } },
      data: { targetScore: body.targetScore, currentScore: body.currentScore },
    });
  }

  private async profile(userId: string) {
    const profile = await this.prisma.studentProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Профиль не найден');
    return profile;
  }
}
