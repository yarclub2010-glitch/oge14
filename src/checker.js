// Проверка присланной таблицы по критериям задания 14 ОГЭ.
// Три оцениваемых элемента: ответ на вопрос 1, ответ на вопрос 2, диаграмма.
// Балл — число верно выполненных элементов (0–3).

import { getCell, cellName, colName } from './workbook.js';
import { fmtNum } from './tasks.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const TARGETS = [{ row: 1, col: 7 }, { row: 2, col: 7 }]; // H2, H3

// ---------- Числа в ячейках ----------

function numberOf(cell) {
  if (!cell) return null;
  if (typeof cell.v === 'number' && Number.isFinite(cell.v)) return cell.v;
  if (typeof cell.v === 'string') {
    const s = cell.v.replace(/\s| /g, '').replace(',', '.').replace('−', '-');
    if (/^-?\d+(\.\d+)?%?$/.test(s)) return s.endsWith('%') ? Number(s.slice(0, -1)) / 100 : Number(s);
  }
  return null;
}

// Число, которое видно в ячейке (в .ods хранится отображаемый текст)
function shownNumber(cell) {
  if (!cell || !cell.text) return null;
  const s = cell.text.replace(/\s| /g, '').replace(',', '.').replace('−', '-');
  const m = /^-?\d+(\.\d+)?/.exec(s);
  if (!m) return null;
  return { value: s.endsWith('%') ? Number(m[0]) / 100 : Number(m[0]), text: cell.text };
}

const isError = (cell) => cell && typeof cell.v === 'string' && /^(#|Err:|Ошибка)/i.test(cell.v.trim());

// Подходит ли число x как ответ a. Для процентов подходит и доля (0,1234 при формате «12,34 %»).
function matches(x, a) {
  if (x === null) return false;
  const tol = a.digits > 0 ? 0.5 * 10 ** -a.digits + 1e-9 : 1e-9;
  if (Math.abs(x - a.value) <= tol) return true;
  return !!a.percent && Math.abs(x * 100 - a.value) <= tol;
}

function sameValue(x, y, a) {
  const tol = a.digits > 0 ? 0.5 * 10 ** -a.digits + 1e-9 : 1e-9;
  return Math.abs(x - y) <= tol || (!!a.percent && Math.abs(x * 100 - y) <= tol);
}

// ---------- Исходные данные ----------

function findDataSheet(book, v) {
  const title = v.task.columns[0].title.toLowerCase();
  return book.sheets.find((s) => String(getCell(s, 0, 0)?.v ?? '').trim().toLowerCase() === title) ?? book.sheets[0];
}

function rowKey(values) {
  return values.map((x) => (typeof x === 'number' ? String(Math.round(x * 1e6) / 1e6) : String(x ?? '').trim())).join('|');
}

// Совпадают ли данные в файле с исходными (порядок строк не важен — таблицу могли отсортировать)
export function dataMatches(sheet, v) {
  const ncols = v.task.columns.length;
  const want = new Map();
  for (const r of v.rows) {
    const k = rowKey(r);
    want.set(k, (want.get(k) || 0) + 1);
  }
  let found = 0;
  let bad = 0;
  for (let row = 1; row <= Math.max(v.rows.length, sheet.rows); row++) {
    const vals = [];
    let empty = true;
    for (let c = 0; c < ncols; c++) {
      const cell = getCell(sheet, row, c);
      if (cell && cell.v !== null && cell.v !== '') empty = false;
      vals.push(cell ? cell.v : '');
    }
    if (empty) continue;
    const k = rowKey(vals);
    if (want.get(k)) {
      want.set(k, want.get(k) - 1);
      found++;
    } else {
      bad++;
    }
  }
  return { found, bad, total: v.rows.length };
}

// Числовые ячейки вне исходных данных и вне длинных вспомогательных столбцов
function answerCandidates(book, dataSheet, v) {
  const ncols = v.task.columns.length;
  const out = [];
  for (const sheet of book.sheets) {
    const perCol = new Map();
    for (const k of sheet.cells.keys()) {
      const col = Number(k.split(',')[1]);
      perCol.set(col, (perCol.get(col) || 0) + 1);
    }
    for (const [k, cell] of sheet.cells) {
      const [row, col] = k.split(',').map(Number);
      if (sheet === dataSheet && col < ncols && row <= v.rows.length) continue;
      if ((perCol.get(col) || 0) > 40) continue; // вспомогательный столбец на всю таблицу
      const x = numberOf(cell);
      if (x !== null) out.push({ sheet, row, col, cell, x });
    }
  }
  return out;
}

function where(sheet, row, col, book) {
  const name = cellName(row, col);
  return book.sheets.length > 1 && sheet !== book.sheets[0] ? `${name} (лист «${esc(sheet.name)}»)` : name;
}

const RU_NAMES = {
  COUNTIFS: 'СЧЁТЕСЛИМН', COUNTIF: 'СЧЁТЕСЛИ', SUMIFS: 'СУММЕСЛИМН', SUMIF: 'СУММЕСЛИ', AVERAGEIFS: 'СРЗНАЧЕСЛИМН',
  AVERAGEIF: 'СРЗНАЧЕСЛИ', AVERAGE: 'СРЗНАЧ', COUNTA: 'СЧЁТЗ', COUNT: 'СЧЁТ', SUM: 'СУММ', ROUND: 'ОКРУГЛ',
  AND: 'И', OR: 'ИЛИ', NOT: 'НЕ', IF: 'ЕСЛИ', MAX: 'МАКС', MIN: 'МИН', MAXIFS: 'МАКСЕСЛИ', MINIFS: 'МИНЕСЛИ',
  TRUE: 'ИСТИНА', FALSE: 'ЛОЖЬ',
};

// Формула из файла — в привычной записи: «[.B2:.B1001]» → «B2:B1001», английские имена → русские
export function displayFormula(f) {
  let s = String(f).replace(/^of:/, '');
  s = s.replace(/\[([^\]]+)\]/g, (m, inner) => inner.replace(/(^|:)(?:\$?'[^']*'|[^:.'"]*)\./g, '$1'));
  s = s.replace(/\b([A-Z]+)(?=\s*\()|\b(TRUE|FALSE)\b/g, (m) => RU_NAMES[m] ?? m);
  return s.startsWith('=') ? s : '=' + s;
}

function formulaNote(cell) {
  return cell?.formula ? ` <span class="muted">(формула <code>${esc(displayFormula(cell.formula))}</code>)</span>` : '';
}

// ---------- Вопросы 1 и 2 ----------

function checkAnswer(i, book, dataSheet, v) {
  const a = v.answers[i];
  const target = TARGETS[i];
  const tName = cellName(target.row, target.col);
  const cell = getCell(dataSheet, target.row, target.col);
  const x = numberOf(cell);
  const item = { title: `Вопрос ${i + 1}`, ok: false, text: '', notes: [] };
  const shown = cell ? esc(cell.text || fmtNum(cell.v)) : '';

  if (matches(x, a)) {
    item.ok = true;
    item.text = `В ячейке ${tName} верный ответ: <b>${shown}</b>.`;
    precisionNote(item, cell, a);
    return item;
  }

  // Ответ записан не туда — по критериям это допускается
  if (x === null && !isError(cell)) {
    const found = answerCandidates(book, dataSheet, v).find((c) => matches(c.x, a));
    if (found) {
      item.ok = true;
      const at = where(found.sheet, found.row, found.col, book);
      item.text = `Верный ответ <b>${esc(found.cell.text || fmtNum(found.x))}</b> найден в ячейке ${at}.`;
      item.notes.push(`По критериям ответ в другой ячейке засчитывается, но лучше записывать его туда, куда просят, — в ${tName}.`);
      precisionNote(item, found.cell, a);
      return item;
    }
  }

  if (!cell || (cell.v === null && !cell.formula) || cell.v === '') {
    item.text = `В ячейке ${tName} нет ответа, и верный ответ не найден в других ячейках.`;
    return item;
  }
  if (isError(cell)) {
    item.text = `В ячейке ${tName} ошибка <b>${esc(cell.v)}</b>${formulaNote(cell)}. ${errorHelp(cell.v)}`;
    return item;
  }
  if (x === null) {
    item.text = `В ячейке ${tName} записано «${esc(cell.text || cell.v)}» — это не число.`;
    return item;
  }

  item.text = `В ячейке ${tName} записано <b>${shown}</b>${formulaNote(cell)} — ответ неверный.`;
  const m = v.mistakes[i].find((mm) => sameValue(x, mm.value, a));
  if (m) {
    item.why = m.why;
  } else if (a.digits > 0 && roundedTooMuch(x, a)) {
    item.why = `Значение округлено слишком сильно. Нужна точность не менее ${a.digits === 2 ? 'двух' : a.digits} знаков после запятой: увеличьте число знаков в формате ячейки или не округляйте результат.`;
  } else {
    item.why = 'Перечитайте условие: какие строки нужно учитывать и какой столбец обрабатывать. Проверьте, что формула охватывает все строки с данными.';
  }
  return item;
}

function roundedTooMuch(x, a) {
  for (const val of a.percent ? [a.value, a.value / 100] : [a.value]) {
    for (let d = 0; d < a.digits + (a.percent && val < 1 ? 2 : 0); d++) {
      if (Math.abs(x - Number(val.toFixed(d))) < 1e-9) return true;
    }
  }
  return false;
}

// В ячейке верное значение, но отображается слишком мало знаков
function precisionNote(item, cell, a) {
  if (!a.digits) return;
  const shown = shownNumber(cell);
  if (shown && !matches(shown.value, a)) {
    item.notes.push(`В ячейке отображается «${esc(shown.text)}». Значение внутри верное, но видно меньше двух знаков после запятой — увеличьте число знаков в формате ячейки, чтобы эксперт увидел точный ответ.`);
  }
}

function errorHelp(text) {
  if (/ДЕЛ\/0|DIV\/0|532/i.test(text)) return 'Деление на ноль: условию не соответствует ни одна строка. Проверьте текст условия в формуле — он должен точно совпадать с данными.';
  if (/ИМЯ|NAME|525/i.test(text)) return 'Неизвестное имя функции. Проверьте, как написано имя функции, и что используются русские названия (СЧЁТЕСЛИ, а не COUNTIF, или наоборот — как принято в вашей программе).';
  if (/508|509|501|502|510/.test(text)) return 'Ошибка в записи формулы: проверьте скобки и разделители аргументов (точка с запятой).';
  return 'Формула не смогла вычислить результат — проверьте её запись.';
}

// ---------- Диаграмма ----------

const sortNum = (a) => [...a].sort((x, y) => x - y);
const sameSet = (a, b) => a.length === b.length && sortNum(a).every((x, i) => Math.abs(x - sortNum(b)[i]) < 1e-9);

function proportional(vals, want) {
  if (vals.length !== want.length || vals.some((x) => !(x > 0))) return false;
  const sv = sortNum(vals);
  const sw = sortNum(want);
  const k = sv[0] / sw[0];
  return sv.every((x, i) => Math.abs(x / sw[i] - k) <= 1e-4 * k + 0.006 * (sv[i] / sw[i] < 2 ? 1 : 0) + 1e-9);
}

function chartValues(ch) {
  return (ch.series[0]?.values ?? []).filter((x) => typeof x === 'number');
}

function pickChart(book, want) {
  if (!book.charts.length) return null;
  const score = (ch) =>
    (sameSet(chartValues(ch), want) ? 4 : proportional(chartValues(ch), want) ? 3 : 0) + (ch.type === 'pie' ? 2 : 0) + (ch.legend ? 0.5 : 0) + (ch.labels.value ? 0.5 : 0);
  return [...book.charts].sort((a, b) => score(b) - score(a))[0];
}

function checkChart(book, v) {
  const exp = v.chart;
  const item = { title: 'Диаграмма', ok: false, text: '', notes: [], problems: [] };
  const ch = pickChart(book, exp.values);
  const wantText = exp.labels.map((l, i) => `${esc(l)} — ${exp.values[i]}`).join(', ');

  if (!ch) {
    item.text = 'Диаграмма не найдена.';
    item.why = book.format === 'ods' || book.format === 'xlsx'
      ? 'Постройте круговую диаграмму (Вставка → Диаграмма → Круговая) и сохраните файл ещё раз. В формате .csv диаграммы не сохраняются.'
      : '';
    return item;
  }

  const where = ch.anchor ? ` (левый верхний угол около ${cellName(ch.anchor.row, ch.anchor.col)})` : '';
  const typeName = { pie: 'круговая', doughnut: 'кольцевая', bar: 'столбчатая', line: 'график', area: 'с областями', scatter: 'точечная' }[ch.type] || 'не круговая';
  item.text = `Найдена диаграмма${where}: ${typeName}${ch.series[0]?.ref ? `, данные из ${esc(ch.series[0].ref)}` : ''}.`;

  const problems = item.problems;
  if (ch.type !== 'pie') {
    problems.push(`Тип диаграммы — ${typeName}, а по условию нужна <b>круговая</b>.`);
  }

  // Данные
  const vals = chartValues(ch);
  let dataOk = false;
  if (ch.series.length > 1 && ch.series.every((s) => s.values.filter((x) => typeof x === 'number').length <= 1)) {
    problems.push('Каждое значение попало в отдельный ряд данных, поэтому круговая диаграмма показывает только один из них. В мастере диаграмм выберите «Ряды данных в столбцах» (или «в строках» — так, чтобы все значения были одним рядом).');
  } else if (!vals.length) {
    problems.push('В диаграмме нет числовых данных. Постройте её по ячейкам, где посчитаны количества.');
  } else if (sameSet(vals, exp.values)) {
    dataOk = true;
  } else if (proportional(vals, exp.values)) {
    dataOk = true;
    item.notes.push('Диаграмма построена по долям или процентам. Сектора правильные, но надёжнее строить по самим количествам — именно их просят показать на диаграмме.');
  } else {
    const m = v.mistakes[2].find((mm) => sameSet(vals, mm.values));
    if (m) problems.push(m.why);
    else if (vals.length > 30) problems.push('Диаграмма построена прямо по столбцу исходной таблицы. Сначала посчитайте количество по каждой категории в отдельных ячейках, а диаграмму стройте по ним.');
    else if (vals.length > exp.values.length && exp.values.every((x) => vals.includes(x))) problems.push(`На диаграмме лишние сектора: ${vals.length} вместо ${exp.values.length}. Оставьте только данные, названные в условии.`);
    else if (vals.length < exp.values.length) problems.push(`На диаграмме ${vals.length} ${vals.length === 1 ? 'сектор' : 'сектора'}, а должно быть ${exp.values.length} — по одному на каждую категорию из условия.`);
    else problems.push(`Данные диаграммы (${vals.map((x) => fmtNum(x)).join(', ')}) не совпадают с верными. Проверьте, как посчитано ${esc(exp.what)}.`);
  }

  // Какая подпись какому сектору соответствует
  const cats = ch.categories.map((c) => String(c ?? '').trim());
  const recognized = cats.map((c) => exp.match.findIndex((f) => f(c)));
  if (dataOk && !ch.legend) {
    // сообщим ниже в проверке легенды
  } else if (dataOk && (!cats.length || cats.every((c) => !c))) {
    problems.push('У секторов нет названий: в легенде будут номера 1, 2, 3, и непонятно, какой сектор чему соответствует. Выделяйте для диаграммы два столбца — подписи и значения.');
  } else if (dataOk && recognized.every((k) => k >= 0) && vals.length === cats.length) {
    const swapped = recognized.some((k, i) => Math.abs(exp.values[k] - ch.series[0].values[i]) > 1e-9);
    if (swapped && sameSet(vals, exp.values)) problems.push('Подписи секторов перепутаны: значения стоят не напротив своих категорий.');
  } else if (dataOk && recognized.every((k) => k < 0)) {
    item.notes.push(`Не удалось сопоставить подписи секторов (${cats.map((c) => '«' + esc(c) + '»').join(', ')}) с категориями из условия. Убедитесь, что по легенде понятно, какой сектор чему соответствует.`);
  }

  // Легенда и подписи значений
  if (!ch.legend) problems.push('Нет <b>легенды</b>. По условию она обязательна: включите её в свойствах диаграммы (Вставка → Легенда).');
  if (!ch.labels.value) {
    if (ch.labels.percent) problems.push('На секторах подписаны проценты, а по условию нужны <b>числовые значения данных</b>. В подписях данных включите «Показывать значение как число».');
    else problems.push('На диаграмме нет <b>подписей значений</b>. Включите подписи данных: правый щелчок по диаграмме → Вставить подписи данных (значение как число).');
  }

  if (ch.anchor && (Math.abs(ch.anchor.row - 5) > 4 || Math.abs(ch.anchor.col - 6) > 3)) {
    item.notes.push(`По условию левый верхний угол диаграммы нужно разместить вблизи ячейки G6, а он около ${cellName(ch.anchor.row, ch.anchor.col)}. На балл это не влияет, но на экзамене лучше выполнять условие точно.`);
  }
  if (book.charts.length > 1) item.notes.push(`В файле ${book.charts.length} диаграммы — проверена самая подходящая. На экзамене оставьте одну, чтобы эксперту было ясно, что оценивать.`);

  item.ok = problems.length === 0;
  if (item.ok) item.text += ` Сектора соответствуют данным (${wantText}), есть легенда и подписи значений.`;
  return item;
}

// ---------- Итог ----------

export function checkWorkbook(book, v) {
  const dataSheet = findDataSheet(book, v);
  const items = [checkAnswer(0, book, dataSheet, v), checkAnswer(1, book, dataSheet, v), checkChart(book, v)];
  const warnings = [];

  const dm = dataMatches(dataSheet, v);
  if (dm.found < dm.total * 0.98 || dm.bad > 0) {
    warnings.push(`Данные в таблице отличаются от исходных: совпало ${dm.found} строк из ${dm.total}${dm.bad ? `, ещё ${dm.bad} строк изменены или добавлены` : ''}. Не меняйте исходные данные — ответы должны быть посчитаны по ним. Если вы добавляли вспомогательные вычисления, ставьте их в свободные столбцы справа.`);
  }
  if (book.format === 'xlsx') {
    warnings.push('Файл в формате .xlsx. На экзамене задание выдают и принимают в формате .ods — сохраняйте в нём (Файл → Сохранить как → Электронная таблица ODF).');
  }

  return { score: items.filter((it) => it.ok).length, items, warnings };
}

export { colName };
