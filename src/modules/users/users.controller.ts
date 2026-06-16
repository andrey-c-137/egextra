import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';

// User Profile Module — раздел 7.3 / эндпойнты Profile из 7.5
@ApiTags('profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('profile')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.prisma.studentProfile.findUnique({ where: { userId: user.id } });
  }

  @Patch()
  update(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.prisma.studentProfile.update({ where: { userId: user.id }, data: body as never });
  }

  @Post('subjects')
  setSubjects(@CurrentUser() user: AuthUser, @Body('subjectIds') subjectIds: string[]) {
    return this.prisma.studentProfile.update({
      where: { userId: user.id },
      data: { selectedSubjects: subjectIds },
    });
  }

  @Patch('goals')
  setGoals(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.prisma.studentProfile.update({ where: { userId: user.id }, data: body as never });
  }
}
