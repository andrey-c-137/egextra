/**
 * Каталог тарифов BallLab.
 *
 * Источник истины для лендинга, paywall и гейтинга кабинета.
 * Пока хранится в коде (без таблицы Plan) — структура подобрана так, чтобы позже
 * перенести в БД без переделки вызывающего кода: достаточно заменить PLANS на выборку
 * из БД и оставить тот же интерфейс PlanDef.
 *
 * На текущем этапе бизнес-логика кабинета работает ТОЛЬКО для STANDARD (ENABLED_PLAN_CODES).
 * Остальные тарифы показываются на лендинге как «в разработке».
 */

export type PlanCode = 'EXPRESS' | 'STANDARD' | 'STRATEG' | 'ULTRASKILL';

export interface PlanLimits {
  aiChecksPerDay: number;
  maxSubjects: number;
  checkTypes: string[];
}

export interface PlanDef {
  code: PlanCode;
  name: string; // маркетинговое имя (рус.)
  tagline: string; // короткий подзаголовок для карточки
  price: number; // ₽/мес
  available: boolean; // работает ли бизнес-логика тарифа сейчас
  highlight: boolean; // выделять карточку как рекомендованную
  limits: PlanLimits;
  features: string[]; // буллеты для карточки
}

/** Тариф без подписки (создаётся при регистрации). Кабинет закрыт. */
export const FREE_LIMITS: PlanLimits = { aiChecksPerDay: 3, maxSubjects: 1, checkTypes: ['AUTO'] };

export const PLANS: PlanDef[] = [
  {
    code: 'EXPRESS',
    name: 'ЭКСПРЕСС',
    tagline: 'Быстрый старт и базовая диагностика',
    price: 490,
    available: false,
    highlight: false,
    limits: { aiChecksPerDay: 5, maxSubjects: 1, checkTypes: ['AUTO'] },
    features: [
      '5 AI-запросов в день',
      'Базовая диагностика',
      'Базовые задания',
      'Базовый прогноз балла',
      'Ограниченные рекомендации',
    ],
  },
  {
    code: 'STANDARD',
    name: 'СТАНДАРТ',
    tagline: 'Основной тариф для системной подготовки',
    price: 990,
    available: true,
    highlight: true,
    limits: { aiChecksPerDay: 15, maxSubjects: 3, checkTypes: ['AUTO', 'AI'] },
    features: [
      '15 AI-запросов в день',
      'Практика и пробники',
      'Персональный план подготовки',
      'Базовая аналитика готовности',
      'AI-проверка письменных и развёрнутых ответов',
      'Рекомендации на сегодня',
    ],
  },
  {
    code: 'STRATEG',
    name: 'СТРАТЕГ',
    tagline: 'Глубокая аналитика и приоритизация',
    price: 1990,
    available: false,
    highlight: false,
    limits: { aiChecksPerDay: 50, maxSubjects: 5, checkTypes: ['AUTO', 'AI'] },
    features: [
      '50 AI-запросов в день',
      'Продвинутый план подготовки',
      'Глубокая аналитика',
      'Приоритизация тем',
      'Режимы «быстрые победы» и «слабые темы»',
      'Расширенные AI-рекомендации',
    ],
  },
  {
    code: 'ULTRASKILL',
    name: 'УЛЬТРАСКИЛЛ',
    tagline: 'Максимум возможностей и AI-наставник',
    price: 3490,
    available: false,
    highlight: false,
    limits: { aiChecksPerDay: 100, maxSubjects: 10, checkTypes: ['AUTO', 'AI'] },
    features: [
      '100 AI-запросов в день',
      'Интенсив за 30 дней',
      'AI-наставник',
      'Приоритетная проверка',
      'Расширенные отчёты',
      'Прогноз выхода на целевой балл',
    ],
  },
];

/** Тарифы, чья бизнес-логика реально включена в кабинете. */
export const ENABLED_PLAN_CODES: PlanCode[] = ['STANDARD'];

export function planByCode(code: string | null | undefined): PlanDef | null {
  return PLANS.find((p) => p.code === code) ?? null;
}

export function isEnabledPlan(code: string | null | undefined): boolean {
  return !!code && (ENABLED_PLAN_CODES as string[]).includes(code);
}
