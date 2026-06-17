import { AiRequestType, AnswerType, ExamType, PrismaClient } from '@prisma/client';
import {
  ESSAY_CHECK_PROMPT_KEY,
  ESSAY_CHECK_SYSTEM,
} from '../src/modules/ai/prompts/essay-check.prompt';
import { seedContent } from './seed-content';

const prisma = new PrismaClient();

type SubjectSeed = { code: string; name: string; mandatory?: boolean };

// Каталог ЕГЭ (русский + математика — опорные; остальное по выбору)
const EGE: SubjectSeed[] = [
  { code: 'rus', name: 'Русский язык', mandatory: true },
  { code: 'math_prof', name: 'Математика (профильная)' },
  { code: 'math_base', name: 'Математика (базовая)' },
  { code: 'inf', name: 'Информатика' },
  { code: 'phys', name: 'Физика' },
  { code: 'chem', name: 'Химия' },
  { code: 'bio', name: 'Биология' },
  { code: 'hist', name: 'История' },
  { code: 'soc', name: 'Обществознание' },
  { code: 'geo', name: 'География' },
  { code: 'lit', name: 'Литература' },
  { code: 'eng', name: 'Английский язык' },
  { code: 'ger', name: 'Немецкий язык' },
  { code: 'fr', name: 'Французский язык' },
  { code: 'esp', name: 'Испанский язык' },
  { code: 'chi', name: 'Китайский язык' },
];

// Каталог ОГЭ (русский + математика обязательны, минимум 2 по выбору)
const OGE: SubjectSeed[] = [
  { code: 'rus', name: 'Русский язык', mandatory: true },
  { code: 'oge_math', name: 'Математика', mandatory: true },
  { code: 'inf', name: 'Информатика' },
  { code: 'phys', name: 'Физика' },
  { code: 'chem', name: 'Химия' },
  { code: 'bio', name: 'Биология' },
  { code: 'hist', name: 'История' },
  { code: 'soc', name: 'Обществознание' },
  { code: 'geo', name: 'География' },
  { code: 'lit', name: 'Литература' },
  { code: 'eng', name: 'Английский язык' },
  { code: 'ger', name: 'Немецкий язык' },
  { code: 'fr', name: 'Французский язык' },
  { code: 'esp', name: 'Испанский язык' },
];

// MVP: активны только эти экзамены (логика и контент пока под них).
// EGE: русский + математика (профиль/база); OGE: русский + математика.
const MVP_ACTIVE: Record<string, string[]> = {
  EGE: ['rus', 'math_prof', 'math_base'],
  OGE: ['rus', 'oge_math'],
};

async function seedCatalog(examType: ExamType, list: SubjectSeed[]) {
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const isActive = MVP_ACTIVE[examType]?.includes(s.code) ?? false;
    await prisma.subject.upsert({
      where: { examType_code: { examType, code: s.code } },
      update: { name: s.name, isMandatory: !!s.mandatory, orderIndex: i, isActive },
      create: {
        code: s.code,
        name: s.name,
        examType,
        isMandatory: !!s.mandatory,
        orderIndex: i,
        isActive,
      },
    });
  }
}

async function main() {
  await seedCatalog(ExamType.EGE, EGE);
  await seedCatalog(ExamType.OGE, OGE);

  // Контент для MVP: русский ЕГЭ — тема «Сочинение» + задание 27.
  const rusEge = await prisma.subject.findUniqueOrThrow({
    where: { examType_code: { examType: ExamType.EGE, code: 'rus' } },
  });

  const topic = await prisma.topic.upsert({
    where: { id: '00000000-0000-0000-0000-000000000010' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000010',
      subjectId: rusEge.id,
      name: 'Сочинение (часть 2)',
      egeBlock: 'Часть 2',
      egeTaskNumbers: [27],
      difficultyLevel: 3,
      orderIndex: 1,
    },
  });

  await prisma.task.upsert({
    where: { id: '00000000-0000-0000-0000-000000000011' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000011',
      subjectId: rusEge.id,
      topicId: topic.id,
      egeTaskNumber: 27,
      title: 'Сочинение по тексту',
      text: 'Напишите сочинение по прочитанному тексту (объём не менее 150 слов).',
      answerType: AnswerType.ESSAY,
      maxScore: 22,
      source: 'demo',
    },
  });

  // Демо-контент в формате экзамена: темы (с пересечением номеров заданий),
  // банк заданий (3/тему) и по 2 полных пробника на каждый из 5 MVP-экзаменов.
  console.log('📚 Контент:');
  await seedContent(prisma);

  // Активный промпт проверки сочинения (версия 1).
  await prisma.promptTemplate.upsert({
    where: { key_version: { key: ESSAY_CHECK_PROMPT_KEY, version: 1 } },
    update: { template: ESSAY_CHECK_SYSTEM, isActive: true },
    create: {
      key: ESSAY_CHECK_PROMPT_KEY,
      version: 1,
      type: AiRequestType.CHECK_ESSAY,
      template: ESSAY_CHECK_SYSTEM,
      isActive: true,
    },
  });

  // eslint-disable-next-line no-console
  console.log(
    `✅ Seed: каталог ЕГЭ (${EGE.length}) + ОГЭ (${OGE.length}) + русский (тема, задание) + промпт`,
  );
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
