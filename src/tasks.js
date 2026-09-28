// Библиотека заданий 14 ОГЭ: сюжеты таблиц, генераторы данных по номеру варианта,
// эталонные ответы и типичные ошибки для пояснений при проверке.

export const LEVELS = {
  1: 'Как на ОГЭ',
  2: 'Посложнее',
};

// ---------- Случайные числа: один и тот же вариант всегда даёт одну и ту же таблицу ----------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function rng(taskId, variant, salt = '') {
  const rand = mulberry32(hashStr(taskId + '/' + variant + salt));
  const int = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const pick = (arr) => arr[int(0, arr.length - 1)];
  // Выбор по весам: [[значение, вес], …]
  const weighted = (pairs) => {
    const total = pairs.reduce((s, p) => s + p[1], 0);
    let x = rand() * total;
    for (const [v, w] of pairs) if ((x -= w) < 0) return v;
    return pairs[pairs.length - 1][0];
  };
  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = int(0, i);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  // Нормальное распределение (Бокс — Мюллер)
  const normal = (mean, sd) => mean + sd * Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  return { rand, int, pick, weighted, shuffle, normal };
}

const round1 = (x) => Math.round(x * 10) / 10;

// Ставит граничное значение в несколько подходящих строк, чтобы ошибка «>» вместо «>=»
// (и наоборот) меняла ответ и её можно было распознать
function plant(rows, fits, apply, r, n = 2) {
  const idx = rows.map((row, i) => (fits(row) ? i : -1)).filter((i) => i >= 0);
  for (let k = 0; k < n && idx.length; k++) apply(rows[idx.splice(r.int(0, idx.length - 1), 1)[0]]);
}
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// ---------- Подсчёты ----------

const countIf = (rows, f) => rows.reduce((s, r) => s + (f(r) ? 1 : 0), 0);
const sumIf = (rows, f, g) => rows.reduce((s, r) => s + (f(r) ? g(r) : 0), 0);
const avgIf = (rows, f, g) => {
  const n = countIf(rows, f);
  return n ? sumIf(rows, f, g) / n : NaN;
};

// Число по-русски: 230,63
export function fmtNum(x, digits = null) {
  if (typeof x !== 'number' || !Number.isFinite(x)) return String(x);
  let s;
  if (digits !== null) s = x.toFixed(digits);
  else s = Number.isInteger(x) ? String(x) : String(Math.round(x * 1e6) / 1e6);
  return s.replace('.', ',').replace('-', '−');
}

// Порядковые слова для классов и возрастов
const CLASS_PEOPLE = {
  5: 'пятиклассников', 6: 'шестиклассников', 7: 'семиклассников', 8: 'восьмиклассников',
  9: 'девятиклассников', 10: 'десятиклассников', 11: 'одиннадцатиклассников',
};

function listRu(items) {
  return items.length < 2 ? items.join('') : items.slice(0, -1).join(', ') + ' и ' + items[items.length - 1];
}

// Совпадение подписи категории с ожидаемой: «8», «8 класс», «8 кл.» → 8
const tokenMatch = (label) => (text) => {
  const t = String(text).toLowerCase().replace(/ё/g, 'е').trim();
  const l = String(label).toLowerCase().replace(/ё/g, 'е');
  if (t === l) return true;
  const esc = l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}($|[^\\p{L}\\p{N}])`, 'u').test(t);
};

// ---------- Задания ----------

function task(def) {
  return { level: 1, sheetName: 'Лист1', ...def };
}

export const TASKS = [
  // 1. Олимпиада — как в демоверсии ОГЭ 2027
  task({
    id: 'olymp',
    title: 'Олимпиада по математике',
    source: 'Как в демоверсии ОГЭ 2026–2027',
    intro: 'В электронную таблицу внесли данные олимпиады по математике.',
    columns: [
      { title: 'номер участника', width: 3.4, type: 'string', note: 'номер участника' },
      { title: 'номер школы', width: 2.6, type: 'float', note: 'номер школы' },
      { title: 'класс', width: 1.8, type: 'float', note: 'класс' },
      { title: 'баллы', width: 1.8, type: 'float', note: 'набранные баллы' },
    ],
    count: 1000,
    unit: 'участников',
    generate(variant) {
      const r = rng(this.id, variant);
      const schoolWeights = Array.from({ length: 50 }, (_, i) => [i + 1, 0.4 + r.rand()]);
      const rows = [];
      for (let i = 1; i <= this.count; i++) {
        const cls = r.weighted([[7, 22], [8, 20], [9, 21], [10, 19], [11, 18]]);
        const score = Math.round(clamp(r.normal(200 + (cls - 7) * 8, 85), 0, 400));
        rows.push([`участник ${i}`, r.weighted(schoolWeights), cls, score]);
      }
      const p = rng(this.id, variant, ':q');
      const params = {
        cls: p.pick([7, 8, 9, 10, 11]),
        threshold: p.pick([180, 190, 200, 210, 220, 230, 240, 250, 260]),
        school: p.int(1, 50),
        chart: p.pick([[7, 8, 9], [8, 9, 10], [9, 10, 11], [7, 9, 11], [7, 8, 9]]),
      };
      plant(rows, (row) => row[2] === params.cls, (row) => (row[3] = params.threshold), p);
      return { rows, params };
    },
    questions: (p) => [
      `Сколько ${CLASS_PEOPLE[p.cls]} набрали более ${p.threshold} баллов?`,
      `Каков средний балл, полученный учениками школы № ${p.school}?`,
      `Постройте круговую диаграмму, отображающую соотношение числа участников из ${listRu(p.chart.map(String))} классов.`,
    ],
    evaluate(rows, p) {
      const CL = 2, SC = 3, SH = 1;
      const q1 = (r) => r[CL] === p.cls && r[SC] > p.threshold;
      const bySchool = (r) => r[SH] === p.school;
      const classCount = (c) => countIf(rows, (r) => r[CL] === c);
      return {
        a1: { value: countIf(rows, q1), digits: 0 },
        a2: { value: avgIf(rows, bySchool, (r) => r[SC]), digits: 2 },
        chart: {
          labels: p.chart.map(String),
          values: p.chart.map(classCount),
          match: p.chart.map((c) => tokenMatch(c)),
          what: `число участников из ${listRu(p.chart.map(String))} классов`,
        },
        mistakes1: [
          { value: countIf(rows, (r) => r[CL] === p.cls && r[SC] >= p.threshold), why: `Похоже, посчитаны участники с баллом «${p.threshold} и больше». В условии «более ${p.threshold}» — нужен знак «>», а не «>=».` },
          { value: classCount(p.cls), why: `Это просто количество ${CLASS_PEOPLE[p.cls]}. Не учтено второе условие — баллы больше ${p.threshold}.` },
          { value: countIf(rows, (r) => r[SC] > p.threshold), why: `Это количество всех участников с баллом больше ${p.threshold}. Не учтено первое условие — класс ${p.cls}.` },
          { value: countIf(rows, (r) => r[CL] === p.cls && r[SC] < p.threshold), why: `Посчитаны ${CLASS_PEOPLE[p.cls]} с баллом меньше ${p.threshold} — знак сравнения перевёрнут.` },
          { value: countIf(rows, (r) => r[CL] === p.cls && r[SC] <= p.threshold), why: `Посчитаны ${CLASS_PEOPLE[p.cls]} с баллом не больше ${p.threshold} — знак сравнения перевёрнут.` },
        ],
        mistakes2: [
          { value: avgIf(rows, () => true, (r) => r[SC]), why: 'Это средний балл всех участников олимпиады, а нужен средний балл только учеников указанной школы.' },
          { value: sumIf(rows, bySchool, (r) => r[SC]), why: 'Это сумма баллов учеников школы. Чтобы получить среднее, сумму нужно разделить на количество учеников (или сразу использовать СРЗНАЧЕСЛИ).' },
          { value: countIf(rows, bySchool), why: 'Это количество учеников школы, а спрашивается их средний балл.' },
          { value: avgIf(rows, bySchool, (r) => r[CL]), why: 'Усреднён столбец «класс», а нужен столбец с баллами (D).' },
        ],
        mistakesChart: [
          { values: [7, 8, 9, 10, 11].map(classCount), why: 'На диаграмме все классы с 7 по 11, а нужны только те, что названы в условии.' },
          { values: p.chart.map((c) => sumIf(rows, (r) => r[CL] === c, (r) => r[SC])), why: 'Сектора построены по сумме баллов, а нужно число участников каждого класса.' },
        ],
      };
    },
    hint: (p) => `
      <p><b>1.</b> Два условия сразу: класс равен ${p.cls} <i>и</i> баллы больше ${p.threshold}. Удобно взять функцию <code>СЧЁТЕСЛИМН</code> — у неё можно задать несколько пар «диапазон; условие».</p>
      <p><b>2.</b> Средний балл по условию считает <code>СРЗНАЧЕСЛИ(диапазон_условия; условие; диапазон_усреднения)</code>.</p>
      <p><b>3.</b> Сначала посчитайте в свободных ячейках, сколько участников в каждом классе (<code>СЧЁТЕСЛИ</code>), а потом стройте диаграмму по этим ячейкам.</p>`,
    solution: (p) => [
      ['H2', `=СЧЁТЕСЛИМН(C2:C1001;${p.cls};D2:D1001;">${p.threshold}")`],
      ['H3', `=СРЗНАЧЕСЛИ(B2:B1001;${p.school};D2:D1001)`],
      ...p.chart.flatMap((c, i) => [[`G${6 + i}`, String(c)], [`H${6 + i}`, `=СЧЁТЕСЛИ(C2:C1001;${c})`]]),
    ],
    solutionNote: (p) => `Диаграмму стройте по диапазону G6:H${5 + p.chart.length}: в столбце G — подписи (классы), в H — количество участников.`,
  }),

  // 2. Тестирование учеников по округам — классика открытого банка
  task({
    id: 'districts',
    title: 'Тестирование учеников по округам',
    source: 'По мотивам открытого банка ФИПИ',
    intro: 'В электронную таблицу занесли данные о тестировании учеников.',
    columns: [
      { title: 'округ', width: 1.8, type: 'string', note: 'округ, в котором учится ученик' },
      { title: 'фамилия', width: 3, type: 'string', note: 'фамилия' },
      { title: 'предмет', width: 4, type: 'string', note: 'любимый предмет' },
      { title: 'балл', width: 1.8, type: 'float', note: 'тестовый балл' },
    ],
    count: 1000,
    unit: 'ученикам',
    districts: [
      ['С', 'Северном'], ['В', 'Восточном'], ['Ю', 'Южном'], ['З', 'Западном'], ['Ц', 'Центральном'],
      ['СВ', 'Северо-Восточном'], ['СЗ', 'Северо-Западном'], ['ЮВ', 'Юго-Восточном'], ['ЮЗ', 'Юго-Западном'],
    ],
    subjects: [
      ['русский язык', 'русский язык'], ['математика', 'математику'], ['информатика', 'информатику'],
      ['физика', 'физику'], ['обществознание', 'обществознание'], ['английский язык', 'английский язык'],
      ['немецкий язык', 'немецкий язык'], ['история', 'историю'], ['химия', 'химию'], ['биология', 'биологию'],
    ],
    generate(variant) {
      const r = rng(this.id, variant);
      const dw = this.districts.map((d) => [d[0], 0.6 + r.rand()]);
      const sw = this.subjects.map((s) => [s[0], 0.5 + r.rand()]);
      const rows = [];
      for (let i = 1; i <= this.count; i++) {
        rows.push([r.weighted(dw), `Ученик ${i}`, r.weighted(sw), r.int(200, 800)]);
      }
      const p = rng(this.id, variant, ':q');
      const [d1, d2] = p.shuffle(this.districts);
      // Для второго вопроса берём «короткий» код: тогда видна ловушка С / СВ / СЗ
      const d2short = p.pick(this.districts.filter((d) => d[0].length === 1 && d[0] !== d1[0]));
      const subj = p.pick(this.subjects);
      const chart = p.shuffle(this.subjects).slice(0, 3);
      return { rows, params: { d1, d2: p.rand() < 0.7 ? d2short : d2, subj, chart } };
    },
    questions: (p) => [
      `Сколько учеников в ${p.d1[1]} округе (${p.d1[0]}) выбрали в качестве любимого предмета ${p.subj[1]}?`,
      `Каков средний тестовый балл у учеников ${p.d2[1].replace(/ом$/, 'ого')} округа (${p.d2[0]})?`,
      `Постройте круговую диаграмму, отображающую соотношение числа учеников, выбравших любимым предметом ${listRu(p.chart.map((s) => s[1]))}.`,
    ],
    evaluate(rows, p) {
      const D = 0, S = 2, B = 3;
      const q1 = (r) => r[D] === p.d1[0] && r[S] === p.subj[0];
      const inD2 = (r) => r[D] === p.d2[0];
      const bySubj = (s) => countIf(rows, (r) => r[S] === s);
      return {
        a1: { value: countIf(rows, q1), digits: 0 },
        a2: { value: avgIf(rows, inD2, (r) => r[B]), digits: 2 },
        chart: {
          labels: p.chart.map((s) => s[0]),
          values: p.chart.map((s) => bySubj(s[0])),
          match: p.chart.map((s) => tokenMatch(s[0])),
          what: `число учеников, выбравших ${listRu(p.chart.map((s) => s[1]))}`,
        },
        mistakes1: [
          { value: countIf(rows, (r) => r[D] === p.d1[0]), why: `Это все ученики округа ${p.d1[0]}. Не учтено второе условие — любимый предмет.` },
          { value: bySubj(p.subj[0]), why: `Это все ученики, выбравшие ${p.subj[1]}, из всех округов. Не учтено условие на округ.` },
          { value: countIf(rows, (r) => r[D].startsWith(p.d1[0]) && r[S] === p.subj[0]), why: `В подсчёт попали соседние округа, код которых начинается с «${p.d1[0]}». Условие должно совпадать с кодом округа целиком.` },
        ],
        mistakes2: [
          { value: avgIf(rows, () => true, (r) => r[B]), why: 'Это средний балл всех учеников, а нужен средний балл только указанного округа.' },
          { value: avgIf(rows, (r) => r[D].startsWith(p.d2[0]), (r) => r[B]), why: `В подсчёт попали и соседние округа, код которых начинается с «${p.d2[0]}» (например, «${p.d2[0]}В» или «${p.d2[0]}З»). Нужно точное совпадение: условие "${p.d2[0]}" без звёздочки.` },
          { value: sumIf(rows, inD2, (r) => r[B]), why: 'Это сумма баллов, а не среднее. Разделите сумму на количество учеников или используйте СРЗНАЧЕСЛИ.' },
          { value: countIf(rows, inD2), why: 'Это количество учеников округа, а спрашивается средний балл.' },
        ],
        mistakesChart: [
          { values: p.chart.map((s) => sumIf(rows, (r) => r[S] === s[0], (r) => r[B])), why: 'Сектора построены по сумме баллов, а нужно число учеников.' },
        ],
      };
    },
    hint: (p) => `
      <p><b>1.</b> Нужны два условия: округ «${p.d1[0]}» и предмет «${p.subj[0]}». Функция <code>СЧЁТЕСЛИМН</code> принимает несколько пар «диапазон; условие». Текстовое условие пишут в кавычках.</p>
      <p><b>2.</b> Осторожно с кодами: «С» и «СВ» — разные округа. Условие <code>"${p.d2[0]}"</code> в <code>СРЗНАЧЕСЛИ</code> даёт точное совпадение — не добавляйте звёздочку.</p>
      <p><b>3.</b> Выпишите названия трёх предметов в столбец и рядом посчитайте количество учеников по каждому (<code>СЧЁТЕСЛИ</code>). Диаграмму стройте по этим ячейкам.</p>`,
    solution: (p) => [
      ['H2', `=СЧЁТЕСЛИМН(A2:A1001;"${p.d1[0]}";C2:C1001;"${p.subj[0]}")`],
      ['H3', `=СРЗНАЧЕСЛИ(A2:A1001;"${p.d2[0]}";D2:D1001)`],
      ...p.chart.flatMap((s, i) => [[`G${6 + i}`, s[0]], [`H${6 + i}`, `=СЧЁТЕСЛИ(C2:C1001;G${6 + i})`]]),
    ],
    solutionNote: () => 'Диаграмму стройте по диапазону G6:H8: в столбце G — названия предметов, в H — количество учеников.',
  }),

  // 3. Грузоперевозки
  task({
    id: 'cargo',
    title: 'Грузоперевозки',
    source: 'По мотивам открытого банка ФИПИ',
    intro: 'В электронную таблицу занесли информацию о грузоперевозках, совершённых некоторым автопредприятием с 1 октября по 31 декабря.',
    columns: [
      { title: 'Дата', width: 2, type: 'string', note: 'дата перевозки' },
      { title: 'Пункт отправления', width: 3.6, type: 'string', note: 'название населённого пункта отправления' },
      { title: 'Пункт назначения', width: 3.6, type: 'string', note: 'название населённого пункта назначения' },
      { title: 'Расстояние', width: 2.4, type: 'float', note: 'расстояние перевозки (в километрах)' },
      { title: 'Расход бензина', width: 2.8, type: 'float', note: 'расход бензина на всю перевозку (в литрах)' },
      { title: 'Масса груза', width: 2.4, type: 'float', note: 'масса перевезённого груза (в килограммах)' },
    ],
    count: 370,
    unit: 'перевозкам',
    places: ['Липки', 'Орехово', 'Осинки', 'Берёзки', 'Дубки', 'Сосновка', 'Вязово', 'Ельники'],
    generate(variant) {
      const r = rng(this.id, variant);
      const pw = this.places.map((x) => [x, 0.5 + r.rand()]);
      const dist = new Map();
      const rows = [];
      const days = [[10, 31], [11, 30], [12, 31]].flatMap(([m, n]) => Array.from({ length: n }, (_, d) => `${String(d + 1).padStart(2, '0')}.${m}`));
      for (let i = 0; i < this.count; i++) {
        const from = r.weighted(pw);
        let to = r.weighted(pw);
        while (to === from) to = r.weighted(pw);
        const k = [from, to].sort().join('|');
        if (!dist.has(k)) dist.set(k, r.int(20, 180) * 5);
        const km = dist.get(k);
        const mass = r.int(10, 160) * 10;
        const fuel = Math.round(km * (0.12 + mass / 20000 + r.rand() * 0.02));
        rows.push([days[Math.floor((i * days.length) / this.count)], from, to, km, fuel, mass]);
      }
      const p = rng(this.id, variant, ':q');
      const [a, b, c] = p.shuffle(this.places);
      return { rows, params: { from: a, to: b, dest: c, chart: p.shuffle(this.places).slice(0, 3) } };
    },
    questions: (p) => [
      `Сколько перевозок было выполнено из пункта ${p.from} в пункт ${p.to}?`,
      `Какова общая масса грузов (в килограммах), доставленных в пункт ${p.dest}?`,
      `Постройте круговую диаграмму, отображающую соотношение числа перевозок, выполненных из пунктов ${listRu(p.chart)}.`,
    ],
    evaluate(rows, p) {
      const F = 1, T = 2, M = 5;
      const fromCount = (x) => countIf(rows, (r) => r[F] === x);
      return {
        a1: { value: countIf(rows, (r) => r[F] === p.from && r[T] === p.to), digits: 0 },
        a2: { value: sumIf(rows, (r) => r[T] === p.dest, (r) => r[M]), digits: 0 },
        chart: {
          labels: p.chart,
          values: p.chart.map(fromCount),
          match: p.chart.map((x) => tokenMatch(x)),
          what: `число перевозок из пунктов ${listRu(p.chart)}`,
        },
        mistakes1: [
          { value: countIf(rows, (r) => r[F] === p.to && r[T] === p.from), why: `Посчитаны перевозки в обратную сторону — из ${p.to} в ${p.from}. Пункт отправления — столбец B, пункт назначения — столбец C.` },
          { value: fromCount(p.from), why: `Это все перевозки из пункта ${p.from}. Не учтён пункт назначения.` },
          { value: countIf(rows, (r) => r[T] === p.to), why: `Это все перевозки в пункт ${p.to}. Не учтён пункт отправления.` },
          { value: countIf(rows, (r) => (r[F] === p.from && r[T] === p.to) || (r[F] === p.to && r[T] === p.from)), why: 'Посчитаны перевозки в обе стороны. Нужны только перевозки в одном направлении.' },
        ],
        mistakes2: [
          { value: sumIf(rows, (r) => r[F] === p.dest, (r) => r[M]), why: `Это масса грузов, отправленных из пункта ${p.dest}. Нужны грузы, доставленные в этот пункт, — условие по столбцу C.` },
          { value: avgIf(rows, (r) => r[T] === p.dest, (r) => r[M]), why: 'Это средняя масса груза, а спрашивается общая (сумма).' },
          { value: countIf(rows, (r) => r[T] === p.dest), why: 'Это количество перевозок, а спрашивается общая масса грузов.' },
          { value: sumIf(rows, (r) => r[T] === p.dest, (r) => r[3]), why: 'Просуммирован столбец «Расстояние», а нужен столбец «Масса груза» (F).' },
        ],
        mistakesChart: [
          { values: p.chart.map((x) => countIf(rows, (r) => r[T] === x)), why: 'Посчитаны перевозки в эти пункты, а нужны перевозки из них — условие по столбцу B.' },
        ],
      };
    },
    hint: (p) => `
      <p><b>1.</b> Два условия: пункт отправления (столбец B) — «${p.from}», пункт назначения (столбец C) — «${p.to}». Используйте <code>СЧЁТЕСЛИМН</code>.</p>
      <p><b>2.</b> Сумма по условию — <code>СУММЕСЛИ(диапазон_условия; условие; диапазон_суммирования)</code>. Доставлено <i>в</i> пункт — значит, условие по столбцу C.</p>
      <p><b>3.</b> Посчитайте перевозки из каждого из трёх пунктов в отдельных ячейках, затем стройте диаграмму по ним.</p>`,
    solution: (p) => [
      ['H2', `=СЧЁТЕСЛИМН(B2:B${p.n + 1};"${p.from}";C2:C${p.n + 1};"${p.to}")`],
      ['H3', `=СУММЕСЛИ(C2:C${p.n + 1};"${p.dest}";F2:F${p.n + 1})`],
      ...p.chart.flatMap((x, i) => [[`H${6 + i}`, x], [`I${6 + i}`, `=СЧЁТЕСЛИ(B2:B${p.n + 1};H${6 + i})`]]),
    ],
    solutionNote: () => 'В этой таблице занят столбец F, поэтому вспомогательные ячейки для диаграммы удобно поставить в H6:I8, а саму диаграмму — чуть ниже или правее.',
  }),

  // 4. Погода: условие на диапазон строк (сезон) и дробные данные
  task({
    id: 'weather',
    level: 2,
    title: 'Наблюдения за погодой',
    source: 'По мотивам открытого банка ФИПИ',
    intro: 'В электронную таблицу занесли данные наблюдения за погодой в течение одного года. Каждая строка таблицы содержит запись об одном дне.',
    columns: [
      { title: 'Дата', width: 2, type: 'string', note: 'дата наблюдения' },
      { title: 'Осадки', width: 2, type: 'float', note: 'количество осадков (в миллиметрах)' },
      { title: 'Температура', width: 2.6, type: 'float', note: 'среднесуточная температура воздуха (в градусах Цельсия)' },
      { title: 'Ветер', width: 1.8, type: 'string', note: 'направление ветра' },
      { title: 'Скорость ветра', width: 2.8, type: 'float', note: 'среднесуточная скорость ветра (в метрах в секунду)' },
    ],
    count: 365,
    unit: 'дням',
    seasons: [
      { name: 'весенние месяцы (март, апрель, май)', months: [3, 4, 5], short: 'весну' },
      { name: 'летние месяцы (июнь, июль, август)', months: [6, 7, 8], short: 'лето' },
      { name: 'осенние месяцы (сентябрь, октябрь, ноябрь)', months: [9, 10, 11], short: 'осень' },
    ],
    winds: [['С', 'северный', 'северным'], ['СВ', 'северо-восточный', 'северо-восточным'], ['В', 'восточный', 'восточным'], ['ЮВ', 'юго-восточный', 'юго-восточным'], ['Ю', 'южный', 'южным'], ['ЮЗ', 'юго-западный', 'юго-западным'], ['З', 'западный', 'западным'], ['СЗ', 'северо-западный', 'северо-западным']],
    generate(variant) {
      const r = rng(this.id, variant);
      const ww = this.winds.map((w) => [w[0], 0.5 + r.rand()]);
      const monthLen = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      const rows = [];
      let day = 0;
      monthLen.forEach((len, m) => {
        for (let d = 1; d <= len; d++, day++) {
          const base = -9 - 13 * Math.cos((2 * Math.PI * (day - 15)) / 365) + 13;
          const t = round1(r.normal(base, 4));
          const rain = r.rand() < 0.45 ? 0 : round1(r.rand() ** 2 * 25);
          rows.push([`${String(d).padStart(2, '0')}.${String(m + 1).padStart(2, '0')}`, rain, t, r.weighted(ww), r.int(0, 12)]);
        }
      });
      const p = rng(this.id, variant, ':q');
      const season = p.pick(this.seasons);
      const warm = { 3: 5, 6: 18, 9: 8 }[season.months[0]];
      const params = {
        season,
        temp: warm + p.int(0, 3),
        wind: p.pick(this.winds),
        chart: p.shuffle(this.winds).slice(0, 3),
      };
      plant(rows, (row) => season.months.includes(Number(row[0].slice(3))), (row) => (row[2] = params.temp), p);
      return { rows, params };
    },
    rowsOfSeason(rows, season) {
      return rows.filter((r) => season.months.includes(Number(r[0].slice(3))));
    },
    questions: (p) => [
      `Сколько дней в ${p.season.name} среднесуточная температура была выше ${p.temp} °C?`,
      `Какова средняя скорость ветра в дни, когда дул ${p.wind[1]} ветер (${p.wind[0]})?`,
      `Постройте круговую диаграмму, отображающую соотношение числа дней с ${listRu(p.chart.map((w) => w[2]))} ветром.`,
    ],
    evaluate(rows, p) {
      const season = this.rowsOfSeason(rows, p.season);
      const W = 3, V = 4, T = 2;
      const byWind = (w) => countIf(rows, (r) => r[W] === w);
      const monthsWider = p.season.months.map((m) => m).concat(p.season.months[2] + 1);
      const wider = rows.filter((r) => monthsWider.includes(Number(r[0].slice(3))));
      return {
        a1: { value: countIf(season, (r) => r[T] > p.temp), digits: 0 },
        a2: { value: avgIf(rows, (r) => r[W] === p.wind[0], (r) => r[V]), digits: 2 },
        chart: {
          labels: p.chart.map((w) => w[0]),
          values: p.chart.map((w) => byWind(w[0])),
          match: p.chart.map((w) => (text) => tokenMatch(w[0])(text) || tokenMatch(w[1])(text)),
          what: `число дней с ${listRu(p.chart.map((w) => w[2]))} ветром`,
        },
        mistakes1: [
          { value: countIf(rows, (r) => r[T] > p.temp), why: `Посчитаны дни за весь год. Нужны только ${p.season.name}: выделите строки этих месяцев.` },
          { value: countIf(season, (r) => r[T] >= p.temp), why: `Посчитаны дни с температурой «${p.temp} и выше». В условии «выше ${p.temp}» — нужен знак «>».` },
          { value: countIf(wider, (r) => r[T] > p.temp), why: 'В диапазон попал лишний месяц. Проверьте, на какой строке начинается и заканчивается каждый месяц.' },
          { value: countIf(season, (r) => r[T] < p.temp), why: 'Знак сравнения перевёрнут: посчитаны дни с температурой ниже заданной.' },
        ],
        mistakes2: [
          { value: avgIf(rows, () => true, (r) => r[V]), why: 'Это средняя скорость ветра за весь год, а нужна только для дней с указанным направлением ветра.' },
          { value: avgIf(rows, (r) => r[W].includes(p.wind[0]), (r) => r[V]), why: `В подсчёт попали и другие направления, в названии которых есть «${p.wind[0]}». Нужно точное совпадение направления.` },
          { value: sumIf(rows, (r) => r[W] === p.wind[0], (r) => r[V]), why: 'Это сумма, а не среднее значение.' },
          { value: byWind(p.wind[0]), why: 'Это количество дней с таким ветром, а спрашивается средняя скорость.' },
        ],
        mistakesChart: [],
      };
    },
    hint: (p) => `
      <p><b>1.</b> Условие только для части года. Найдите, на каких строках записаны ${p.season.name} (даты в столбце A), и считайте по этому диапазону: <code>СЧЁТЕСЛИ(C…:C…;"&gt;${p.temp}")</code>.</p>
      <p><b>2.</b> Средняя скорость при условии на направление — <code>СРЗНАЧЕСЛИ</code> по столбцу D с усреднением столбца E. Коды «С» и «СВ» — разные направления.</p>
      <p><b>3.</b> Посчитайте число дней с каждым из трёх направлений в отдельных ячейках, затем постройте по ним диаграмму.</p>`,
    solution(p) {
      const first = 2 + { 3: 59, 6: 151, 9: 243 }[p.season.months[0]];
      const last = first + p.season.months.reduce((s, m) => s + [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1], 0) - 1;
      return [
        ['H2', `=СЧЁТЕСЛИ(C${first}:C${last};">${p.temp}")`],
        ['H3', `=СРЗНАЧЕСЛИ(D2:D366;"${p.wind[0]}";E2:E366)`],
        ...p.chart.flatMap((w, i) => [[`G${6 + i}`, w[0]], [`H${6 + i}`, `=СЧЁТЕСЛИ(D2:D366;G${6 + i})`]]),
      ];
    },
    solutionNote: (p) => `Строки ${p.season.name} находятся по датам в столбце A. Диаграмму стройте по диапазону G6:H8.`,
  }),

  // 5. Интернет-магазин: «не менее» и доля в процентах
  task({
    id: 'shop',
    level: 2,
    title: 'Заказы интернет-магазина',
    source: 'Тренировочное задание',
    intro: 'В электронную таблицу занесли данные о заказах интернет-магазина за месяц.',
    columns: [
      { title: 'номер заказа', width: 2.8, type: 'float', note: 'номер заказа' },
      { title: 'город', width: 3, type: 'string', note: 'город покупателя' },
      { title: 'категория', width: 3, type: 'string', note: 'категория товара' },
      { title: 'сумма', width: 2, type: 'float', note: 'сумма заказа (в рублях)' },
    ],
    count: 1000,
    unit: 'заказам',
    cities: ['Москва', 'Казань', 'Самара', 'Пермь', 'Омск', 'Тула', 'Уфа', 'Томск'],
    categories: ['электроника', 'одежда', 'книги', 'игрушки', 'продукты', 'спорт'],
    generate(variant) {
      const r = rng(this.id, variant);
      const cw = this.cities.map((c) => [c, 0.5 + r.rand()]);
      const kw = this.categories.map((c) => [c, 0.5 + r.rand()]);
      const rows = [];
      let num = r.int(10, 90) * 1000;
      for (let i = 0; i < this.count; i++) {
        num += r.int(1, 7);
        rows.push([num, r.weighted(cw), r.weighted(kw), r.int(3, 600) * 50]);
      }
      const p = rng(this.id, variant, ':q');
      const params = {
        city: p.pick(this.cities),
        min: p.pick([5000, 8000, 10000, 12000, 15000, 20000]),
        cat: p.pick(this.categories),
        chart: p.shuffle(this.categories).slice(0, 3),
      };
      plant(rows, (row) => row[1] === params.city, (row) => (row[3] = params.min), p);
      return { rows, params };
    },
    questions: (p) => [
      `Сколько заказов из города ${p.city} было сделано на сумму не менее ${fmtNum(p.min).replace(/\B(?=(\d{3})+$)/g, ' ')} рублей?`,
      `Какой процент от общего числа заказов составляют заказы категории «${p.cat}»?`,
      `Постройте круговую диаграмму, отображающую соотношение числа заказов в категориях «${p.chart.join('», «').replace(/, «([^«]*)$/, ' и «$1')}».`,
    ],
    q2suffix: 'Ответ на этот вопрос (в процентах) запишите в ячейку H3 таблицы с точностью не менее двух знаков после запятой.',
    evaluate(rows, p) {
      const C = 1, K = 2, S = 3;
      const byCat = (c) => countIf(rows, (r) => r[K] === c);
      const pct = (byCat(p.cat) * 100) / rows.length;
      return {
        a1: { value: countIf(rows, (r) => r[C] === p.city && r[S] >= p.min), digits: 0 },
        a2: { value: pct, digits: 2, percent: true },
        chart: {
          labels: p.chart,
          values: p.chart.map(byCat),
          match: p.chart.map((c) => tokenMatch(c)),
          what: `число заказов в категориях ${listRu(p.chart)}`,
        },
        mistakes1: [
          { value: countIf(rows, (r) => r[C] === p.city && r[S] > p.min), why: `Посчитаны заказы на сумму больше ${p.min}. «Не менее» значит «больше или равно» — нужен знак «>=».` },
          { value: countIf(rows, (r) => r[C] === p.city), why: `Это все заказы из города ${p.city}. Не учтено условие на сумму.` },
          { value: countIf(rows, (r) => r[S] >= p.min), why: 'Это заказы на такую сумму из всех городов. Не учтено условие на город.' },
          { value: countIf(rows, (r) => r[C] === p.city && r[S] < p.min), why: 'Знак сравнения перевёрнут: посчитаны заказы на меньшую сумму.' },
        ],
        mistakes2: [
          { value: byCat(p.cat), why: 'Это количество заказов категории, а нужен процент от общего числа заказов: количество разделить на общее число и умножить на 100.' },
          { value: (sumIf(rows, (r) => r[K] === p.cat, (r) => r[S]) * 100) / sumIf(rows, () => true, (r) => r[S]), why: 'Посчитана доля суммы денег, а нужна доля по числу заказов.' },
          { value: (byCat(p.cat) * 100) / 1001, why: 'Общее число заказов посчитано вместе со строкой заголовка. Заказов ровно столько, сколько строк с данными.' },
        ],
        mistakesChart: [
          { values: p.chart.map((c) => sumIf(rows, (r) => r[K] === c, (r) => r[S])), why: 'Сектора построены по сумме заказов в рублях, а нужно число заказов.' },
        ],
      };
    },
    hint: (p) => `
      <p><b>1.</b> «Не менее» — это «больше или равно»: условие <code>"&gt;=${p.min}"</code>. Второе условие — город. Используйте <code>СЧЁТЕСЛИМН</code>.</p>
      <p><b>2.</b> Процент = количество заказов категории ÷ общее число заказов × 100. Общее число заказов — ${rowsWord(p)}.</p>
      <p><b>3.</b> Посчитайте заказы трёх категорий в отдельных ячейках и постройте диаграмму по ним.</p>`,
    solution: (p) => [
      ['H2', `=СЧЁТЕСЛИМН(B2:B1001;"${p.city}";D2:D1001;">=${p.min}")`],
      ['H3', `=СЧЁТЕСЛИ(C2:C1001;"${p.cat}")/СЧЁТ(A2:A1001)*100`],
      ...p.chart.flatMap((c, i) => [[`G${6 + i}`, c], [`H${6 + i}`, `=СЧЁТЕСЛИ(C2:C1001;G${6 + i})`]]),
    ],
    solutionNote: () => 'Если в H3 выбран процентный формат ячейки, умножать на 100 не нужно: 0,1234 отобразится как 12,34 %. Диаграмму стройте по диапазону G6:H8.',
  }),

  // 6. Медосмотр: среднее по двум условиям
  task({
    id: 'medical',
    level: 2,
    title: 'Школьный медосмотр',
    source: 'Тренировочное задание',
    intro: 'В электронную таблицу занесли результаты медосмотра учеников нескольких школ.',
    columns: [
      { title: 'ученик', width: 2.6, type: 'string', note: 'номер ученика' },
      { title: 'пол', width: 1.4, type: 'string', note: 'пол (м — мальчик, ж — девочка)' },
      { title: 'возраст', width: 1.8, type: 'float', note: 'возраст (полных лет)' },
      { title: 'рост', width: 1.6, type: 'float', note: 'рост (в сантиметрах)' },
      { title: 'вес', width: 1.6, type: 'float', note: 'вес (в килограммах)' },
    ],
    count: 1000,
    unit: 'ученикам',
    generate(variant) {
      const r = rng(this.id, variant);
      const rows = [];
      for (let i = 1; i <= this.count; i++) {
        const sex = r.rand() < 0.5 ? 'м' : 'ж';
        const age = r.weighted([[11, 16], [12, 17], [13, 18], [14, 17], [15, 16], [16, 16]]);
        const h = Math.round(r.normal(sex === 'м' ? 97 + age * 5.1 : 110 + age * 3.6, 7));
        const w = Math.round(clamp(r.normal((h - 100) * 0.9 - 4, 6), 25, 110));
        rows.push([`ученик ${i}`, sex, age, h, w]);
      }
      const p = rng(this.id, variant, ':q');
      const start = p.int(11, 14);
      const params = {
        sex1: p.pick(['м', 'ж']),
        height: p.pick([150, 155, 160, 165, 170]),
        sex2: p.pick(['м', 'ж']),
        age: p.int(12, 15),
        chart: [start, start + 1, start + 2],
      };
      plant(rows, (row) => row[1] === params.sex1, (row) => (row[3] = params.height), p);
      return { rows, params };
    },
    questions: (p) => [
      `Сколько ${p.sex1 === 'м' ? 'мальчиков' : 'девочек'} имеют рост не менее ${p.height} см?`,
      `Каков средний вес ${p.sex2 === 'м' ? 'мальчиков' : 'девочек'} в возрасте ${p.age} лет?`,
      `Постройте круговую диаграмму, отображающую соотношение числа учеников в возрасте ${listRu(p.chart.map(String))} лет.`,
    ],
    evaluate(rows, p) {
      const S = 1, A = 2, H = 3, W = 4;
      const byAge = (a) => countIf(rows, (r) => r[A] === a);
      const q2 = (r) => r[S] === p.sex2 && r[A] === p.age;
      return {
        a1: { value: countIf(rows, (r) => r[S] === p.sex1 && r[H] >= p.height), digits: 0 },
        a2: { value: avgIf(rows, q2, (r) => r[W]), digits: 2 },
        chart: {
          labels: p.chart.map(String),
          values: p.chart.map(byAge),
          match: p.chart.map((a) => tokenMatch(a)),
          what: `число учеников в возрасте ${listRu(p.chart.map(String))} лет`,
        },
        mistakes1: [
          { value: countIf(rows, (r) => r[S] === p.sex1 && r[H] > p.height), why: `Посчитан рост строго больше ${p.height}. «Не менее» — это «>=».` },
          { value: countIf(rows, (r) => r[S] === p.sex1), why: 'Это количество всех учеников этого пола. Не учтено условие на рост.' },
          { value: countIf(rows, (r) => r[H] >= p.height), why: 'Посчитаны и мальчики, и девочки. Не учтено условие на пол.' },
        ],
        mistakes2: [
          { value: avgIf(rows, (r) => r[S] === p.sex2, (r) => r[W]), why: `Это средний вес всех ${p.sex2 === 'м' ? 'мальчиков' : 'девочек'}. Не учтено условие на возраст — нужна функция с двумя условиями, СРЗНАЧЕСЛИМН.` },
          { value: avgIf(rows, (r) => r[A] === p.age, (r) => r[W]), why: `Это средний вес всех учеников ${p.age} лет. Не учтено условие на пол.` },
          { value: avgIf(rows, q2, (r) => r[H]), why: 'Усреднён рост, а нужен вес (столбец E).' },
          { value: sumIf(rows, q2, (r) => r[W]), why: 'Это сумма, а не среднее значение.' },
        ],
        mistakesChart: [],
      };
    },
    hint: (p) => `
      <p><b>1.</b> Условие на пол — текст <code>"${p.sex1}"</code>, на рост — <code>"&gt;=${p.height}"</code>. Функция <code>СЧЁТЕСЛИМН</code>.</p>
      <p><b>2.</b> Среднее сразу по двум условиям считает <code>СРЗНАЧЕСЛИМН(диапазон_усреднения; диапазон1; условие1; диапазон2; условие2)</code>. Обратите внимание: здесь диапазон усреднения идёт <i>первым</i>.</p>
      <p><b>3.</b> Посчитайте учеников каждого возраста в отдельных ячейках и постройте диаграмму по ним.</p>`,
    solution: (p) => [
      ['H2', `=СЧЁТЕСЛИМН(B2:B1001;"${p.sex1}";D2:D1001;">=${p.height}")`],
      ['H3', `=СРЗНАЧЕСЛИМН(E2:E1001;B2:B1001;"${p.sex2}";C2:C1001;${p.age})`],
      ...p.chart.flatMap((a, i) => [[`G${6 + i}`, String(a)], [`H${6 + i}`, `=СЧЁТЕСЛИ(C2:C1001;G${6 + i})`]]),
    ],
    solutionNote: () => 'Если СРЗНАЧЕСЛИМН неудобна, можно добавить вспомогательный столбец F с формулой =ЕСЛИ(И(B2="м";C2=14);E2;"") и найти среднее этого столбца. Диаграмму стройте по диапазону G6:H8.',
  }),
];

function rowsWord(p) {
  return `${p.n} (строки со 2-й по ${p.n + 1}-ю)`;
}

export const taskById = (id) => TASKS.find((t) => t.id === id) ?? null;

// Полный вариант: данные, вопросы, ответы
const cache = new Map();
export function buildVariant(t, variant) {
  const k = t.id + '/' + variant;
  if (cache.has(k)) return cache.get(k);
  const { rows, params } = t.generate(variant);
  params.n = rows.length;
  const ev = t.evaluate(rows, params);
  const answers = [ev.a1, ev.a2];
  // Ошибочные ответы, совпадающие с верным, пояснить нельзя — отбрасываем
  const clean = (list, right) => list.filter((m) => Number.isFinite(m.value) && Math.abs(m.value - right.value) > 1e-9);
  const v = {
    task: t,
    variant,
    tag: `${t.id}/${variant}`,
    rows,
    params,
    questions: t.questions(params),
    answers,
    chart: ev.chart,
    mistakes: [clean(ev.mistakes1, ev.a1), clean(ev.mistakes2, ev.a2), ev.mistakesChart],
    fileName: `task14_${t.id}_${variant}.ods`,
  };
  cache.set(k, v);
  if (cache.size > 20) cache.delete(cache.keys().next().value);
  return v;
}

export function precisionText(a) {
  return a.digits > 0 ? ` с точностью не менее ${a.digits === 2 ? 'двух' : a.digits} знаков после запятой` : '';
}
