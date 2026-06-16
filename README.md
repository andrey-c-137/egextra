# ЕГЭ AI — backend

Backend ИИ-приложения подготовки к ЕГЭ. Не «ещё один курс», а карманная ИИ-система
ежедневного ведения ученика до нужного балла: **диагностика → план → задания → проверка →
слабые темы → прогноз → перестройка плана**.

Полное ТЗ и аналитика рынка — в [docs/TZ.md](docs/TZ.md).

## Стек

| Слой         | Технология                                  |
| ------------ | ------------------------------------------- |
| Runtime      | Node.js 20+, TypeScript                     |
| Framework    | NestJS 10 (модули 1:1 с разделами ТЗ)       |
| ORM          | Prisma 5                                     |
| БД           | Supabase Postgres → self-hosted Postgres после MVP |
| Очереди      | BullMQ (Redis) — дорогие ИИ-задачи          |
| AI           | Claude (Anthropic) + OpenAI + Groq за абстракцией (дефолт — Groq, бесплатный) |
| Хранилище    | Supabase Storage → S3 (за `StorageService`) |
| Платежи      | webhook (ЮKassa)                            |
| Auth         | собственный JWT (не Supabase Auth)          |

> Портируемость к миграции Supabase → Postgres заложена сразу: Prisma `provider = postgresql`,
> собственный JWT-auth, файлы за интерфейсом. При переезде меняются `DATABASE_URL` / `DIRECT_URL`.

## Быстрый старт

```bash
npm install
cp .env.example .env          # заполнить DATABASE_URL, ключи AI и т.д.
npm run prisma:generate
npm run prisma:migrate        # применить схему к БД
npm run db:seed               # демо-данные (русский язык + сочинение)
npm run start:dev
```

- API: `http://localhost:3000/api`
- Swagger: `http://localhost:3000/api/docs`

## Структура

```
prisma/
  schema.prisma        # все модели БД (раздел 7.4 ТЗ)
  seed.ts
src/
  main.ts
  app.module.ts
  common/              # guards (JWT, roles), decorators, filters
  prisma/              # PrismaService (global)
  modules/
    auth/              # ✅ регистрация/логин/refresh/me (полная реализация)
    ai/                # ✅ AI Orchestrator + провайдеры Anthropic/OpenAI
    answers/           # ✅ авто + ИИ-проверка ответа
    users/             # профиль ученика
    subjects/          # предметы / темы / задания
    tasks/             # банк заданий
    study-plan/        # генерация и перестройка плана (через AI)
    progress/          # статистика, слабые темы, streak
    mock-exams/        # пробники
    recommendations/   # что делать сегодня
    score-forecast/    # прогноз баллов
    parent-report/     # отчёт родителю
    subscriptions/     # тарифы, лимиты, webhook платежей
    notifications/     # email/push/telegram/in-app
    analytics/         # продуктовые события
    admin/             # контент, пользователи, промпты, ИИ-логи
    storage/           # файлы (supabase → s3)
```

## AI Orchestrator (раздел 7.6)

- Провайдеры: **Groq** (дефолт, бесплатный, OpenAI-совместимый), Anthropic, OpenAI.
- Маршрутизация по типу задачи на «класс» модели: `fast` (автопроверка) / `smart`
  (сочинение, план) / `heavy` (фото-разбор). Фото (vision) на Groq недоступно —
  оркестратор сам переключает `photo-task` на Anthropic/OpenAI.
- Логирование **каждого** запроса в `ai_requests`: провайдер, модель, токены, стоимость, статус.
- Строгий JSON-ответ + парсинг/валидация; `confidence_score` для спорных ответов.
- Кеш повторяемых объяснений по `cache_key`.
- Фолбэк между провайдерами, если ключ одного не задан.

> **ChatGPT Plus ≠ OpenAI API.** Для OpenAI-провайдера нужен ключ с
> [platform.openai.com](https://platform.openai.com). Если задан только `ANTHROPIC_API_KEY` —
> оркестратор автоматически использует Claude.

## Статус реализации

Каркас (скелет API + модели БД). Бизнес-логика, помеченная `TODO`, — следующий этап:
расчёт streak/прогноза, парсинг и сохранение сгенерированного плана, интеграции платежей,
доставка уведомлений, реальная загрузка в storage, очереди BullMQ для тяжёлых ИИ-задач.
