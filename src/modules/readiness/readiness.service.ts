import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * ReadinessService — готовность по заданиям и экзамену (раздел «Аналитика»).
 *
 * Считается НА ЛЕТУ из UserAnswer + результатов пробников. Вся математика — в чистых
 * методах (readinessOf), чтобы позже вынести в кэш-таблицу TaskReadiness без правки вызовов.
 *
 * Формула (согласована):
 *   q_i        — качество попытки 0..1 (score/maxScore)
 *   w_i        — вес давности: 0.5^(ageDays/H), H=21 дн
 *   accuracy   — Σ(q·w)/Σ(w) (точность с приоритетом свежих)
 *   effN       — Σ(w) (эффективное число свежих попыток)
 *   confidence — effN/(effN+k), k=4
 *   readiness  — confidence·accuracy + (1−confidence)·p0, p0=0.35 → 0..100
 *   examReadiness — взвешенно по maxScore задания (вес в экзамене)
 *
 * Дедупликация: попытки пробника через finish() уже лежат в UserAnswer, поэтому
 * из пробников добавляем ТОЛЬКО ручные результаты (aiSummary.manual=true).
 */

const HALF_LIFE_DAYS = 21;
const CONFIDENCE_K = 4;
const PRIOR = 0.35;
const DAY = 86_400_000;

export type TaskStatus = 'ready' | 'unstable' | 'weak' | 'no_data';

export interface TaskReadiness {
  egeTaskNumber: number;
  readiness: number; // 0..100
  accuracyPercent: number; // 0..100
  confidence: number; // 0..1
  attempts: number; // сырое число попыток
  trend: -1 | 0 | 1;
  status: TaskStatus;
  maxScore: number;
  difficulty: number;
  topicId: string | null;
  topicName: string | null;
  lastAt: Date | null;
}

interface Attempt {
  q: number;
  at: Date;
}
interface NumberMeta {
  maxScore: number;
  difficulty: number;
  topicId: string | null;
  topicName: string | null;
}
interface PerTask {
  egeTaskNumber: number | null;
  score: number;
  maxScore: number;
}

export interface SubjectAnalytics {
  subjectId: string;
  examReadiness: number; // 0..100
  confidence: number; // 0..1
  forecast: {
    readinessPercent: number;
    confidencePercent: number;
    primary: number;
    maxPrimary: number;
    primaryMin: number;
    primaryMax: number;
  };
  tasks: TaskReadiness[];
  weakTasks: TaskReadiness[];
  quickWins: (TaskReadiness & { reason: string })[];
  dynamics: {
    date: Date;
    title: string;
    primaryScore: number;
    maxPrimaryScore: number;
    testScore: number | null;
  }[];
  practiceSummary: { total: number; correct: number; accuracyPercent: number };
}

@Injectable()
export class ReadinessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Сводка по всем выбранным предметам ученика (для переключателя в Аналитике). */
  async overview(userId: string) {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId },
      include: { subjects: { include: { subject: true } } },
    });
    if (!profile) return { subjects: [] };

    const subjects = [];
    for (const ss of profile.subjects) {
      const a = await this.subjectAnalytics(userId, ss.subjectId);
      subjects.push({
        subjectId: ss.subjectId,
        subjectName: ss.subject.name,
        code: ss.subject.code,
        examType: ss.subject.examType,
        mathLevel: ss.mathLevel,
        targetScore: ss.targetScore,
        examReadiness: a.examReadiness,
        confidence: a.confidence,
        forecast: a.forecast,
      });
    }
    return { subjects };
  }

  /** Полная аналитика по предмету. */
  async subjectAnalytics(userId: string, subjectId: string): Promise<SubjectAnalytics> {
    const [taskRows, answers, mockResults] = await Promise.all([
      this.prisma.task.findMany({
        where: { subjectId, egeTaskNumber: { not: null }, isActive: true },
        select: {
          egeTaskNumber: true,
          maxScore: true,
          difficulty: true,
          topicId: true,
          topic: { select: { name: true } },
        },
      }),
      this.prisma.userAnswer.findMany({
        where: { userId, task: { subjectId, egeTaskNumber: { not: null } } },
        select: {
          isCorrect: true,
          score: true,
          createdAt: true,
          task: { select: { egeTaskNumber: true, maxScore: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.mockExamResult.findMany({
        where: { userId, mockExam: { subjectId } },
        select: {
          createdAt: true,
          primaryScore: true,
          testScore: true,
          aiSummary: true,
          mockExam: { select: { title: true, maxPrimaryScore: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // Мета по номеру задания.
    const meta = new Map<number, NumberMeta>();
    for (const t of taskRows) {
      const n = t.egeTaskNumber!;
      const cur = meta.get(n);
      if (!cur) {
        meta.set(n, {
          maxScore: t.maxScore,
          difficulty: t.difficulty,
          topicId: t.topicId,
          topicName: t.topic?.name ?? null,
        });
      } else {
        cur.maxScore = Math.max(cur.maxScore, t.maxScore);
        cur.difficulty = Math.min(cur.difficulty, t.difficulty);
        cur.topicId = cur.topicId ?? t.topicId;
        cur.topicName = cur.topicName ?? t.topic?.name ?? null;
      }
    }

    // Попытки по номеру задания: практика (UserAnswer) + ручные пробники.
    const attempts = new Map<number, Attempt[]>();
    const add = (n: number, q: number, at: Date) => {
      const arr = attempts.get(n) ?? [];
      arr.push({ q: Math.max(0, Math.min(1, q)), at });
      attempts.set(n, arr);
    };

    let practiceTotal = 0;
    let practiceCorrect = 0;
    for (const a of answers) {
      const n = a.task.egeTaskNumber!;
      const max = a.task.maxScore || 1;
      const q = (a.score ?? (a.isCorrect ? max : 0)) / max;
      add(n, q, a.createdAt);
      practiceTotal++;
      if (a.isCorrect) practiceCorrect++;
    }
    for (const r of mockResults) {
      const summary = r.aiSummary as { perTask?: PerTask[]; manual?: boolean } | null;
      if (!summary?.manual || !Array.isArray(summary.perTask)) continue;
      for (const pt of summary.perTask) {
        if (pt.egeTaskNumber != null && pt.maxScore > 0) {
          add(pt.egeTaskNumber, pt.score / pt.maxScore, r.createdAt);
        }
      }
    }

    // Сборка готовности по каждому номеру.
    const numbers = new Set<number>([...meta.keys(), ...attempts.keys()]);
    const maxMaxScore = Math.max(1, ...[...meta.values()].map((m) => m.maxScore));
    const tasks: TaskReadiness[] = [];
    for (const n of [...numbers].sort((a, b) => a - b)) {
      const m = meta.get(n) ?? { maxScore: 1, difficulty: 1, topicId: null, topicName: null };
      const att = attempts.get(n) ?? [];
      const r = this.readinessOf(att);
      tasks.push({
        egeTaskNumber: n,
        readiness: r.readiness,
        accuracyPercent: r.accuracyPercent,
        confidence: r.confidence,
        attempts: att.length,
        trend: r.trend,
        status: this.statusOf(r.readiness, r.confidence, att.length),
        maxScore: m.maxScore,
        difficulty: m.difficulty,
        topicId: m.topicId,
        topicName: m.topicName,
        lastAt: r.lastAt,
      });
    }

    // examReadiness / confidence — взвешенно по maxScore (вес задания в экзамене).
    let sumW = 0;
    let sumRW = 0;
    let sumCW = 0;
    let maxPrimary = 0;
    for (const t of tasks) {
      sumW += t.maxScore;
      sumRW += t.readiness * t.maxScore;
      sumCW += t.confidence * t.maxScore;
      maxPrimary += t.maxScore;
    }
    const examReadiness = sumW ? Math.round(sumRW / sumW) : 0;
    const confidence = sumW ? sumCW / sumW : 0;

    const bandPct = (1 - confidence) * 22;
    const rMin = Math.max(0, examReadiness - bandPct);
    const rMax = Math.min(100, examReadiness + bandPct);
    const forecast = {
      readinessPercent: examReadiness,
      confidencePercent: Math.round(confidence * 100),
      primary: Math.round((examReadiness / 100) * maxPrimary),
      maxPrimary,
      primaryMin: Math.round((rMin / 100) * maxPrimary),
      primaryMax: Math.round((rMax / 100) * maxPrimary),
    };

    // Слабые задания: низкая готовность × высокий вес × плохая динамика.
    const weakTasks = tasks
      .filter((t) => t.attempts > 0 && t.readiness < 75)
      .map((t) => ({
        t,
        score: (1 - t.readiness / 100) * (t.maxScore / maxMaxScore) * (1 + (t.trend < 0 ? 0.3 : 0)),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.t);

    // Быстрые победы: средняя-но-не-нулевая готовность + вес + лёгкость.
    const quickWins = tasks
      .filter((t) => t.attempts >= 1 && t.readiness >= 40 && t.readiness < 80)
      .map((t) => {
        const lift = Math.max(0, 0.9 - t.readiness / 100);
        const ease = 1 / Math.max(1, t.difficulty);
        return { t, gain: (t.maxScore / maxMaxScore) * lift * ease };
      })
      .sort((a, b) => b.gain - a.gain)
      .slice(0, 6)
      .map((x) => ({
        ...x.t,
        reason: `Готовность ${x.t.readiness}% — немного практики выведет задание №${x.t.egeTaskNumber} в зелёную зону`,
      }));

    const dynamics = mockResults.map((r) => ({
      date: r.createdAt,
      title: r.mockExam.title,
      primaryScore: r.primaryScore,
      maxPrimaryScore: r.mockExam.maxPrimaryScore,
      testScore: r.testScore,
    }));

    return {
      subjectId,
      examReadiness,
      confidence,
      forecast,
      tasks,
      weakTasks,
      quickWins,
      dynamics,
      practiceSummary: {
        total: practiceTotal,
        correct: practiceCorrect,
        accuracyPercent: practiceTotal ? Math.round((practiceCorrect / practiceTotal) * 100) : 0,
      },
    };
  }

  /** Карта готовности по номеру задания (для движка плана и рекомендаций). */
  async readinessMap(userId: string, subjectId: string): Promise<Map<number, TaskReadiness>> {
    const a = await this.subjectAnalytics(userId, subjectId);
    return new Map(a.tasks.map((t) => [t.egeTaskNumber, t]));
  }

  // ---- чистая математика ----

  private readinessOf(att: Attempt[]) {
    if (att.length === 0) {
      return { readiness: Math.round(PRIOR * 100), accuracyPercent: 0, confidence: 0, trend: 0 as const, lastAt: null };
    }
    const now = Date.now();
    let sw = 0;
    let swq = 0;
    let lastAt = att[0].at;
    for (const a of att) {
      const ageDays = (now - a.at.getTime()) / DAY;
      const w = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
      sw += w;
      swq += w * a.q;
      if (a.at > lastAt) lastAt = a.at;
    }
    const accuracy = swq / sw;
    const confidence = sw / (sw + CONFIDENCE_K);
    const readiness = Math.round(100 * (confidence * accuracy + (1 - confidence) * PRIOR));
    return {
      readiness,
      accuracyPercent: Math.round(accuracy * 100),
      confidence,
      trend: this.trendOf(att),
      lastAt,
    };
  }

  /** Тренд: средняя свежей половины минус старой (по времени). */
  private trendOf(att: Attempt[]): -1 | 0 | 1 {
    if (att.length < 2) return 0;
    const sorted = [...att].sort((a, b) => a.at.getTime() - b.at.getTime());
    const mid = Math.floor(sorted.length / 2);
    const older = sorted.slice(0, mid);
    const newer = sorted.slice(mid);
    const mean = (xs: Attempt[]) => xs.reduce((s, x) => s + x.q, 0) / xs.length;
    const diff = mean(newer) - mean(older);
    if (diff > 0.12) return 1;
    if (diff < -0.12) return -1;
    return 0;
  }

  private statusOf(readiness: number, confidence: number, attempts: number): TaskStatus {
    if (attempts === 0) return 'no_data';
    if (readiness >= 75 && confidence >= 0.5) return 'ready';
    if (readiness >= 55) return 'unstable';
    return 'weak';
  }
}
