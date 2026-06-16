import { AiRequestType, AnswerType, PrismaClient } from '@prisma/client';
import {
  ESSAY_CHECK_PROMPT_KEY,
  ESSAY_CHECK_SYSTEM,
} from '../src/modules/ai/prompts/essay-check.prompt';

const prisma = new PrismaClient();

// Минимальный сид для MVP по русскому языку.
async function main() {
  const russian = await prisma.subject.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Русский язык',
      examType: 'EGE',
    },
  });

  const topic = await prisma.topic.create({
    data: {
      subjectId: russian.id,
      name: 'Сочинение (часть 2)',
      egeBlock: 'Часть 2',
      egeTaskNumbers: [27],
      difficultyLevel: 3,
      orderIndex: 1,
    },
  });

  await prisma.task.create({
    data: {
      subjectId: russian.id,
      topicId: topic.id,
      egeTaskNumber: 27,
      title: 'Сочинение по тексту',
      text: 'Напишите сочинение по прочитанному тексту (объём не менее 150 слов).',
      answerType: AnswerType.ESSAY,
      maxScore: 21,
      source: 'demo',
    },
  });

  // Активный промпт проверки сочинения (версия 1) — методист правит через админку.
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
  console.log('✅ Seed выполнен: русский язык + тема сочинения + задание + промпт проверки сочинения');
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
