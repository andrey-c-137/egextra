import { AnswerType, PrismaClient } from '@prisma/client';

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

  // eslint-disable-next-line no-console
  console.log('✅ Seed выполнен: русский язык + тема сочинения + задание');
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
