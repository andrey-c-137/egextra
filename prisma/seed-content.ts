import { AnswerType, ExamType, PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';

// ДЕМО-контент в формате реального экзамена: темы привязаны к номерам заданий
// (некоторые темы охватывают несколько номеров — это нужно для логики плана
// «закрой тему → поднимешь несколько заданий»). Ответы выверены вручную.

const det = (seed: string): string => {
  const h = createHash('md5').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};

type T = { text: string; answer: string };
type NumberDef = { n: number; topic: string; tasks: T[] };
type ExamContent = {
  code: string;
  examType: ExamType;
  topics: Record<string, { name: string; difficulty: number }>;
  numbers: NumberDef[];
};

const MATH_PROF: ExamContent = {
  code: 'math_prof',
  examType: ExamType.EGE,
  topics: {
    plan: { name: 'Планиметрия', difficulty: 1 },
    vect: { name: 'Векторы', difficulty: 1 },
    stereo: { name: 'Стереометрия', difficulty: 2 },
    prob: { name: 'Теория вероятностей', difficulty: 2 },
    alg: { name: 'Уравнения и вычисления', difficulty: 1 },
    func: { name: 'Производная и функции', difficulty: 2 },
    appl: { name: 'Прикладные задачи', difficulty: 2 },
    text: { name: 'Текстовые задачи', difficulty: 2 },
    graph: { name: 'Графики функций', difficulty: 1 },
  },
  numbers: [
    { n: 1, topic: 'plan', tasks: [
      { text: 'В прямоугольном треугольнике гипотенуза 10, один катет 6. Найдите второй катет.', answer: '8' },
      { text: 'Периметр квадрата равен 24. Найдите его площадь.', answer: '36' },
      { text: 'Найдите площадь прямоугольного треугольника с катетами 5 и 12.', answer: '30' },
    ] },
    { n: 2, topic: 'vect', tasks: [
      { text: 'Дан вектор a(3;4). Найдите его длину.', answer: '5' },
      { text: 'Найдите скалярное произведение векторов a(2;3) и b(4;1).', answer: '11' },
      { text: 'A(1;2), B(4;6). Найдите длину вектора AB.', answer: '5' },
    ] },
    { n: 3, topic: 'stereo', tasks: [
      { text: 'Найдите объём куба с ребром 3.', answer: '27' },
      { text: 'Найдите объём прямоугольного параллелепипеда 2×3×5.', answer: '30' },
      { text: 'Найдите площадь полной поверхности куба с ребром 2.', answer: '24' },
    ] },
    { n: 4, topic: 'prob', tasks: [
      { text: 'В урне 3 белых и 7 чёрных шаров. Вероятность достать белый (десятичной дробью)?', answer: '0,3' },
      { text: 'Монету бросают дважды. Вероятность двух орлов?', answer: '0,25' },
      { text: 'В классе 25 учеников, 5 отличников. Вероятность выбрать отличника?', answer: '0,2' },
    ] },
    { n: 5, topic: 'prob', tasks: [
      { text: 'Вероятность попадания 0,8. Вероятность двух попаданий из двух выстрелов?', answer: '0,64' },
      { text: 'P(A)=0,6, P(B)=0,5, события независимы. Найдите P(A и B).', answer: '0,3' },
      { text: 'Вероятность брака детали 0,1. Вероятность, что обе из двух деталей годны?', answer: '0,81' },
    ] },
    { n: 6, topic: 'alg', tasks: [
      { text: 'Решите уравнение 2x + 6 = 0.', answer: '-3' },
      { text: 'Решите уравнение 3x − 12 = 0.', answer: '4' },
      { text: 'Решите уравнение x/2 = 5.', answer: '10' },
    ] },
    { n: 7, topic: 'func', tasks: [
      { text: 'Найдите значение производной f(x)=x² в точке x=3.', answer: '6' },
      { text: 'f(x)=x³. Найдите f′(2).', answer: '12' },
      { text: 'f(x)=5x. Найдите f′(x).', answer: '5' },
    ] },
    { n: 8, topic: 'appl', tasks: [
      { text: 'Тело движется по закону x(t)=t²+3t. Найдите скорость в момент t=2.', answer: '7' },
      { text: 'x(t)=2t². Найдите скорость в момент t=3.', answer: '12' },
      { text: 'Издержки C(x)=10x+50. Найдите предельные издержки C′(x).', answer: '10' },
    ] },
    { n: 9, topic: 'text', tasks: [
      { text: 'Поезд прошёл 240 км за 4 ч. Найдите скорость (км/ч).', answer: '60' },
      { text: 'За 3 ч турист прошёл 15 км. Найдите скорость (км/ч).', answer: '5' },
      { text: 'Рабочий делает 40 деталей за 8 ч. Сколько деталей за 1 ч?', answer: '5' },
    ] },
    { n: 10, topic: 'graph', tasks: [
      { text: 'Прямая y=2x+1. Найдите y при x=3.', answer: '7' },
      { text: 'y=−x+5. Найдите y при x=2.', answer: '3' },
      { text: 'y=3x. При каком x значение функции равно 12?', answer: '4' },
    ] },
    { n: 11, topic: 'func', tasks: [
      { text: 'Найдите наименьшее значение функции y=x²−4x+7.', answer: '3' },
      { text: 'Найдите наибольшее значение функции y=−x²+6x.', answer: '9' },
      { text: 'Найдите точку минимума функции y=x²−6x+1.', answer: '3' },
    ] },
    { n: 12, topic: 'alg', tasks: [
      { text: 'Вычислите 2³ + 3².', answer: '17' },
      { text: 'Вычислите √144 + √81.', answer: '21' },
      { text: 'Найдите 15% от 200.', answer: '30' },
    ] },
  ],
};

const MATH_BASE: ExamContent = {
  code: 'math_base',
  examType: ExamType.EGE,
  topics: {
    calc: { name: 'Вычисления', difficulty: 1 },
    perc: { name: 'Проценты и округление', difficulty: 1 },
    frac: { name: 'Дроби', difficulty: 1 },
    geom: { name: 'Геометрия и площади', difficulty: 1 },
    eq: { name: 'Уравнения', difficulty: 1 },
    prob: { name: 'Вероятность', difficulty: 2 },
    logic: { name: 'Практические задачи', difficulty: 2 },
  },
  numbers: [
    { n: 1, topic: 'calc', tasks: [
      { text: 'Вычислите 7·8 − 6.', answer: '50' },
      { text: 'Вычислите 144 : 12.', answer: '12' },
      { text: 'Вычислите 25·4.', answer: '100' },
    ] },
    { n: 2, topic: 'perc', tasks: [
      { text: 'Найдите 20% от 150.', answer: '30' },
      { text: 'Сколько составляет 10% от 80?', answer: '8' },
      { text: 'Товар стоил 500 р. и подорожал на 10%. Новая цена?', answer: '550' },
    ] },
    { n: 3, topic: 'frac', tasks: [
      { text: 'Вычислите 1/2 + 1/4 (десятичной дробью).', answer: '0,75' },
      { text: 'Запишите 3/5 десятичной дробью.', answer: '0,6' },
      { text: 'Вычислите 0,5 · 0,4.', answer: '0,2' },
    ] },
    { n: 4, topic: 'geom', tasks: [
      { text: 'Площадь прямоугольника со сторонами 4 и 7.', answer: '28' },
      { text: 'Площадь квадрата со стороной 9.', answer: '81' },
      { text: 'Периметр прямоугольника со сторонами 3 и 5.', answer: '16' },
    ] },
    { n: 5, topic: 'eq', tasks: [
      { text: 'Решите уравнение x + 15 = 40.', answer: '25' },
      { text: 'Решите уравнение 5x = 45.', answer: '9' },
      { text: 'Решите уравнение x − 7 = 13.', answer: '20' },
    ] },
    { n: 6, topic: 'perc', tasks: [
      { text: 'Округлите 47,8 до целых.', answer: '48' },
      { text: 'Округлите 3,14 до десятых.', answer: '3,1' },
      { text: 'Округлите 256 до сотен.', answer: '300' },
    ] },
    { n: 7, topic: 'prob', tasks: [
      { text: 'В коробке 4 красных и 6 синих карандашей. Вероятность красного?', answer: '0,4' },
      { text: 'Бросают кубик. Вероятность выпадения чётного числа?', answer: '0,5' },
      { text: 'Из 20 билетов 5 выигрышных. Вероятность выигрыша?', answer: '0,25' },
    ] },
    { n: 8, topic: 'logic', tasks: [
      { text: 'Карандаш стоит 30 р. Сколько карандашей можно купить на 210 р.?', answer: '7' },
      { text: 'В пачке 12 тетрадей. Сколько тетрадей в 4 пачках?', answer: '48' },
      { text: 'Вычислите 1000 − 4·250.', answer: '0' },
    ] },
  ],
};

const OGE_MATH: ExamContent = {
  code: 'oge_math',
  examType: ExamType.OGE,
  topics: {
    calc: { name: 'Вычисления', difficulty: 1 },
    frac: { name: 'Дроби и проценты', difficulty: 1 },
    eq: { name: 'Уравнения', difficulty: 1 },
    geom: { name: 'Геометрия', difficulty: 2 },
    prob: { name: 'Вероятность', difficulty: 2 },
    seq: { name: 'Числа и последовательности', difficulty: 1 },
  },
  numbers: [
    { n: 1, topic: 'calc', tasks: [
      { text: 'Вычислите 0,8 · 0,5.', answer: '0,4' },
      { text: 'Вычислите 12 · 11.', answer: '132' },
      { text: 'Вычислите 100 − 37.', answer: '63' },
    ] },
    { n: 2, topic: 'seq', tasks: [
      { text: 'Сколько целых чисел расположено между 2 и 8 (не включая концы)?', answer: '5' },
      { text: 'Найдите следующее число: 2, 4, 6, 8, …', answer: '10' },
      { text: 'Чему равна сумма 1 + 2 + 3 + 4?', answer: '10' },
    ] },
    { n: 3, topic: 'frac', tasks: [
      { text: 'Найдите 25% от 80.', answer: '20' },
      { text: 'Запишите 1/4 десятичной дробью.', answer: '0,25' },
      { text: 'Вычислите 2/5 от 50.', answer: '20' },
    ] },
    { n: 4, topic: 'eq', tasks: [
      { text: 'Решите уравнение 2x = 18.', answer: '9' },
      { text: 'Решите уравнение x + 11 = 20.', answer: '9' },
      { text: 'Решите уравнение x − 4 = 16.', answer: '20' },
    ] },
    { n: 5, topic: 'geom', tasks: [
      { text: 'Площадь прямоугольника со сторонами 6 и 5.', answer: '30' },
      { text: 'В прямоугольном треугольнике катеты 3 и 4. Найдите гипотенузу.', answer: '5' },
      { text: 'Периметр квадрата со стороной 7.', answer: '28' },
    ] },
    { n: 6, topic: 'prob', tasks: [
      { text: 'В мешке 2 белых и 3 чёрных шара. Вероятность белого?', answer: '0,4' },
      { text: 'Монету бросают один раз. Вероятность орла?', answer: '0,5' },
      { text: 'Из 10 карточек 3 с буквой А. Вероятность вытащить А?', answer: '0,3' },
    ] },
  ],
};

// Русский: задания части 1 с однозначными «буквенными» ответами (выверено).
const RUS_EGE: ExamContent = {
  code: 'rus',
  examType: ExamType.EGE,
  topics: {
    root: { name: 'Правописание корней', difficulty: 1 },
    pref: { name: 'Правописание приставок', difficulty: 1 },
    suf: { name: 'Правописание суффиксов', difficulty: 2 },
    end: { name: 'Личные окончания глаголов', difficulty: 2 },
    nn: { name: 'Н и НН в словах', difficulty: 2 },
  },
  numbers: [
    { n: 9, topic: 'root', tasks: [
      { text: 'Вставьте пропущенную безударную проверяемую гласную корня: пол..гать. Введите только букву.', answer: 'а' },
      { text: 'Вставьте букву (корень раст/рос): р..стение. Введите только букву.', answer: 'а' },
      { text: 'Вставьте букву (корень кас/кос): к..саться. Введите только букву.', answer: 'а' },
    ] },
    { n: 10, topic: 'pref', tasks: [
      { text: 'Вставьте букву (приставка при-/пре-, значение приближения): пр..бывать в город. Введите только букву.', answer: 'и' },
      { text: 'Вставьте букву (значение «очень»): пр..красный. Введите только букву.', answer: 'е' },
      { text: 'Вставьте букву (з/с перед глухой согласной): бе..конечный. Введите только букву.', answer: 'с' },
    ] },
    { n: 11, topic: 'suf', tasks: [
      { text: 'Вставьте букву в суффиксе: затейл..вый. Введите только букву.', answer: 'и' },
      { text: 'Вставьте букву в суффиксе: доверч..вый. Введите только букву.', answer: 'и' },
      { text: 'Вставьте букву в суффиксе: достра..вать. Введите только букву.', answer: 'и' },
    ] },
    { n: 12, topic: 'end', tasks: [
      { text: 'Вставьте букву (I спряжение): бор..щийся за правду. Введите только букву.', answer: 'ю' },
      { text: 'Вставьте букву (II спряжение): терп..щий боль. Введите только букву.', answer: 'я' },
      { text: 'Вставьте букву (глагол «стелить», I спр.): стел..щийся туман. Введите только букву.', answer: 'ю' },
    ] },
    { n: 15, topic: 'nn', tasks: [
      { text: 'Сколько букв Н в слове «кова..ый» (сапог)? Введите число.', answer: '1' },
      { text: 'Сколько букв Н в слове «стекля..ый»? Введите число.', answer: '2' },
      { text: 'Сколько букв Н в слове «пута..ый» (ответ)? Введите число.', answer: '1' },
    ] },
  ],
};

const RUS_OGE: ExamContent = {
  code: 'rus',
  examType: ExamType.OGE,
  topics: {
    ts: { name: 'Правописание и и ы после ц', difficulty: 1 },
    pref: { name: 'Правописание приставок', difficulty: 1 },
    root: { name: 'Правописание корней', difficulty: 1 },
  },
  numbers: [
    { n: 4, topic: 'ts', tasks: [
      { text: 'Вставьте букву (и/ы после ц в корне): ц..фра. Введите только букву.', answer: 'и' },
      { text: 'Вставьте букву (исключение): ц..ган. Введите только букву.', answer: 'ы' },
      { text: 'Вставьте букву (в окончании): сестриц..н платок. Введите только букву.', answer: 'ы' },
    ] },
    { n: 5, topic: 'pref', tasks: [
      { text: 'Вставьте букву (приближение): пр..ехать. Введите только букву.', answer: 'и' },
      { text: 'Вставьте букву (з/с): ра..бить. Введите только букву.', answer: 'з' },
      { text: 'Вставьте букву (значение «очень»): пр..интересный. Введите только букву.', answer: 'и' },
    ] },
    { n: 7, topic: 'root', tasks: [
      { text: 'Вставьте проверяемую гласную корня: т..жёлый. Введите только букву.', answer: 'я' },
      { text: 'Вставьте проверяемую гласную корня: л..сной. Введите только букву.', answer: 'е' },
      { text: 'Вставьте проверяемую гласную корня: д..ждливый. Введите только букву.', answer: 'о' },
    ] },
  ],
};

const ALL: ExamContent[] = [MATH_PROF, MATH_BASE, OGE_MATH, RUS_EGE, RUS_OGE];

export async function seedContent(prisma: PrismaClient) {
  for (const exam of ALL) {
    const subject = await prisma.subject.findUnique({
      where: { examType_code: { examType: exam.examType, code: exam.code } },
    });
    if (!subject) {
      // eslint-disable-next-line no-console
      console.warn(`⚠️  Предмет ${exam.examType}/${exam.code} не найден — пропускаю контент`);
      continue;
    }

    // Темы: egeTaskNumbers = все номера, ссылающиеся на эту тему (пересечение для плана).
    const numbersByTopic: Record<string, number[]> = {};
    for (const num of exam.numbers) (numbersByTopic[num.topic] ??= []).push(num.n);

    const topicId: Record<string, string> = {};
    for (const [key, t] of Object.entries(exam.topics)) {
      const id = det(`topic:${exam.examType}:${exam.code}:${key}`);
      topicId[key] = id;
      await prisma.topic.upsert({
        where: { id },
        update: {
          name: t.name,
          egeTaskNumbers: numbersByTopic[key] ?? [],
          difficultyLevel: t.difficulty,
        },
        create: {
          id,
          subjectId: subject.id,
          name: t.name,
          egeBlock: 'Часть 1',
          egeTaskNumbers: numbersByTopic[key] ?? [],
          difficultyLevel: t.difficulty,
          orderIndex: 0,
        },
      });
    }

    // Банк заданий: 3 задания на каждый номер.
    for (const num of exam.numbers) {
      for (let v = 0; v < num.tasks.length; v++) {
        const task = num.tasks[v];
        const id = det(`task:${exam.examType}:${exam.code}:${num.n}:${v}`);
        await prisma.task.upsert({
          where: { id },
          update: { text: task.text, correctAnswer: task.answer, egeTaskNumber: num.n, topicId: topicId[num.topic] },
          create: {
            id,
            subjectId: subject.id,
            topicId: topicId[num.topic],
            egeTaskNumber: num.n,
            title: `Задание ${num.n}`,
            text: task.text,
            answerType: AnswerType.SHORT,
            correctAnswer: task.answer,
            difficulty: exam.topics[num.topic].difficulty,
            maxScore: 1,
            source: 'demo',
          },
        });
      }
    }

    // 2 полных пробника: вариант A (задания индекса 0), вариант B (индекса 1).
    for (let variant = 0; variant < 2; variant++) {
      const id = det(`mock:${exam.examType}:${exam.code}:${variant}`);
      const taskIds = exam.numbers.map((num) =>
        det(`task:${exam.examType}:${exam.code}:${num.n}:${variant % num.tasks.length}`),
      );
      await prisma.mockExam.upsert({
        where: { id },
        update: { tasks: taskIds, maxPrimaryScore: exam.numbers.length, isActive: true },
        create: {
          id,
          subjectId: subject.id,
          title: `${subject.name} — пробник, вариант ${variant === 0 ? 'A' : 'B'}`,
          durationMinutes: 180,
          tasks: taskIds,
          maxPrimaryScore: exam.numbers.length,
          isActive: true,
        },
      });
    }

    // eslint-disable-next-line no-console
    console.log(`  • ${subject.name}: тем ${Object.keys(exam.topics).length}, заданий ${exam.numbers.reduce((s, n) => s + n.tasks.length, 0)}, пробников 2`);
  }
}
