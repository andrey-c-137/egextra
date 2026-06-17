import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface SubjectForecast {
  subjectId: string;
  subjectName: string;
  targetScore: number | null;
  estimate: number;
  range: { min: number; max: number };
  goalProbability: number | null;
  practicedTopics: number;
  totalTopics: number;
  note?: string;
}

/**
 * Score Forecast — прогноз по 100-балльной шкале на основе карты тем.
 * Текущая оценка = средняя точность по практикованным темам, взвешенная по попыткам.
 * Доверительный коридор сужается по мере накопления данных; P(цель) — логистическая.
 */
@Injectable()
export class ScoreForecastService {
  private readonly SCALE = 100;

  constructor(private readonly prisma: PrismaService) {}

  async forecast(userId: string) {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId },
      include: { subjects: { include: { subject: true } } },
    });

    if (!profile || profile.subjects.length === 0) {
      return { userId, subjects: [] as SubjectForecast[] };
    }

    const subjects: SubjectForecast[] = [];
    for (const ss of profile.subjects) {
      const [progress, totalTopics] = await Promise.all([
        this.prisma.topicProgress.findMany({
          where: { userId, subjectId: ss.subjectId, attempts: { gt: 0 } },
        }),
        this.prisma.topic.count({ where: { subjectId: ss.subjectId } }),
      ]);

      subjects.push(this.subjectForecast(ss.subjectId, ss.subject.name, ss.targetScore, progress, totalTopics));
    }

    return { userId, subjects };
  }

  private subjectForecast(
    subjectId: string,
    subjectName: string,
    targetScore: number | null,
    progress: { accuracyPercent: number; attempts: number }[],
    totalTopics: number,
  ): SubjectForecast {
    if (progress.length === 0) {
      return {
        subjectId,
        subjectName,
        targetScore,
        estimate: 0,
        range: { min: 0, max: this.SCALE },
        goalProbability: targetScore != null ? 0 : null,
        practicedTopics: 0,
        totalTopics,
        note: 'Недостаточно данных — прорешайте задания по темам предмета',
      };
    }

    const totalAttempts = progress.reduce((s, p) => s + p.attempts, 0);
    const mastery =
      progress.reduce((s, p) => s + p.accuracyPercent * p.attempts, 0) / Math.max(totalAttempts, 1);

    // Покрытие тем штрафует оценку: занимались малой долей программы → ниже потолок.
    const coverage = totalTopics ? progress.length / totalTopics : 1;
    const estimate = this.clamp(Math.round(mastery * (0.5 + 0.5 * coverage)));

    // Коридор: шире при малом числе попыток/тем, уже — при большом.
    const band = this.clamp(Math.round(30 - Math.min(progress.length * 3 + totalAttempts, 25)), 5, 30);
    const range = { min: this.clamp(estimate - band), max: this.clamp(estimate + band) };

    const goalProbability =
      targetScore != null ? Math.round(this.logistic((estimate - targetScore) / band) * 100) / 100 : null;

    return {
      subjectId,
      subjectName,
      targetScore,
      estimate,
      range,
      goalProbability,
      practicedTopics: progress.length,
      totalTopics,
    };
  }

  private logistic(x: number): number {
    return 1 / (1 + Math.exp(-x));
  }

  private clamp(v: number, min = 0, max = this.SCALE): number {
    return Math.max(min, Math.min(max, v));
  }
}
