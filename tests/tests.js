// Автотесты: формулы, файлы .ods/.xlsx, задания и проверка решений.
// Открыть tests/index.html через локальный сервер.
//
// Файлы в tests/fixtures сохранены настоящим LibreOffice Calc (вариант 1 каждого задания):
// __ok — верное решение, остальные — типичные ошибки. Если поменять генератор данных
// заданий, эти файлы нужно пересоздать.

import { TASKS, taskById, buildVariant } from '../src/tasks.js';
import { makeOds, readWorkbook, getCell, parseRanges } from '../src/workbook.js';
import { checkWorkbook, displayFormula } from '../src/checker.js';
import { parseFormula, makeCriterion, shiftFormula } from '../src/formula.js';
import { PracticeSheet } from '../src/sheet.js';
import { PRACTICE } from '../src/practice.js';

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (err) {
    results.push({ name, ok: false, message: err.message });
  }
}
function assert(cond, message) {
  if (!cond) throw new Error(message || 'условие не выполнено');
}
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// Лист с данными таблицы — для вычисления формул
function sheetOf(header, rows) {
  return new PracticeSheet(header, rows);
}
function calc(sheet, formula) {
  const r = sheet.evaluateAnswer(formula);
  if (r.error) throw new Error(`${formula}: ${r.error} ${r.message}`);
  return r.value;
}

// ---------- Формулы ----------

await test('Условия СЧЁТЕСЛИ', () => {
  const t = (crit, v) => makeCriterion(crit)(v);
  assert(t('>200', 201) && !t('>200', 200), '>200');
  assert(t('>=200', 200) && !t('>=200', 199), '>=200');
  assert(t('<>Ц', 'С') && !t('<>Ц', 'Ц'), '<>');
  assert(t('С', 'с') && !t('С', 'СВ'), 'точное совпадение без учёта регистра');
  assert(t('С*', 'СВ') && t('С*', 'С') && !t('С*', 'ЮС'), 'шаблон *');
  assert(t(8, 8) && !t(8, '9') && t('8', 8), 'число');
  assert(t(true, true) && !t(true, 1), 'ИСТИНА');
  assert(!t('>200', 'текст'), 'текст не больше числа');
});

await test('Вычисление формул', () => {
  const s = sheetOf(['a', 'b', 'c', 'd'], [
    ['x', 1, 8, 100],
    ['y', 2, 9, 300],
    ['x', 2, 8, 250],
    ['С', 1, 8, 210],
  ]);
  assert(calc(s, '=СЧЁТЕСЛИ(C2:C5;8)') === 3, 'СЧЁТЕСЛИ');
  assert(calc(s, '=COUNTIF(C2:C5,8)') === 3, 'COUNTIF с запятой');
  assert(calc(s, '=СЧЁТЕСЛИМН(C2:C5;8;D2:D5;">210")') === 1, 'СЧЁТЕСЛИМН');
  assert(calc(s, '=СУММЕСЛИ(B2:B5;2;D2:D5)') === 550, 'СУММЕСЛИ');
  assert(calc(s, '=СРЗНАЧЕСЛИ(B2:B5;1;D2:D5)') === 155, 'СРЗНАЧЕСЛИ');
  assert(calc(s, '=СРЗНАЧЕСЛИМН(D2:D5;C2:C5;8;B2:B5;2)') === 250, 'СРЗНАЧЕСЛИМН');
  assert(calc(s, '=СУММЕСЛИ(B2:B5;2;D2:D5)/СЧЁТЕСЛИ(B2:B5;2)') === 275, 'сумма / количество');
  assert(calc(s, '=МАКСЕСЛИ(D2:D5;C2:C5;8)') === 250, 'МАКСЕСЛИ');
  assert(calc(s, '=ЕСЛИ(И(C2=8;D2>50);1;0)') === 1, 'ЕСЛИ и И');
  assert(calc(s, '=2+3*4^2/8-1') === 7, 'приоритет операций');
  assert(calc(s, '=СЧЁТЕСЛИ(A2:A5;"С")') === 1, 'кириллица в условии');
  assert(near(calc(s, '=ОКРУГЛ(10/3;2)'), 3.33), 'ОКРУГЛ');
  assert(calc(s, '=СЧЁТ(D2:D5)') === 4 && calc(s, '=СЧЁТЗ(A1:A5)') === 5, 'СЧЁТ и СЧЁТЗ');
  assert(calc(s, '1,5') === 1.5, 'число с запятой');
});

await test('Ошибки в формулах', () => {
  const s = sheetOf(['a', 'b'], [[1, 2]]);
  const err = (f) => s.evaluateAnswer(f).error;
  assert(err('=СЧЁТЕСЛИ(A2:A2;') === 'Err:501', 'обрыв формулы');
  assert(err('=СЧЁТЕСЛИ(A2:A2;С)') === '#ИМЯ?', 'текст без кавычек');
  assert(err('=СЧЕТЕСЛИМ(A2:A2;1)') === '#ИМЯ?', 'опечатка в имени функции');
  assert(err('=СРЗНАЧЕСЛИ(A2:A2;5;B2:B2)') === '#ДЕЛ/0!', 'нет подходящих строк');
  assert(err('=СУММЕСЛИ(A2:A2;1;B2:B3)') === '#ЗНАЧ!', 'диапазоны разного размера');
  assert(err('=A2+"x"') === '#ЗНАЧ!', 'арифметика с текстом');
  assert(err('=(1+2') === 'Err:501', 'скобка');
});

await test('Вспомогательный столбец и протягивание, как в демоверсии', () => {
  const s = sheetOf(['a', 'b', 'c', 'd'], [['x', 1, 8, 211], ['y', 1, 8, 210], ['z', 1, 9, 300]]);
  s.set(1, 4, '=И(C2=8;D2>210)');
  for (let r = 2; r <= 3; r++) s.set(r, 4, shiftFormula('=И(C2=8;D2>210)', r - 1, 0));
  assert(s.raw(3, 4) === '=И(C4=8;D4>210)', 'сдвиг ссылок: ' + s.raw(3, 4));
  assert(calc(s, '=СЧЁТЕСЛИ(E2:E4;ИСТИНА)') === 1, 'подсчёт ИСТИНА');
  assert(shiftFormula('=СЧЁТЕСЛИ($C$2:$C$31;G6)', 2, 0) === '=СЧЁТЕСЛИ($C$2:$C$31;G8)', 'закреплённый диапазон');
  assert(shiftFormula('=СЧЁТЕСЛИ(A2:A5;"A2")', 1, 0) === '=СЧЁТЕСЛИ(A3:A6;"A2")', 'текст в кавычках не сдвигается');
  s.set(5, 5, '=F6+1');
  assert(s.result(5, 5).error === 'Err:522', 'циклическая ссылка');
});

// ---------- Задания: эталонные решения на полной таблице ----------

await test('Эталонные формулы дают эталонные ответы (все задания, 5 вариантов)', () => {
  for (const t of TASKS) {
    for (const variant of [1, 2, 37, 500, 9999]) {
      const v = buildVariant(t, variant);
      const sheet = sheetOf(t.columns.map((c) => c.title), v.rows);
      const sol = t.solution(v.params);
      const where = `${t.id}/${variant}`;
      for (const [ref, f] of sol) {
        const m = /^([A-Z])(\d+)$/.exec(ref);
        sheet.set(Number(m[2]) - 1, m[1].charCodeAt(0) - 65, f);
      }
      const val = (ref) => sheet.result(Number(ref.slice(1)) - 1, ref.charCodeAt(0) - 65);
      const h2 = val('H2');
      const h3 = val('H3');
      assert(!h2.error && near(h2.value, v.answers[0].value), `${where}: H2 ${h2.value ?? h2.message} ≠ ${v.answers[0].value}`);
      assert(!h3.error && near(h3.value, v.answers[1].value, 1e-6), `${where}: H3 ${h3.value ?? h3.message} ≠ ${v.answers[1].value}`);
      const counts = sol.slice(2).filter((_, i) => i % 2 === 1).map(([ref]) => val(ref).value);
      assert(counts.join() === v.chart.values.join(), `${where}: данные диаграммы ${counts} ≠ ${v.chart.values}`);
      assert(v.chart.values.every((x) => x > 0), `${where}: пустая категория на диаграмме`);
    }
  }
});

await test('Варианты различаются, ответы осмысленные', () => {
  for (const t of TASKS) {
    const a = buildVariant(t, 1);
    const b = buildVariant(t, 2);
    assert(a.rows[0].join() !== b.rows[0].join() || a.rows[1].join() !== b.rows[1].join(), `${t.id}: одинаковые данные`);
    for (const variant of [1, 2, 3, 4, 5]) {
      const v = buildVariant(t, variant);
      assert(v.answers[0].value > 0, `${t.id}/${variant}: ответ 1 равен нулю`);
      assert(Number.isFinite(v.answers[1].value) && v.answers[1].value > 0, `${t.id}/${variant}: ответ 2 не число`);
      assert(v.mistakes[0].length >= 1, `${t.id}/${variant}: нечем пояснить ошибки в вопросе 1`);
    }
  }
});

await test('Практикум: эталонные формулы верны на разных данных', () => {
  for (const set of PRACTICE) {
    for (const seed of [1, 2, 3, 50, 777]) {
      let rows = set.generate(seed);
      let s = seed;
      while (!set.questions.every((q) => !q.valid || q.valid(rows))) rows = set.generate(++s);
      const sheet = sheetOf(set.columns, rows);
      for (const q of set.questions) {
        if (q.kind === 'chart') {
          q.labels.forEach((lab, i) => {
            sheet.set(5 + i, 6, lab);
            sheet.set(5 + i, 7, `=СЧЁТЕСЛИ($C$2:$C$31;G${6 + i})`);
          });
          const got = q.labels.map((_, i) => sheet.result(5 + i, 7).value);
          assert(got.join() === q.values(rows).join(), `${set.id}/${q.id}: диаграмма ${got} ≠ ${q.values(rows)}`);
          continue;
        }
        const x = calc(sheet, q.solution);
        assert(near(x, q.answer(rows), 1e-9), `${set.id}/${q.id} (seed ${s}): ${q.solution} = ${x}, ожидалось ${q.answer(rows)}`);
      }
    }
  }
});

// ---------- Файлы ----------

await test('Файл .ods: запись и чтение', async () => {
  const t = taskById('olymp');
  const v = buildVariant(t, 7);
  const bytes = await makeOds({ sheetName: 'Лист1', columns: t.columns, rows: v.rows, variant: v.tag });
  const book = await readWorkbook(bytes, 'x.ods');
  assert(book.variant === 'olymp/7', 'номер варианта в свойствах файла');
  const sh = book.sheets[0];
  assert(getCell(sh, 0, 0).v === 'номер участника', 'заголовок');
  assert(getCell(sh, 1000, 3).v === v.rows[999][3], 'последняя строка');
  assert(sh.rows === 1001, 'число строк ' + sh.rows);
});

await test('Разбор диапазонов', () => {
  const r = parseRanges("Лист1.$H$6:.$H$8 'Мой лист'.G6:'Мой лист'.G8", 'X');
  assert(r.length === 2, 'два диапазона');
  assert(r[0].sheet === 'Лист1' && r[0].r1 === 5 && r[0].r2 === 7 && r[0].c1 === 7, 'первый');
  assert(r[1].sheet === 'Мой лист' && r[1].c1 === 6, 'второй');
  const x = parseRanges('Sheet1!$H$6:$H$8', 'X');
  assert(x[0].sheet === 'Sheet1' && x[0].r2 === 7, 'запись Excel');
});

await test('Формула из файла — в привычной записи', () => {
  assert(displayFormula('of:=COUNTIFS([.C2:.C1001];8;[.D2:.D1001];">=260")') === '=СЧЁТЕСЛИМН(C2:C1001;8;D2:D1001;">=260")', 'ods');
  assert(displayFormula('AVERAGEIF(B2:B1001,41,D2:D1001)') === '=СРЗНАЧЕСЛИ(B2:B1001,41,D2:D1001)', 'xlsx');
  assert(displayFormula("of:=SUM(['Лист 1'.A1:.A3])") === '=СУММ(A1:A3)', 'имя листа');
});

await test('Демо-файл ФИПИ читается', async () => {
  const bytes = new Uint8Array(await (await fetch('fixtures/fipi_demo_2027.ods')).arrayBuffer());
  const book = await readWorkbook(bytes, 'task14.ods');
  const sh = book.sheets[0];
  assert(getCell(sh, 1, 0).v === 'участник 1', 'первая строка данных');
  let n = 0;
  for (let r = 1; r <= 1000; r++) if (getCell(sh, r, 2)?.v === 8 && getCell(sh, r, 3)?.v > 210) n++;
  assert(n === 107, 'ответ демоверсии 107, получилось ' + n);
});

// Файлы, сохранённые LibreOffice: [имя, балл, [верные элементы], фраза в пояснении]
const FIXTURES = [
  ['olymp_1__ok.ods', 3],
  ['olymp_1__ok.xlsx', 3],
  ['districts_1__ok.ods', 3],
  ['districts_1__ok.xlsx', 3],
  ['cargo_1__ok.ods', 3],
  ['weather_1__ok.ods', 3],
  ['shop_1__ok.ods', 3],
  ['medical_1__ok.ods', 3],
  ['olymp_1__nolabels.ods', 2, 'подписей значений'],
  ['olymp_1__nolabels.xlsx', 2, 'подписей значений'],
  ['olymp_1__percent.ods', 2, 'проценты'],
  ['olymp_1__nolegend.ods', 2, 'легенды'],
  ['olymp_1__bar.ods', 2, 'столбчатая'],
  ['olymp_1__donut.ods', 2, 'кольцевая'],
  ['olymp_1__valuesonly.ods', 2, 'нет названий'],
  ['olymp_1__nochart.ods', 2, 'не найдена'],
  ['olymp_1__allclasses.ods', 2, 'все классы'],
  ['olymp_1__mistake.ods', 1, '«>», а не «>=»'],
  ['olymp_1__elsewhere.ods', 3, 'в другой ячейке'],
];

for (const [name, score, phrase] of FIXTURES) {
  await test(`Проверка файла из Calc: ${name} → ${score} б.`, async () => {
    const bytes = new Uint8Array(await (await fetch('fixtures/' + name)).arrayBuffer());
    const book = await readWorkbook(bytes, name);
    const v = buildVariant(taskById(name.split('_')[0]), 1);
    const r = checkWorkbook(book, v);
    const text = r.items.map((i) => [i.text, i.why, ...(i.problems || []), ...i.notes].join(' ')).join(' ');
    assert(r.score === score, `балл ${r.score}: ${text.replace(/<[^>]+>/g, '')}`);
    if (phrase) assert(text.includes(phrase), `нет пояснения «${phrase}»: ${text.replace(/<[^>]+>/g, '')}`);
  });
}

await test('Проверка: чужой вариант и старый формат', async () => {
  const bytes = new Uint8Array(await (await fetch('fixtures/olymp_1__ok.ods')).arrayBuffer());
  const book = await readWorkbook(bytes, 'x.ods');
  const other = buildVariant(taskById('olymp'), 2);
  const r = checkWorkbook(book, other);
  assert(r.warnings.some((w) => w.includes('отличаются от исходных')), 'предупреждение о чужих данных');
  let msg = '';
  try {
    await readWorkbook(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]), 'x.xls');
  } catch (e) {
    msg = e.message;
  }
  assert(msg.includes('.xls'), 'сообщение о формате .xls');
});

// ---------- Вывод ----------

const passed = results.filter((r) => r.ok).length;
const root = document.getElementById('results');
root.innerHTML = `<h2>Пройдено ${passed} из ${results.length}</h2>` + results
  .map((r) => `<div class="${r.ok ? 'ok' : 'fail'}">${r.ok ? '✓' : '✗'} ${r.name}</div>${r.ok ? '' : `<pre>${r.message.replace(/</g, '&lt;')}</pre>`}`)
  .join('');
document.title = `${passed}/${results.length} — тесты`;
