# CONTEXT — ЕГЭ AI backend

> Контекст-файл для быстрого входа в проект (онбординг разработчика / новой сессии).
> Обновлён: 2026-06-16. Связанные документы: [docs/TZ.md](docs/TZ.md), [README.md](README.md), [отчет 16 06.txt](отчет%2016%2006.txt).

## 1. Что это
Backend ИИ-приложения подготовки к ЕГЭ. Идея — не «ещё один курс», а карманная ИИ-система
ежедневного ведения ученика до нужного балла:
**диагностика → план → задания → проверка → слабые темы → прогноз → перестройка плана.**
Старт MVP — русский язык + проверка сочинения (задание 27).

## 2. Стек и ключевые решения
| Слой | Выбор | Важное |
| --- | --- | --- |
| Runtime | Node.js 20+/24, TypeScript | |
| Framework | NestJS 10 | модули 1:1 с разделами ТЗ |
| ORM | Prisma 5 | `provider = postgresql` |
| БД | **Supabase Postgres → self-hosted Postgres после MVP** | портируемость заложена сразу |
| Auth | **собственный JWT** (не Supabase Auth) | чтобы миграция не сломала вход |
| AI | **Groq (дефолт, бесплатный) + Anthropic + OpenAI** | за единой абстракцией |
| Очереди | BullMQ (Redis) | пока НЕ подключено |
| Хранилище | Supabase Storage → S3 | за интерфейсом `StorageService`, пока заглушка |
| Платежи | webhook (ЮKassa) | пока заглушка |

**Принцип портируемости (под миграцию Supabase → Postgres):** Prisma на чистом Postgres,
свой JWT, файлы за интерфейсом. При переезде меняются только `DATABASE_URL`/`DIRECT_URL`.

## 3. Окружение и доступы
- **Supabase project ref:** `yvvvqbijnxvfaongaxrd`, регион `eu-west-1`.
- Подключение Prisma — через **IPv4-пулер** (`aws-0-eu-west-1.pooler.supabase.com`), порт 6543
  (`DATABASE_URL`, pgbouncer) и 5432 (`DIRECT_URL`, миграции). Прямой `db.<ref>.supabase.co` —
  IPv6-only, на домашней сети не резолвится.
- Все секреты — в `.env` (он в `.gitignore`). Шаблон — `.env.example`.
- AI по умолчанию: `AI_DEFAULT_PROVIDER=groq`. Ключ Groq в `.env` → `GROQ_API_KEY`
  (получать: https://console.groq.com/keys).

### ⚠️ Безопасность (долг)
- **Пароль БД** прошёл через переписку при настройке — **нужно сменить** (Supabase →
  Project Settings → Database → Reset password) и обновить `.env`.
- Для серверной загрузки файлов в Storage нужен **secret/service_role** ключ Supabase
  (не publishable) — пока не заведён.
- Перед прод — закрыть Swagger и проверить CORS.

## 4. Как запустить
```bash
cd egextra
npm install
# .env уже настроен (Supabase + Groq). Если с нуля — cp .env.example .env и заполнить.
npm run prisma:generate
npm run prisma:migrate     # применить миграции
npm run db:seed            # русский + тема + задание + промпт проверки сочинения
npm run start:dev          # http://localhost:3000/api , Swagger: /api/docs
```
**Грабли:** при `start` через фоновый процесс возможен зомби на порту 3000
(`EADDRINUSE`) — убить старый node-процесс с `*egextra*` в командной строке и перезапустить.

## 5. AI Orchestrator (ядро) — как устроено
Файлы: [src/modules/ai/](src/modules/ai/).
- Единая точка всех обращений к ИИ. Маршрутизация по типу задачи на «класс» модели:
  - `fast` → Groq `llama-3.1-8b-instant` (автопроверка, рекомендации)
  - `smart` → Groq `llama-3.3-70b-versatile` (сочинение, план)
  - `heavy` → vision (фото) — Groq **не поддерживает**, оркестратор сам переключает
    `photo-task` на Anthropic/OpenAI.
- Провайдеры реализуют общий интерфейс `AiProviderClient` (`complete`, `estimateCost`,
  `isConfigured`). Groq — OpenAI-совместимый (`baseURL=https://api.groq.com/openai/v1`).
- **Лог каждого запроса** → таблица `ai_requests` (провайдер, модель, токены, стоимость,
  `confidence_score`, статус). Проверено вживую: проверка сочинения ≈ $0.0008–0.0013.
- **Промпты из БД:** активный системный промпт берётся из `prompt_templates`
  (`PromptsService.getSystem`) с фолбэком на дефолт в коде. Правит методист через админку,
  без перевыката.
- Строгий JSON-ответ + парсинг (срезаем ```json), кеш по `cache_key`, фолбэк между провайдерами.

## 6. Текущий статус (на 2026-06-16)
**✅ Готово и проверено вживую:** подключение к Supabase, миграции, Auth
(register/login/refresh/me), seed, проверка сочинения end-to-end через Groq с рубрикой
ФИПИ К1–К10 из БД, логирование стоимости, админка промптов.

**Готовность модулей (кратко):**
| Готовы (MVP) | Наполовину (ядро MVP) | Заглушки |
| --- | --- | --- |
| Auth, User Profile, Subject&Topic, Task Bank, инфраструктура | Answer Checking, AI Orchestrator, Study Plan, Progress, Admin | Recommendation, Score Forecast, Parent Report, Subscription-платежи, Notification-доставка, Storage-загрузка, Mock Exam-скоринг |

## 7. Что осталось до MVP 1.0 (приоритет)
1. **Связка результат → прогресс:** сохранять ИИ-фидбэк в `user_answers`, обновлять карту
   тем `topic_progress` (зелёный/жёлтый/красный).
2. **План на 7 дней:** `study-plan/generate` зовёт ИИ, но ответ НЕ парсится/не сохраняется —
   дописать запись `study_plans` + `study_plan_days`.
3. **Лимиты подписки:** guard на `aiChecksPerDay`/тариф перед дорогими ИИ-действиями.
4. **Промпт ФИПИ:** сверить баллы К1–К10 с официальной демоверсией fipi.ru (см. п.9).
5. (после старта) BullMQ+Redis, прогноз баллов, streak, скоринг пробника, платежи, доставка
   уведомлений, реальная загрузка в Storage.

## 8. Карта ключевых файлов
```
prisma/schema.prisma                  модели БД (все сущности раздела 7.4)
prisma/seed.ts                        демо-данные + промпт проверки сочинения
src/modules/ai/ai-orchestrator.service.ts   маршрутизация, лог, фолбэк
src/modules/ai/providers/*.provider.ts      groq / anthropic / openai
src/modules/ai/prompts/essay-check.prompt.ts рубрика ФИПИ (дефолт-фолбэк)
src/modules/ai/prompts/prompts.service.ts    загрузка промпта из БД
src/modules/answers/answers.service.ts       авто + ИИ-проверка
src/modules/auth/*                           JWT-auth (реализован полностью)
src/modules/admin/admin.controller.ts        контент, ИИ-логи, версии промптов
docs/last-essay-result.json                  пример реального ответа Groq
```

## 9. Известные проблемы
- **Groq/Llama иногда выдаёт битый UTF-8** в отдельном поле ответа (наблюдали в
  `improved_fragment`). Конвейер хранения тут ни при чём — байты ломает модель.
  Решения: детектор `�` + ретрай в оркестраторе; для сочинений рассмотреть Claude/GPT-4o.
- **Баллы рубрики ФИПИ К1–К10 (макс 22)** сведены по профильным источникам, но по годам
  расходятся (21 vs 22) — требуют сверки с официальной демоверсией ФИПИ перед платным MVP.
- **Фото-разбор (`photo-task`)** требует vision-провайдера (Anthropic/OpenAI), на бесплатном
  Groq недоступен — это MVP 2.0.

## 10. История решений (кратко)
- Документ ТЗ (docx) → оформлен в Markdown ([docs/TZ.md](docs/TZ.md)).
- Выбран NestJS+Prisma+Supabase (а не FastAPI/Express) — модульность под ТЗ + портируемость.
- Auth — собственный JWT вместо Supabase Auth (миграция).
- Добавлен Groq как дефолтный ИИ-провайдер (бесплатный, OpenAI-совместимый) для теста MVP.
- Промпт проверки сочинения вынесен в БД (`prompt_templates`) с рубрикой ФИПИ К1–К10.
