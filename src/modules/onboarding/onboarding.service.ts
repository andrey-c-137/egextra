import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ExamType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SelectedSubjectDto, SetTrackDto } from './dto/onboarding.dto';

// Шаги онбординга
export enum OnboardingStep {
  TRACK = 'track', // шаг 1: ОГЭ/ЕГЭ + класс
  SUBJECTS = 'subjects', // шаг 2: выбор экзаменов
  COMPLETED = 'completed',
}

const MATH_CODES = ['math_prof', 'math_base'];

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Где сейчас пользователь в онбординге и чего не хватает. */
  async getState(userId: string) {
    const profile = await this.profileOrThrow(userId);
    const subjectsCount = await this.prisma.studentSubject.count({
      where: { profileId: profile.id },
    });

    let step: OnboardingStep;
    if (!profile.examType || !profile.grade) step = OnboardingStep.TRACK;
    else if (subjectsCount === 0) step = OnboardingStep.SUBJECTS;
    else step = OnboardingStep.COMPLETED;

    return {
      completed: profile.onboardingCompleted,
      step,
      profile: {
        examType: profile.examType,
        grade: profile.grade,
        selectedSubjects: subjectsCount,
      },
    };
  }

  /** Каталог экзаменов выбранного трека (для экрана выбора). */
  catalog(examType: ExamType) {
    return this.prisma.subject.findMany({
      where: { examType, isActive: true },
      orderBy: { orderIndex: 'asc' },
      select: { id: true, code: true, name: true, isMandatory: true },
    });
  }

  /** Шаг 1: трек + класс с проверкой соответствия. */
  async setTrack(userId: string, dto: SetTrackDto) {
    if (dto.examType === ExamType.OGE && ![8, 9].includes(dto.grade)) {
      throw new BadRequestException('Для ОГЭ допустимы 8–9 класс');
    }
    if (dto.examType === ExamType.EGE && ![10, 11].includes(dto.grade)) {
      throw new BadRequestException('Для ЕГЭ допустимы 10–11 класс');
    }
    const profile = await this.profileOrThrow(userId);
    await this.prisma.studentProfile.update({
      where: { id: profile.id },
      data: { examType: dto.examType, grade: dto.grade },
    });
    return this.getState(userId);
  }

  /** Шаг 2: выбор экзаменов + цели. Завершает онбординг. */
  async setSubjects(userId: string, items: SelectedSubjectDto[]) {
    const profile = await this.profileOrThrow(userId);
    if (!profile.examType) {
      throw new BadRequestException('Сначала выберите трек (ОГЭ/ЕГЭ) и класс — шаг 1');
    }

    const ids = items.map((i) => i.subjectId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Дублирующиеся предметы в выборе');
    }

    // Все выбранные предметы должны существовать, быть активны и принадлежать треку.
    const subjects = await this.prisma.subject.findMany({
      where: { id: { in: ids }, examType: profile.examType, isActive: true },
    });
    if (subjects.length !== ids.length) {
      throw new BadRequestException('Некоторые предметы не найдены или не относятся к выбранному экзамену');
    }

    this.validateSelection(profile.examType, subjects);

    // Перезаписываем выбор атомарно и помечаем онбординг завершённым.
    await this.prisma.$transaction([
      this.prisma.studentSubject.deleteMany({ where: { profileId: profile.id } }),
      this.prisma.studentSubject.createMany({
        data: items.map((i) => ({
          profileId: profile.id,
          subjectId: i.subjectId,
          targetScore: i.targetScore,
          mathLevel: i.mathLevel,
        })),
      }),
      this.prisma.studentProfile.update({
        where: { id: profile.id },
        data: { onboardingCompleted: true },
      }),
    ]);

    return this.getState(userId);
  }

  /** Бизнес-правила обязательности предметов по треку. */
  private validateSelection(examType: ExamType, subjects: { code: string; isMandatory: boolean; name: string }[]) {
    const codes = new Set(subjects.map((s) => s.code));

    // Обязательные предметы трека (флаг isMandatory) должны быть выбраны.
    // Проверяем по всему каталогу трека, а не только по выбранным.
    // (русский — везде; математика ОГЭ — обязательна)
    const mandatoryMissing = subjects.length === 0;
    if (mandatoryMissing) throw new BadRequestException('Выберите хотя бы один экзамен');

    if (examType === ExamType.EGE) {
      if (!codes.has('rus')) throw new BadRequestException('Русский язык обязателен для ЕГЭ');
      if (!MATH_CODES.some((c) => codes.has(c))) {
        throw new BadRequestException('Для ЕГЭ нужна математика (базовая или профильная)');
      }
    }

    if (examType === ExamType.OGE) {
      if (!codes.has('rus')) throw new BadRequestException('Русский язык обязателен для ОГЭ');
      if (!codes.has('oge_math')) throw new BadRequestException('Математика обязательна для ОГЭ');
      const electives = subjects.filter((s) => !s.isMandatory).length;
      if (electives < 2) {
        throw new BadRequestException('Для ОГЭ нужно минимум 2 предмета по выбору');
      }
    }
  }

  private async profileOrThrow(userId: string) {
    const profile = await this.prisma.studentProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Профиль ученика не найден');
    return profile;
  }
}
