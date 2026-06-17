import { ExamType } from '@prisma/client';
import { ESSAY_CHECK_PROMPT_KEY, ESSAY_CHECK_SYSTEM } from './essay-check.prompt';

/**
 * Подбор промпта для ИИ-проверки развёрнутых ответов по русскому языку.
 * ЕГЭ сочинение (№27) использует существующий промпт (не меняем).
 * Для ОГЭ — отдельные промпты: сжатое изложение (№1) и сочинение (№13).
 */

export const OGE_IZLOZHENIE_KEY = 'oge_izlozhenie_ru';
export const OGE_IZLOZHENIE_SYSTEM = `Ты — эксперт ОГЭ по русскому языку. Проверяешь сжатое изложение (задание 1) по модели ФИПИ. Будь честным и конкретным.

Исходный текст для изложения приведён в задании. Оцени работу ученика по критериям (всего 7 баллов):
- ИК1 — Передача основного содержания и всех микротем исходного текста — макс 2
- ИК2 — Сжатие исходного текста (использование приёмов сжатия) — макс 3
- ИК3 — Смысловая цельность, связность и последовательность — макс 2

ПРАВИЛА:
1. Если работа не является изложением исходного текста — 0 по всем критериям.
2. Балл за критерий не превышает максимум.
3. Не уверен — снизь confidence_score.

Верни СТРОГО JSON (без markdown):
{
  "score_estimate": <int 0..7>, "max_score": 7, "word_count": <int>,
  "criteria": [
    {"code":"ИК1","score":<int>,"max":2,"comment":"<строка>"},
    {"code":"ИК2","score":<int>,"max":3,"comment":"<строка>"},
    {"code":"ИК3","score":<int>,"max":2,"comment":"<строка>"}
  ],
  "main_mistakes": ["<строка>"],
  "improved_fragment": "<переписанный проблемный фрагмент из работы ученика>",
  "next_tasks": ["<упражнение>"],
  "confidence_score": <float 0..1>
}`;

export const OGE_SOCHINENIE_KEY = 'oge_sochinenie_ru';
export const OGE_SOCHINENIE_SYSTEM = `Ты — эксперт ОГЭ по русскому языку. Проверяешь сочинение-рассуждение (задание 13: одна из тем 13.1/13.2/13.3) по модели ФИПИ. Будь честным и конкретным.

Оцени по критериям (всего 7 баллов):
- СК1 — Наличие обоснованного ответа/тезиса по выбранной теме — макс 2
- СК2 — Наличие примеров-аргументов (с опорой на текст) — макс 3
- СК3 — Смысловая цельность и композиционная стройность — макс 2

ПРАВИЛА:
1. Если сочинение не по выбранной теме или без опоры на текст — 0 по содержательным критериям.
2. Объём менее 70 слов — работа оценивается крайне низко, отметь это.
3. Балл за критерий не превышает максимум.

Верни СТРОГО JSON (без markdown):
{
  "score_estimate": <int 0..7>, "max_score": 7, "word_count": <int>,
  "criteria": [
    {"code":"СК1","score":<int>,"max":2,"comment":"<строка>"},
    {"code":"СК2","score":<int>,"max":3,"comment":"<строка>"},
    {"code":"СК3","score":<int>,"max":2,"comment":"<строка>"}
  ],
  "main_mistakes": ["<строка>"],
  "improved_fragment": "<переписанный фрагмент из сочинения ученика>",
  "next_tasks": ["<упражнение>"],
  "confidence_score": <float 0..1>
}`;

export interface EssayPrompt { key: string; system: string; max: number }

/**
 * Вернуть промпт проверки для развёрнутого задания по русскому, либо null
 * (тогда задание не проверяется ИИ-эссеистом).
 */
export function getEssayPrompt(examType: ExamType, subjectCode: string, taskNumber: number | null): EssayPrompt | null {
  if (subjectCode !== 'rus') return null;
  if (examType === ExamType.EGE && taskNumber === 27) {
    return { key: ESSAY_CHECK_PROMPT_KEY, system: ESSAY_CHECK_SYSTEM, max: 22 };
  }
  if (examType === ExamType.OGE && taskNumber === 1) {
    return { key: OGE_IZLOZHENIE_KEY, system: OGE_IZLOZHENIE_SYSTEM, max: 7 };
  }
  if (examType === ExamType.OGE && taskNumber === 13) {
    return { key: OGE_SOCHINENIE_KEY, system: OGE_SOCHINENIE_SYSTEM, max: 7 };
  }
  return null;
}
