/* eslint-disable no-console */
import { AnswerType, ExamType, PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Импорт пользовательских вариантов из content/variants. DRY=1 — только разбор и сводка.
const prisma = new PrismaClient();
const DRY = process.env.DRY === '1';
const ROOT = join(__dirname, '..', 'content', 'variants');

const det = (seed: string): string => {
  const h = createHash('md5').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};

type ExamCfg = {
  dir: string; code: string; examType: ExamType; subjectName: string;
  temy: string;
  essays: number[];   // задания, проверяемые ИИ (русский развёрнутый)
  detailed: number[]; // часть 2 целиком (для математики — кандидаты на «недоступно»)
  promptKey?: (n: number) => string; // ключ промпта для ИИ-проверки
};

const EXAMS: ExamCfg[] = [
  { dir: 'ege-matematika-baza', code: 'math_base', examType: ExamType.EGE, subjectName: 'Математика (базовая)', temy: 'temy_ege_matematika_bazovaya_2026.txt', essays: [], detailed: [] },
  { dir: 'ege-matematika-profil', code: 'math_prof', examType: ExamType.EGE, subjectName: 'Математика (профильная)', temy: 'temy_ege_matematika_profilnaya_2026.txt', essays: [], detailed: [13, 14, 15, 16, 17, 18, 19] },
  { dir: 'ege-russkiy', code: 'rus', examType: ExamType.EGE, subjectName: 'Русский язык', temy: 'temy_ege_russkiy_yazyk_2026.txt', essays: [27], detailed: [27], promptKey: () => 'essay_check_ru' },
  { dir: 'oge-matematika', code: 'oge_math', examType: ExamType.OGE, subjectName: 'Математика', temy: 'temy_oge_matematika_2026.txt', essays: [], detailed: [20, 21, 22, 23, 24, 25] },
  { dir: 'oge-russkiy', code: 'rus', examType: ExamType.OGE, subjectName: 'Русский язык', temy: 'temy_oge_russkiy_yazyk_2026.txt', essays: [1, 13], detailed: [1, 13], promptKey: (n) => (n === 1 ? 'oge_izlozhenie_ru' : 'oge_sochinenie_ru') },
];

// ---------- парсеры ----------

// Строгая проверка строки-заголовка секции (а не предложения-инструкции).
const SECTION_RES: RegExp[] = [
  /^ОТВЕТЫ(\s*К\s*ЗАДАНИЯМ[\s\d–—-]*)?[:.]?$/i,
  /^ОТВЕТЫ\s*И\s*РЕШЕНИЯ\.?(\s*ВАРИАНТ\s*\d+)?[:.]?$/i,
  /^ОТВЕТЫ\s*,?\s*РЕШЕНИЯ.*$/i,
  /^Краткие\s*ответы:?$/i,
  /^(ПОДРОБНЫЕ\s+)?РЕШЕНИЯ.*$/i,
  /^КРАТКИЕ\s+РЕШЕНИЯ$/i,
  /^КРИТЕРИИ.*$/i,
  /^МЕТОДИЧЕСКАЯ\s+КАРТА.*$/i,
  /^БЛАНК.*$/i,
];
const isSection = (t: string) => SECTION_RES.some((re) => re.test(t));

function findLine(lines: string[], re: RegExp, from = 0): number {
  for (let i = from; i < lines.length; i++) if (re.test(lines[i].trim())) return i;
  return -1;
}

/** Ответы: ищем секцию «ОТВЕТЫ…»/«Краткие ответы», парсим строки «N. ans» / «N) ans» / «N — ans». */
function parseAnswers(lines: string[]): Map<number, string> {
  const res = new Map<number, string>();
  // Заголовок секции ответов (а не строка-инструкция «Ответы … записывайте»).
  const isHeader = (t: string) =>
    /^ОТВЕТЫ(\s*К\s*ЗАДАНИЯМ[\s\d–—-]*)?[:.]?$/i.test(t) ||
    /^ОТВЕТЫ\s*И\s*РЕШЕНИЯ\.?(\s*ВАРИАНТ\s*\d+)?[:.]?$/i.test(t) ||
    /^ОТВЕТЫ\s*,?\s*РЕШЕНИЯ.*КРИТЕРИИ.*$/i.test(t) ||
    /^Краткие\s*ответы:?$/i.test(t);
  let i = lines.findIndex((l) => isHeader(l.trim()));
  if (i < 0) return res;
  // пропустить возможный подзаголовок-разделитель
  for (i = i + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t || /^=+$/.test(t)) continue;
    if (/^(РЕШЕНИЯ|КРАТКИЕ РЕШЕНИЯ|ПОДРОБНЫЕ РЕШЕНИЯ|КРИТЕРИИ|МЕТОДИЧЕСКАЯ)/i.test(t)) break;
    const m = t.match(/^(\d{1,2})\s*[.)—–-]\s*(.+)$/);
    if (m) {
      const n = +m[1];
      if (!res.has(n)) res.set(n, m[2].trim());
    }
  }
  return res;
}

const LEVEL: Record<string, number> = { 'б': 1, 'базовый': 1, 'п': 2, 'повышенный': 2, 'в': 3, 'высокий': 3 };

/** Методкарта: таблица с «|» или список «N. умение — уровень — N балл». */
function parseMethod(lines: string[]): Map<number, { theme: string; level: number; max: number; type?: string }> {
  const res = new Map<number, { theme: string; level: number; max: number; type?: string }>();
  const start = findLine(lines, /^МЕТОДИЧЕСКАЯ КАРТА/i);
  if (start < 0) return res;
  const rows = lines.slice(start + 1);

  // Заголовок таблицы (строка с «|», где есть «Тема» или «Балл»).
  const headerIdx = rows.findIndex((l) => l.includes('|') && /(Тема|Балл|Уровень)/i.test(l));
  if (headerIdx >= 0) {
    const cols = rows[headerIdx].split('|').map((c) => c.trim().toLowerCase());
    const idxBall = cols.findIndex((c) => c.startsWith('балл') || c.includes('макс'));
    const idxLevel = cols.findIndex((c) => c.includes('уровень'));
    const idxTheme = cols.findIndex((c) => c.includes('тема'));
    const idxType = cols.findIndex((c) => c.includes('тип'));
    for (const l of rows.slice(headerIdx + 1)) {
      if (!l.includes('|')) { if (l.trim() && !/^=+$/.test(l.trim()) && res.size) break; else continue; }
      const cells = l.split('|').map((c) => c.trim());
      const n = parseInt(cells[0], 10);
      if (!Number.isFinite(n)) continue;
      const ball = idxBall >= 0 ? parseInt(cells[idxBall], 10) : 1;
      const lvlRaw = idxLevel >= 0 ? (cells[idxLevel] || '').toLowerCase() : '';
      res.set(n, {
        theme: idxTheme >= 0 ? cells[idxTheme] : '',
        level: LEVEL[lvlRaw] ?? 0,
        max: Number.isFinite(ball) ? ball : 1,
        type: idxType >= 0 ? cells[idxType]?.toLowerCase() : undefined,
      });
    }
    return res;
  }

  // Список «N. умение — уровень — N балл(а/ов)».
  for (const l of rows) {
    const t = l.trim();
    if (/^(ОТЧЁТ|ОТЧЕТ|Статус)/i.test(t)) break;
    const m = t.match(/^(\d{1,2})\.\s*(.+?)\s*[—-]\s*(базовый|повышенный|высокий)\s*[—-]\s*(\d+)\s*балл/i);
    if (m) res.set(+m[1], { theme: m[2].trim(), level: LEVEL[m[3].toLowerCase()] ?? 0, max: +m[4] });
  }
  return res;
}

/** Текст заданий + общие тексты (пассажи), которые прикрепляются к диапазону заданий. */
function parseTasks(lines: string[]): Map<number, string> {
  const res = new Map<number, string>();
  // конец зоны заданий — первая секция ответов/решений/методкарты
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (isSection(lines[i].trim())) { end = i; break; }
  }
  const region = lines.slice(0, end);

  // пассажи: «Прочитайте текст и выполните задания A–B» / «Для заданий A-B …»
  const passages: { from: number; to: number; text: string }[] = [];
  for (let i = 0; i < region.length; i++) {
    const m = region[i].match(/(?:задани[йяе]\s*)(\d{1,2})\s*[–-]\s*(\d{1,2})/i);
    if (m && /(Прочитайте|Для заданий|ТЕКСТ ДЛЯ)/i.test(region[i])) {
      // текст пассажа — последующие строки до первого маркера задания
      const buf: string[] = [];
      let j = i + 1;
      for (; j < region.length; j++) {
        if (/^(Задание\s+)?\d{1,2}[.)]\s/.test(region[j].trim())) break;
        buf.push(region[j]);
      }
      passages.push({ from: +m[1], to: +m[2], text: buf.join('\n').trim() });
    }
  }
  const passageFor = (n: number) => passages.filter((p) => n >= p.from && n <= p.to).map((p) => p.text).join('\n\n').trim();

  // маркеры заданий
  const starts: { n: number; idx: number }[] = [];
  for (let i = 0; i < region.length; i++) {
    // маркер задания: «N.» / «N)» / «Задание N.» — текст может быть на той же или следующей строке
    const m = region[i].match(/^(?:Задание\s+)?(\d{1,2})[.)](\s+\S.*)?$/);
    if (m) {
      const n = +m[1];
      // защита от ложных срабатываний (нумерованные варианты ответов 1) … внутри задания):
      // принимаем, только если номер идёт по порядку или это явный «Задание N.»
      starts.push({ n, idx: i });
    }
  }
  // оставляем для каждого номера первый маркер, идущий по возрастанию
  const seen = new Set<number>();
  const clean: { n: number; idx: number }[] = [];
  let max = 0;
  for (const s of starts) {
    if (s.n === max + 1 || (s.n > max && !seen.has(s.n) && s.n <= 30)) {
      if (s.n > max) { clean.push(s); seen.add(s.n); max = s.n; }
    }
  }
  for (let k = 0; k < clean.length; k++) {
    const cur = clean[k];
    const stop = k + 1 < clean.length ? clean[k + 1].idx : region.length;
    const body = region.slice(cur.idx, stop).join('\n').replace(/^(?:Задание\s+)?\d{1,2}[.)]\s*/, '').trim();
    const psg = passageFor(cur.n);
    res.set(cur.n, (psg ? `[Текст к заданию]\n${psg}\n\n` : '') + body);
  }
  return res;
}

/** Решения: «N. …» в секции решений. */
function parseSolutions(lines: string[]): Map<number, string> {
  const res = new Map<number, string>();
  const start = findLine(lines, /^(ПОДРОБНЫЕ РЕШЕНИЯ|РЕШЕНИЯ И КРИТЕРИИ|РЕШЕНИЯ И КОММЕНТАРИИ|КРАТКИЕ РЕШЕНИЯ|Решения:)/i);
  if (start < 0) return res;
  const region = lines.slice(start + 1);
  let cur = -1; let buf: string[] = [];
  const flush = () => { if (cur > 0) res.set(cur, buf.join('\n').trim()); };
  for (const l of region) {
    const t = l.trim();
    if (/^(КРИТЕРИИ|МЕТОДИЧЕСКАЯ|ОТЧЁТ|ОТЧЕТ)/i.test(t)) break;
    const m = t.match(/^(\d{1,2})[.)]\s+(.+)$/);
    if (m) { flush(); cur = +m[1]; buf = [m[2]]; } else if (cur > 0) buf.push(l);
  }
  flush();
  return res;
}

/** Концевой ответ «конкретен» (можно сверить строкой)? Иначе для математики — недоступно. */
function isConcrete(ans: string): boolean {
  if (!ans) return false;
  const a = ans.trim();
  if (/[∪∞π√]|sqrt|[\[\]]|^[а-я]\)|=|корни|реш|нет реш/i.test(a)) return false;
  if (/\(\s*-?\d/.test(a) && /\)/.test(a)) return false; // интервалы/пары (…)
  return (
    /^-?\d+([.,]\d+)?$/.test(a) ||      // целое/десятичное
    /^-?\d+\/\d+$/.test(a) ||            // простая дробь
    /^\d{2,9}$/.test(a) ||              // последовательность цифр
    /^\d+(\s*[;,]\s*\d+)+$/.test(a)      // список чисел
  );
}

// ---------- темы ----------
function parseTemy(file: string): { name: string; numbers: number[] }[] {
  if (!existsSync(file)) return [];
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const themes: { name: string; numbers: number[] }[] = [];
  for (const l of lines) {
    const m = l.match(/^\d{1,2}\.\s*(.+)$/);
    if (!m) continue;
    const body = m[1];
    const name = body.split(/[:—]/)[0].trim();
    const numbers = new Set<number>();
    // диапазоны №A–B и одиночные №N
    const range = body.matchAll(/№?(\d{1,2})\s*[–-]\s*№?(\d{1,2})/g);
    for (const r of range) { const a = +r[1], b = +r[2]; for (let n = a; n <= b; n++) numbers.add(n); }
    const single = body.matchAll(/№(\d{1,2})/g);
    for (const s of single) numbers.add(+s[1]);
    if (name && numbers.size) themes.push({ name, numbers: [...numbers].sort((a, b) => a - b) });
  }
  return themes;
}

// ---------- основной импорт ----------
async function importExam(cfg: ExamCfg) {
  const dir = join(ROOT, cfg.dir);
  const files = readdirSync(dir).filter((f) => /^probnik_.*\.txt$/.test(f)).sort();
  const themes = parseTemy(join(dir, cfg.temy));

  console.log(`\n=== ${cfg.subjectName} (${cfg.examType}/${cfg.code}) ===`);
  console.log(`  тем: ${themes.length}, вариантов: ${files.length}`);

  const subject = await prisma.subject.findUnique({ where: { examType_code: { examType: cfg.examType, code: cfg.code } } });
  if (!subject && !DRY) { console.warn(`  ⚠️ предмет не найден`); return; }

  // темы → topic ids
  const topicId: Record<string, string> = {};
  for (const t of themes) {
    const id = det(`topic2:${cfg.examType}:${cfg.code}:${t.name}`);
    topicId[t.name] = id;
    if (!DRY && subject) {
      await prisma.topic.upsert({
        where: { id },
        update: { name: t.name, egeTaskNumbers: t.numbers },
        create: { id, subjectId: subject.id, name: t.name, egeBlock: 'Темы', egeTaskNumbers: t.numbers, difficultyLevel: 1, orderIndex: 0 },
      });
    }
  }
  const primaryTopicFor = (n: number) => themes.find((t) => t.numbers.includes(n));

  // Очистка старого контента предмета: темы и пробники не из этого импорта.
  if (!DRY && subject) {
    const newTopicIds = Object.values(topicId);
    const newMockIds = files.map((f) => det(`mock2:${cfg.examType}:${cfg.code}:${parseInt(f.match(/variant_?(\d+)/)?.[1] ?? '1', 10)}`));
    await prisma.mockExam.deleteMany({ where: { subjectId: subject.id, id: { notIn: newMockIds } } });
    await prisma.topic.deleteMany({ where: { subjectId: subject.id, id: { notIn: newTopicIds } } });
  }

  for (const file of files) {
    const variant = parseInt(file.match(/variant_?(\d+)/)?.[1] ?? '1', 10);
    const lines = readFileSync(join(dir, file), 'utf8').split(/\r?\n/);
    const answers = parseAnswers(lines);
    const method = parseMethod(lines);
    const texts = parseTasks(lines);
    const sols = parseSolutions(lines);

    const allN = [...new Set([...answers.keys(), ...method.keys()])].sort((a, b) => a - b);
    let active = 0, unavailable = 0, essays = 0, missing: number[] = [];
    const mockTaskIds: string[] = [];

    for (const n of allN) {
      const meta = method.get(n);
      const ans = answers.get(n) ?? '';
      const isEssay = cfg.essays.includes(n);
      const isDetailed = cfg.detailed.includes(n);
      let answerType: AnswerType = AnswerType.SHORT;
      let isActive = true;

      if (isEssay) { answerType = AnswerType.ESSAY; essays++; }
      else if (isDetailed) {
        // математика, часть 2: только если ответ конкретен — иначе недоступно
        if (!isConcrete(ans)) { isActive = false; unavailable++; }
      }
      if (isActive && !isEssay && !ans) { missing.push(n); }

      const max = meta?.max ?? (isEssay ? (cfg.code === 'rus' && cfg.examType === ExamType.EGE ? 22 : 7) : 1);
      const level = meta?.level || (isDetailed ? 3 : 1);
      const theme = primaryTopicFor(n);
      const tid = det(`task2:${cfg.examType}:${cfg.code}:${variant}:${n}`);
      if (isActive) { active++; mockTaskIds.push(tid); }

      if (!DRY && subject) {
        await prisma.task.upsert({
          where: { id: tid },
          update: {
            text: texts.get(n) ?? `Задание ${n}`, correctAnswer: isEssay ? null : ans,
            answerType, isActive, egeTaskNumber: n, difficulty: level, maxScore: max,
            explanation: sols.get(n) ?? null, topicId: theme ? topicId[theme.name] : null,
          },
          create: {
            id: tid, subjectId: subject.id, topicId: theme ? topicId[theme.name] : null,
            egeTaskNumber: n, title: `Задание ${n}`, text: texts.get(n) ?? `Задание ${n}`,
            answerType, correctAnswer: isEssay ? null : ans, isActive, difficulty: level,
            maxScore: max, explanation: sols.get(n) ?? null, source: 'variant',
          },
        });
      }
    }

    // пробник = активные задания варианта
    if (!DRY && subject) {
      const mockId = det(`mock2:${cfg.examType}:${cfg.code}:${variant}`);
      const maxScore = allN.filter((n) => mockTaskIds.includes(det(`task2:${cfg.examType}:${cfg.code}:${variant}:${n}`)))
        .reduce((s, n) => s + (method.get(n)?.max ?? 1), 0);
      await prisma.mockExam.upsert({
        where: { id: mockId },
        update: { tasks: mockTaskIds, maxPrimaryScore: maxScore, isActive: true, title: `${cfg.subjectName} — вариант ${variant}` },
        create: { id: mockId, subjectId: subject.id, title: `${cfg.subjectName} — вариант ${variant}`, durationMinutes: 180, tasks: mockTaskIds, maxPrimaryScore: maxScore, isActive: true },
      });
    }

    console.log(`  • вариант ${variant}: заданий ${allN.length} (активно ${active}, ИИ ${essays}, недоступно ${unavailable})` +
      (missing.length ? `, без ответа: ${missing.join(',')}` : ''));
    if (DRY && variant === 1) {
      const sample = allN.slice(0, 4).map((n) => `№${n}=«${(answers.get(n) ?? '—')}» (${method.get(n)?.max ?? '?'}б, ур.${method.get(n)?.level ?? '?'})`);
      const txt = texts.get(allN[0]) ?? '';
      console.log(`     примеры: ${sample.join('; ')}`);
      console.log(`     текст №${allN[0]} (${txt.length} симв.): ${txt.slice(0, 80).replace(/\n/g, ' ')}…`);
    }
  }
}

async function main() {
  if (DRY) console.log('=== DRY-RUN (в БД ничего не пишется) ===');
  else {
    // удалить старый демо/сгенерированный контент
    const del = await prisma.task.deleteMany({ where: { source: { in: ['demo'] } } });
    console.log(`Удалено старых демо-заданий: ${del.count}`);
  }
  for (const cfg of EXAMS) await importExam(cfg);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
