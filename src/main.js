// Тренажёр задания 14 ОГЭ: задание с файлом (скачать → решить → загрузить на проверку)
// и практикум с формулами прямо в браузере.

import { TASKS, LEVELS, taskById, buildVariant, fmtNum, precisionText } from './tasks.js';
import { inPlatform, reportScore } from './platform.js';
import { makeOds, readWorkbook, WorkbookError, colName, cellName, parseRanges, getCell } from './workbook.js';
import { checkWorkbook, dataMatches } from './checker.js';
import { PRACTICE, practiceById, describeAnswer } from './practice.js';
import { PracticeSheet } from './sheet.js';
import { parseFormula, refsOf, shiftFormula } from './formula.js';
import { pieSVG } from './pie.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// ---------- Хранилище (может быть недоступно, например в приватном режиме) ----------

const store = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem('oge14:' + key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('oge14:' + key, JSON.stringify(value));
    } catch {
      // нет доступа к хранилищу — просто не сохраняем
    }
  },
};

const state = {
  mode: 'file',
  task: TASKS[0],
  variant: 1,
  scores: store.get('scores', {}),
  lastResult: null,
};

// ---------- Режимы ----------

function setMode(mode, pushHash = true) {
  state.mode = mode;
  $('#view-file').hidden = mode !== 'file';
  $('#view-practice').hidden = mode !== 'practice';
  $('#mode-file').setAttribute('aria-selected', String(mode === 'file'));
  $('#mode-practice').setAttribute('aria-selected', String(mode === 'practice'));
  store.set('mode', mode);
  if (mode === 'practice') {
    if (!practice.sheet) openPracticeSet(store.get('practice', PRACTICE[0].id), false);
    if (pushHash) setHash('practice/' + practice.set.id);
  } else if (pushHash) {
    setHash(`${state.task.id}/${state.variant}`);
  }
}

function setHash(h) {
  if (location.hash !== '#' + h) history.replaceState(null, '', '#' + h);
}

$('#mode-file').addEventListener('click', () => setMode('file'));
$('#mode-practice').addEventListener('click', () => setMode('practice'));

// =====================================================================
// Задание с файлом
// =====================================================================

function scoreBadge(id) {
  const s = state.scores[id];
  return s === undefined ? '' : s === 3 ? ' ✓' : ` (${s} из 3)`;
}

function fillTaskSelect() {
  const sel = $('#task-select');
  sel.innerHTML = '';
  for (const [level, name] of Object.entries(LEVELS)) {
    const group = document.createElement('optgroup');
    group.label = name;
    TASKS.filter((t) => t.level === Number(level)).forEach((t) => {
      group.append(new Option(`${TASKS.indexOf(t) + 1}. ${t.title}${scoreBadge(t.id)}`, t.id));
    });
    sel.append(group);
  }
  sel.value = state.task.id;
}

function openTask(t, variant, pushHash = true) {
  state.task = t;
  state.variant = variant;
  state.lastResult = null;
  store.set('task', t.id);
  store.set('variant:' + t.id, variant);
  $('#task-select').value = t.id;
  renderTask();
  $('#check-result').hidden = true;
  $('#check-result').innerHTML = '';
  togglePanel('#hint', '#btn-hint', false);
  togglePanel('#solution', '#btn-solution', false);
  if (pushHash && state.mode === 'file') setHash(`${t.id}/${variant}`);
}

function currentVariant() {
  return buildVariant(state.task, state.variant);
}

function renderTask() {
  const t = state.task;
  const v = currentVariant();
  $('#task-title').textContent = t.title;
  $('#task-source').textContent = t.source || '';
  const lvl = $('#task-level');
  lvl.textContent = LEVELS[t.level];
  lvl.className = `chip lvl-${t.level}`;
  $('#task-variant').textContent = `Вариант ${state.variant}`;
  updateStatusChip();
  $('#download-name').textContent = v.fileName;

  const cols = t.columns;
  const head = cols.map((_, i) => `<th>${colName(i)}</th>`).join('');
  const titles = cols.map((c) => `<td>${esc(c.title)}</td>`).join('');
  const body = v.rows.slice(0, 4).map((r, i) => `<tr><th>${i + 2}</th>${r.map((x) => `<td>${esc(typeof x === 'number' ? fmtNum(x) : x)}</td>`).join('')}</tr>`).join('');
  const desc = cols.map((c, i) => `в столбце ${colName(i)} — ${esc(c.note)}`).join('; ');
  const [q1, q2, q3] = v.questions;
  const a = v.answers;

  $('#task-text').innerHTML = `
    <p>${esc(t.intro)} Ниже приведены первые пять строк таблицы.</p>
    <div class="preview-wrap"><table class="preview"><thead><tr><th></th>${head}</tr></thead>
      <tbody><tr><th>1</th>${titles}</tr>${body}</tbody></table></div>
    <p>${desc[0].toUpperCase() + desc.slice(1)}. Всего в электронную таблицу были внесены данные по ${v.rows.length} ${esc(t.unit)}.</p>
    <p class="task-do"><b>Выполните задание.</b></p>
    <p>Откройте файл с данной электронной таблицей. На основании данных, содержащихся в этой таблице, выполните задания.</p>
    <ol class="questions">
      <li>${esc(q1)} Ответ на этот вопрос запишите в ячейку <b>H2</b> таблицы${precisionText(a[0])}.</li>
      <li>${esc(q2)} ${t.q2suffix ? esc(t.q2suffix).replace('H3', '<b>H3</b>') : `Ответ на этот вопрос запишите в ячейку <b>H3</b> таблицы${precisionText(a[1])}.`}</li>
      <li>${esc(q3)} Левый верхний угол диаграммы разместите вблизи ячейки <b>G6</b>. В поле диаграммы должны присутствовать легенда (обозначение, какой сектор диаграммы соответствует каким данным) и числовые значения данных, по которым построена диаграмма.</li>
    </ol>
    <p>Полученную таблицу сохраните и загрузите на проверку.</p>`;
}

function updateStatusChip() {
  const s = state.scores[state.task.id];
  const chip = $('#task-status');
  chip.hidden = s === undefined;
  if (s !== undefined) {
    chip.textContent = `Лучший результат: ${s} из 3`;
    chip.className = `chip chip-score s${s}`;
  }
}

$('#task-select').addEventListener('change', (e) => {
  const t = taskById(e.target.value);
  openTask(t, store.get('variant:' + t.id, 1));
});
function stepTask(d) {
  const i = (TASKS.indexOf(state.task) + d + TASKS.length) % TASKS.length;
  const t = TASKS[i];
  openTask(t, store.get('variant:' + t.id, 1));
}
$('#btn-prev').addEventListener('click', () => stepTask(-1));
$('#btn-next').addEventListener('click', () => stepTask(1));

$('#btn-new-variant').addEventListener('click', () => {
  let n;
  do n = 2 + Math.floor(Math.random() * 9998);
  while (n === state.variant);
  openTask(state.task, n);
});

$('#btn-download').addEventListener('click', async () => {
  const v = currentVariant();
  const t = v.task;
  const bytes = await makeOds({
    sheetName: t.sheetName,
    columns: t.columns,
    rows: v.rows,
    variant: v.tag,
    title: `Задание 14 ОГЭ: ${t.title}, вариант ${v.variant}`,
  });
  const blob = new Blob([bytes], { type: 'application/vnd.oasis.opendocument.spreadsheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = v.fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
});

$('#btn-copy-link').addEventListener('click', async (e) => {
  const url = location.href.split('#')[0] + `#${state.task.id}/${state.variant}`;
  const btn = e.currentTarget;
  try {
    await navigator.clipboard.writeText(url);
    flash(btn, 'Ссылка скопирована');
  } catch {
    prompt('Скопируйте ссылку на вариант:', url);
  }
});

function flash(btn, text) {
  const old = btn.textContent;
  btn.textContent = text;
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = old;
    btn.disabled = false;
  }, 1600);
}

// ---------- Подсказка и решение ----------

function togglePanel(panelSel, btnSel, show) {
  const panel = $(panelSel);
  const btn = $(btnSel);
  const open = show ?? panel.hidden;
  panel.hidden = !open;
  btn.setAttribute('aria-expanded', String(open));
  return open;
}

$('#btn-hint').addEventListener('click', () => {
  if (togglePanel('#hint', '#btn-hint')) $('#hint').innerHTML = state.task.hint(currentVariant().params);
});
$('#btn-solution').addEventListener('click', () => {
  if (!togglePanel('#solution', '#btn-solution')) return;
  const v = currentVariant();
  const t = v.task;
  const rows = t.solution(v.params).map(([cell, f]) => `<tr><th>${cell}</th><td><code>${esc(f)}</code></td></tr>`).join('');
  $('#solution').innerHTML = `
    <p class="small">Одно из возможных решений (русские имена функций, как в Calc):</p>
    <table class="sol-table">${rows}</table>
    <p class="small muted">${esc(t.solutionNote(v.params))}</p>
    <button class="btn small" id="btn-show-answers">Показать верные ответы</button>
    <div id="answers" hidden></div>`;
  $('#btn-show-answers').addEventListener('click', () => {
    const box = $('#answers');
    box.hidden = false;
    box.innerHTML = answersHTML(v);
  });
});

function answersHTML(v) {
  const a = v.answers;
  const show = (x) => fmtNum(x.value, x.digits > 0 && !Number.isInteger(x.value) ? x.digits : null);
  return `<ul class="small answers">
    <li>Вопрос 1 (H2): <b>${show(a[0])}</b></li>
    <li>Вопрос 2 (H3): <b>${show(a[1])}</b>${a[1].percent ? ' (%)' : ''}</li>
    <li>Диаграмма: ${v.chart.labels.map((l, i) => `${esc(l)} — <b>${v.chart.values[i]}</b>`).join(', ')}. Сектора в соотношении ${v.chart.values.join(' : ')}, порядок секторов любой.</li>
  </ul>`;
}

// ---------- Загрузка и проверка решения ----------

const fileInput = $('#file-input');
const drop = $('#drop');

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) checkFile(fileInput.files[0]);
  fileInput.value = '';
});
['dragenter', 'dragover'].forEach((ev) =>
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.add('is-over');
  }),
);
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('is-over')));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  if (f) checkFile(f);
});
// Файл, брошенный мимо поля, не должен открываться в браузере вместо страницы
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  if (state.mode === 'file' && e.dataTransfer.files[0]) checkFile(e.dataTransfer.files[0]);
});

function showCheck(html) {
  const box = $('#check-result');
  box.hidden = false;
  box.innerHTML = html;
  box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

async function checkFile(file) {
  showCheck('<p class="muted">Проверяю файл…</p>');
  let book;
  try {
    if (file.size > 20 * 1024 * 1024) throw new WorkbookError('Файл больше 20 МБ — это не таблица задания 14. Выберите свой файл.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    book = await readWorkbook(bytes, file.name);
  } catch (e) {
    console.error(e);
    const msg = e instanceof WorkbookError ? e.message : `Не удалось прочитать файл «${file.name}». Сохраните таблицу в формате .ods и попробуйте ещё раз.`;
    showCheck(`<div class="alert">${esc(msg)}</div>`);
    return;
  }

  // Какой это вариант: из свойств файла, из имени файла или текущий на странице
  const fromTag = (tag) => {
    const m = /^([a-z]+)\/(\d+)$/.exec(tag || '');
    return m && taskById(m[1]) ? { task: taskById(m[1]), variant: Number(m[2]) } : null;
  };
  const nameMatch = /task14_([a-z]+)_(\d+)/.exec(file.name);
  const current = { task: state.task, variant: state.variant };
  const id = inPlatform ? current
    : fromTag(book.variant) || (nameMatch && fromTag(`${nameMatch[1]}/${nameMatch[2]}`)) || current;
  let switched = false;
  if (id.task !== state.task || id.variant !== state.variant) {
    openTask(id.task, id.variant);
    switched = true;
  }
  const v = currentVariant();

  const dataSheet = book.sheets.find((s) => getCell(s, 0, 0)) ?? book.sheets[0];
  const dm = dataSheet ? dataMatches(dataSheet, v) : { found: 0, total: v.rows.length };
  if (dm.found < dm.total * 0.5) {
    showCheck(`<div class="alert">Данные в файле «${esc(file.name)}» не совпадают с таблицей варианта ${state.variant} задания «${esc(state.task.title)}». Загрузите файл, скачанный для этого варианта, или откройте на странице задание, которое вы решали.</div>`);
    return;
  }

  const result = checkWorkbook(book, v);
  state.lastResult = result;
  reportScore(14, `${state.task.id}/${state.variant}`, result.score, 3);
  const best = state.scores[state.task.id];
  if (best === undefined || result.score > best) {
    state.scores[state.task.id] = result.score;
    store.set('scores', state.scores);
    fillTaskSelect();
    updateStatusChip();
  }
  showCheck(resultHTML(result, book, v, file.name, switched));
  const more = $('#btn-result-answers');
  if (more) more.addEventListener('click', () => {
    more.outerHTML = answersHTML(v);
  });
}

const SCORE_WORDS = ['0 баллов', '1 балл', '2 балла', '3 балла'];

function resultHTML(res, book, v, fileName, switched) {
  const s = res.score;
  const verdict = s === 3
    ? 'Все три элемента выполнены верно — максимальный балл.'
    : s === 0
      ? 'Ни один элемент не засчитан. Разберите замечания ниже.'
      : `Засчитано элементов: ${s} из 3. Разберите замечания ниже.`;
  const items = res.items.map((it) => `
    <li class="${it.ok ? 'ok' : 'bad'}">
      <span class="r-icon" aria-hidden="true">${it.ok ? '✓' : '✗'}</span>
      <div>
        <b>${it.title}</b> — ${it.ok ? '1 балл' : '0 баллов'}
        <p>${it.text}</p>
        ${it.why ? `<p class="why">${it.why}</p>` : ''}
        ${(it.problems || []).length ? `<ul class="problems">${it.problems.map((p) => `<li>${p}</li>`).join('')}</ul>` : ''}
        ${it.notes.map((n) => `<p class="r-note">${n}</p>`).join('')}
      </div>
    </li>`).join('');

  const chart = book.charts.length ? chartPreview(book, v) : '';
  return `
    ${switched ? `<p class="muted small">Файл относится к заданию «${esc(v.task.title)}», вариант ${v.variant} — открыл его.</p>` : ''}
    <div class="score s${s}">
      <div class="score-num">${s}<small> из 3</small></div>
      <div><p><b>${SCORE_WORDS[s]}</b> — ${esc(fileName)}</p><p class="score-note">${verdict}</p></div>
    </div>
    <ul class="results">${items}</ul>
    ${res.warnings.map((w) => `<div class="note small">${w}</div>`).join('')}
    ${chart}
    ${s < 3 && !inPlatform ? '<button class="btn small" id="btn-result-answers">Показать верные ответы</button>' : ''}`;
}

// Как тренажёр «видит» диаграмму ученика
function chartPreview(book, v) {
  const ch = book.charts.find((c) => c.type === 'pie') || book.charts[0];
  const vals = (ch.series[0]?.values ?? []);
  const items = vals.map((x, i) => ({ label: ch.categories[i] ?? '', value: typeof x === 'number' ? x : 0 })).slice(0, 12);
  const labels = ch.labels.value ? 'value' : ch.labels.percent ? 'percent' : 'none';
  return `<details class="chart-preview"><summary>Как тренажёр прочитал вашу диаграмму</summary>
    <div class="pie-box">${pieSVG(items, { legend: ch.legend, labels })}</div>
    <p class="small muted">Схема, а не точная копия: показаны данные первого ряда, наличие легенды и подписей значений.</p></details>`;
}

// =====================================================================
// Практикум
// =====================================================================

const practice = {
  set: null,
  seed: 1,
  rows: [],
  sheet: null,
  q: 0,
  sel: { r: 1, c: 4 },
  status: {}, // id вопроса → 'ok' | 'bad'
};

const GRID_COLS = 10; // A…J

function fillPracticeSelect() {
  const sel = $('#practice-select');
  sel.innerHTML = '';
  PRACTICE.forEach((p) => sel.append(new Option(`Таблица «${p.title}»`, p.id)));
}

function generatePractice(set, seed) {
  // Подбираем данные, при которых у всех вопросов есть ответ
  for (let s = seed; ; s++) {
    const rows = set.generate(s);
    if (set.questions.every((q) => !q.valid || q.valid(rows))) return { rows, seed: s };
  }
}

function openPracticeSet(id, pushHash = true) {
  const set = practiceById(id) || PRACTICE[0];
  practice.set = set;
  store.set('practice', set.id);
  $('#practice-select').value = set.id;
  $('#practice-intro').textContent = set.intro + ` Данные — в строках 2–${set.rowsCount + 1}.`;
  loadPracticeData(store.get(`pseed:${set.id}`, 1));
  practice.q = Math.min(store.get(`pq:${set.id}`, 0), set.questions.length - 1);
  renderQuestion();
  if (pushHash && state.mode === 'practice') setHash('practice/' + set.id);
}

function loadPracticeData(seed) {
  const set = practice.set;
  const g = generatePractice(set, seed);
  practice.seed = g.seed;
  practice.rows = g.rows;
  store.set(`pseed:${set.id}`, g.seed);
  practice.sheet = new PracticeSheet(set.columns, g.rows);
  const saved = store.get(`pcells:${set.id}:${g.seed}`, {});
  for (const [k, raw] of Object.entries(saved)) {
    const [r, c] = k.split(',').map(Number);
    practice.sheet.set(r, c, raw);
  }
  practice.status = store.get(`pstatus:${set.id}:${g.seed}`, {});
  renderGrid();
  selectCell(1, set.columns.length);
}

function savePracticeCells() {
  const out = {};
  for (const [k, raw] of practice.sheet.inputs) out[`${Math.floor(k / 1000)},${k % 1000}`] = raw;
  store.set(`pcells:${practice.set.id}:${practice.seed}`, out);
}

$('#practice-select').addEventListener('change', (e) => openPracticeSet(e.target.value));
$('#btn-practice-new').addEventListener('click', () => {
  loadPracticeData(practice.seed + 1 + Math.floor(Math.random() * 1000));
  renderQuestion();
});

// ---------- Сетка ----------

function fmtValue(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'ИСТИНА' : 'ЛОЖЬ';
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return String(v);
    return String(Math.round(v * 1e6) / 1e6).replace('.', ',');
  }
  return String(v);
}

function gridRows() {
  return practice.set.rowsCount + 1 + 10;
}

function renderGrid() {
  const set = practice.set;
  const grid = $('#grid');
  const widths = [...set.widths];
  let html = '<colgroup><col class="rowhead-col">';
  for (let c = 0; c < GRID_COLS; c++) html += `<col style="width:${widths[c] ?? 88}px">`;
  html += '</colgroup><thead><tr><th class="corner"></th>';
  for (let c = 0; c < GRID_COLS; c++) html += `<th data-col="${c}">${colName(c)}</th>`;
  html += '</tr></thead><tbody>';
  for (let r = 0; r < gridRows(); r++) {
    html += `<tr><th data-row="${r}">${r + 1}</th>`;
    for (let c = 0; c < GRID_COLS; c++) {
      const locked = practice.sheet.isLocked(r, c);
      html += `<td data-r="${r}" data-c="${c}" class="${locked ? 'locked' : ''}${r === 0 && locked ? ' head' : ''}"></td>`;
    }
    html += '</tr>';
  }
  grid.innerHTML = html + '</tbody>';
  refreshGrid();
}

function cellTd(r, c) {
  return $(`#grid td[data-r="${r}"][data-c="${c}"]`);
}

function refreshGrid() {
  const sheet = practice.sheet;
  for (const td of $('#grid').querySelectorAll('td')) {
    const r = Number(td.dataset.r);
    const c = Number(td.dataset.c);
    const res = sheet.result(r, c);
    td.classList.toggle('err', !!res.error);
    td.classList.toggle('num', typeof res.value === 'number' || typeof res.value === 'boolean');
    td.classList.toggle('formula', !sheet.isLocked(r, c) && String(sheet.raw(r, c)).startsWith('='));
    td.textContent = res.error ? res.error : fmtValue(res.value);
    td.title = res.error ? res.message : '';
  }
}

function selectCell(r, c, focusGrid = false) {
  const max = gridRows() - 1;
  r = Math.max(0, Math.min(max, r));
  c = Math.max(0, Math.min(GRID_COLS - 1, c));
  const old = cellTd(practice.sel.r, practice.sel.c);
  if (old) old.classList.remove('sel');
  practice.sel = { r, c };
  const td = cellTd(r, c);
  if (td) {
    td.classList.add('sel');
    td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  $('#cell-name').textContent = cellName(r, c);
  const raw = practice.sheet.raw(r, c);
  const input = $('#formula-input');
  input.value = typeof raw === 'number' ? fmtValue(raw) : raw;
  input.readOnly = practice.sheet.isLocked(r, c);
  if (focusGrid) $('#grid-wrap').focus();
}

function commitCell(moveDown = true) {
  const { r, c } = practice.sel;
  if (practice.sheet.isLocked(r, c)) return;
  let text = $('#formula-input').value;
  // Подсказка, как в Calc: незакрытые скобки дописываются
  if (text.startsWith('=')) {
    const open = (text.match(/\(/g) || []).length - (text.match(/\)/g) || []).length;
    if (open > 0 && (text.match(/"/g) || []).length % 2 === 0) text += ')'.repeat(open);
  }
  practice.sheet.set(r, c, text);
  savePracticeCells();
  refreshGrid();
  selectCell(moveDown ? r + 1 : r, c, true);
}

// Вставка ссылок щелчком по ячейкам, пока пишется формула
let refPick = null; // { input, start, end, anchor }

function refTargetInput() {
  const el = document.activeElement;
  if (!el) return null;
  if (el.id === 'formula-input' && el.value.startsWith('=') && !el.readOnly) return el;
  if (el.id === 'q-answer' && el.value.startsWith('=')) return el;
  if (el.id === 'q-range') return el;
  return null;
}

function insertRef(input, text) {
  const start = refPick ? refPick.start : input.selectionStart;
  const end = refPick ? refPick.end : input.selectionEnd;
  input.value = input.value.slice(0, start) + text + input.value.slice(end);
  const pos = start + text.length;
  input.setSelectionRange(pos, pos);
  if (refPick) refPick.end = pos;
  input.dispatchEvent(new Event('input'));
}

const grid = $('#grid');
grid.addEventListener('mousedown', (e) => {
  const td = e.target.closest('td');
  if (!td) return;
  const r = Number(td.dataset.r);
  const c = Number(td.dataset.c);
  const target = refTargetInput();
  if (target && !(target.id === 'formula-input' && practice.sel.r === r && practice.sel.c === c)) {
    e.preventDefault();
    refPick = { input: target, start: target.selectionStart, end: target.selectionEnd, anchor: { r, c } };
    insertRef(target, cellName(r, c));
    return;
  }
  selectCell(r, c, true);
});
grid.addEventListener('mouseover', (e) => {
  if (!refPick || e.buttons !== 1) return;
  const td = e.target.closest('td');
  if (!td) return;
  const r = Number(td.dataset.r);
  const c = Number(td.dataset.c);
  const a = refPick.anchor;
  const text = a.r === r && a.c === c ? cellName(r, c) : `${cellName(Math.min(a.r, r), Math.min(a.c, c))}:${cellName(Math.max(a.r, r), Math.max(a.c, c))}`;
  insertRef(refPick.input, text);
});
window.addEventListener('mouseup', () => {
  if (refPick) {
    refPick.input.focus();
    refPick = null;
  }
});
grid.addEventListener('dblclick', (e) => {
  if (!e.target.closest('td')) return;
  const input = $('#formula-input');
  if (!input.readOnly) {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
});

$('#grid-wrap').addEventListener('keydown', (e) => {
  const { r, c } = practice.sel;
  const input = $('#formula-input');
  const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Enter: [1, 0], Tab: [0, e.shiftKey ? -1 : 1] };
  if (moves[e.key]) {
    e.preventDefault();
    selectCell(r + moves[e.key][0], c + moves[e.key][1], true);
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    if (practice.sheet.set(r, c, '')) {
      savePracticeCells();
      refreshGrid();
      selectCell(r, c, true);
    }
  } else if (e.key === 'F2') {
    e.preventDefault();
    if (!input.readOnly) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (input.readOnly) return;
    e.preventDefault();
    input.value = e.key;
    input.focus();
    input.setSelectionRange(1, 1);
  }
});

$('#formula-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    commitCell(true);
  } else if (e.key === 'Tab') {
    e.preventDefault();
    commitCell(false);
    selectCell(practice.sel.r, practice.sel.c + (e.shiftKey ? -1 : 1), true);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    selectCell(practice.sel.r, practice.sel.c, true);
  }
});

$('#btn-fill').addEventListener('click', () => {
  const { r, c } = practice.sel;
  const sheet = practice.sheet;
  const raw = sheet.raw(r, c);
  if (sheet.isLocked(r, c) || raw === '') {
    alert('Выделите ячейку с формулой, которую нужно протянуть вниз (например, E2).');
    return;
  }
  const last = practice.set.rowsCount; // индекс последней строки данных
  if (r >= last) {
    alert(`Протягивать нужно из ячейки выше последней строки данных (${practice.set.rowsCount + 1}).`);
    return;
  }
  for (let rr = r + 1; rr <= last; rr++) {
    const f = String(raw).startsWith('=') ? shiftFormula(String(raw), rr - r, 0) : raw;
    if (f !== null) sheet.set(rr, c, f);
  }
  savePracticeCells();
  refreshGrid();
  selectCell(r, c, true);
});

$('#btn-clear-cells').addEventListener('click', () => {
  if (!practice.sheet.inputs.size || confirm('Удалить всё, что вы ввели в таблицу?')) {
    practice.sheet.clear();
    savePracticeCells();
    refreshGrid();
    selectCell(practice.sel.r, practice.sel.c);
  }
});

// ---------- Вопросы ----------

function renderQList() {
  const list = $('#qlist');
  list.innerHTML = '';
  practice.set.questions.forEach((q, i) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    const st = practice.status[q.id];
    btn.className = `${i === practice.q ? 'is-active ' : ''}${st || ''}`;
    btn.innerHTML = `<span class="q-icon" aria-hidden="true">${i + 1}</span>`;
    btn.title = `${i + 1}. ${q.topic}${st === 'ok' ? ' — решено' : st === 'bad' ? ' — есть ошибка' : ''}`;
    btn.setAttribute('aria-label', btn.title);
    btn.addEventListener('click', () => {
      practice.q = i;
      renderQuestion();
    });
    li.append(btn);
    list.append(li);
  });
}

function renderQuestion() {
  const set = practice.set;
  const q = set.questions[practice.q];
  store.set(`pq:${set.id}`, practice.q);
  renderQList();
  $('#q-topic').textContent = `Вопрос ${practice.q + 1} из ${set.questions.length} · ${q.topic}`;
  $('#q-text').textContent = q.text;
  const isChart = q.kind === 'chart';
  $('#q-formula-block').hidden = isChart;
  $('#q-chart-block').hidden = !isChart;
  $('#q-result').hidden = true;
  togglePanel('#q-hint', '#btn-q-hint', false);
  togglePanel('#q-solution', '#btn-q-solution', false);
  const saved = store.get(`pans:${set.id}:${q.id}`, null);
  if (isChart) {
    $('#q-range').value = saved?.range ?? '';
    $('#q-legend').checked = saved?.legend ?? false;
    $('#q-labels').value = saved?.labels ?? 'none';
    drawPracticePie();
  } else {
    $('#q-answer').value = saved ?? '';
  }
  $('#btn-q-prev').disabled = practice.q === 0;
  $('#btn-q-next').disabled = practice.q === set.questions.length - 1;
}

$('#btn-q-prev').addEventListener('click', () => {
  practice.q = Math.max(0, practice.q - 1);
  renderQuestion();
});
$('#btn-q-next').addEventListener('click', () => {
  practice.q = Math.min(practice.set.questions.length - 1, practice.q + 1);
  renderQuestion();
});

$('#q-answer').addEventListener('input', () => {
  const q = practice.set.questions[practice.q];
  store.set(`pans:${practice.set.id}:${q.id}`, $('#q-answer').value);
});
$('#q-answer').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    checkQuestion();
  }
});
['input', 'change'].forEach((ev) => {
  for (const id of ['#q-range', '#q-legend', '#q-labels']) {
    $(id).addEventListener(ev, () => {
      const q = practice.set.questions[practice.q];
      store.set(`pans:${practice.set.id}:${q.id}`, { range: $('#q-range').value, legend: $('#q-legend').checked, labels: $('#q-labels').value });
      drawPracticePie();
    });
  }
});
$('#q-range').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    checkQuestion();
  }
});

$('#btn-q-hint').addEventListener('click', () => {
  if (togglePanel('#q-hint', '#btn-q-hint')) $('#q-hint').innerHTML = practice.set.questions[practice.q].hint;
});
$('#btn-q-solution').addEventListener('click', () => {
  if (!togglePanel('#q-solution', '#btn-q-solution')) return;
  const q = practice.set.questions[practice.q];
  let html = `<code class="sol-code">${esc(q.solution)}</code>`;
  if (q.kind !== 'chart') {
    html += `<p class="small muted">Верный ответ для этой таблицы: <b>${describeAnswer(q.answer(practice.rows), q.digits)}</b></p><button class="btn small" id="btn-q-use">Вставить в ответ</button>`;
  }
  $('#q-solution').innerHTML = html;
  $('#btn-q-use')?.addEventListener('click', () => {
    $('#q-answer').value = q.solution;
    $('#q-answer').dispatchEvent(new Event('input'));
    $('#q-answer').focus();
  });
});
$('#btn-q-check').addEventListener('click', () => checkQuestion());

function setStatus(q, ok) {
  practice.status[q.id] = ok ? 'ok' : 'bad';
  store.set(`pstatus:${practice.set.id}:${practice.seed}`, practice.status);
  renderQList();
}

function showQResult(ok, html) {
  const box = $('#q-result');
  box.hidden = false;
  box.className = `q-result ${ok ? 'ok' : 'bad'}`;
  box.innerHTML = html;
}

function checkQuestion() {
  const q = practice.set.questions[practice.q];
  if (q.kind === 'chart') return checkPracticeChart(q);

  const text = $('#q-answer').value.trim();
  if (!text) {
    showQResult(false, 'Введите формулу, начиная со знака «=», или число.');
    return;
  }
  const res = practice.sheet.evaluateAnswer(text);
  if (res.error) {
    setStatus(q, false);
    showQResult(false, `<b>${esc(res.error)}</b> — ${esc(res.message)}${formulaTips(text)}`);
    return;
  }
  const want = q.answer(practice.rows);
  const tol = q.digits > 0 ? 0.005 + 1e-9 : 1e-9;
  const x = res.value;
  const shown = typeof x === 'number' ? fmtValue(x) : esc(fmtValue(x));
  if (typeof x !== 'number') {
    setStatus(q, false);
    showQResult(false, `Формула вернула «${shown}», а ответ должен быть числом.${formulaTips(text)}`);
    return;
  }
  const ok = Math.abs(x - want) <= tol || (q.percent && Math.abs(x * 100 - want) <= tol);
  setStatus(q, ok);
  if (ok) {
    let msg = `<b>Верно!</b> Результат: ${shown}.`;
    if (res.typed) msg += ' Ответ верный, но попробуйте получить его формулой: на экзамене в таблице 1000 строк, вручную их не посчитать.';
    else if (rangeTip(text)) msg += ` Но будьте внимательны: ${rangeTip(text).replace(/^Д/, 'д')} Здесь ответ совпал случайно — на других данных он будет неверным.`;
    else if (q.digits > 0 && Math.abs(x - want) > 1e-9) msg += ' Значение округлено — на экзамене лучше оставить формулу без округления или показать не менее двух знаков после запятой.';
    showQResult(true, msg);
    return;
  }
  const m = q.mistakes(practice.rows).find((mm) => Math.abs(mm.value - x) <= tol && Math.abs(mm.value - want) > tol);
  let why = m ? m.why : '';
  if (!why) why = rangeTip(text) || (q.digits > 0 && Math.abs(x - want) < 1 ? 'Похоже, значение округлено слишком сильно — нужна точность не менее двух знаков после запятой.' : 'Проверьте, какие столбцы и условия используются в формуле.');
  showQResult(false, `Результат: <b>${shown}</b> — неверно. ${why}`);
}

// Диапазоны, которые не охватывают все строки данных
function rangeTip(text) {
  if (!text.startsWith('=')) return '';
  let tree;
  try {
    tree = parseFormula(text);
  } catch {
    return '';
  }
  const last = practice.set.rowsCount; // индекс последней строки данных (строка last+1)
  for (const r of refsOf(tree)) {
    if (r.r2 > r.r1 && r.c1 < GRID_COLS && (r.r1 > 1 || r.r2 < last) && r.r2 <= last + 1) {
      return `Диапазон ${cellName(r.r1, r.c1)}:${cellName(r.r2, r.c2)} охватывает не все строки с данными — они идут со 2-й по ${last + 1}-ю.`;
    }
  }
  return '';
}

function formulaTips(text) {
  const tips = [];
  if (/;\s*[<>=]/.test(text) || /;\s*[<>]=?\d/.test(text)) tips.push('Условие со знаком сравнения пишется в кавычках: <code>"&gt;200"</code>.');
  if (/[;(]\s*[А-ЯЁа-яё][^;()"]*[;)]/.test(text) && !/[;(]\s*(ИСТИНА|ЛОЖЬ)\s*[;)]/i.test(text)) tips.push('Текст в условии пишется в кавычках: <code>"С"</code>, <code>"информатика"</code>.');
  if (/,/.test(text) && !/;/.test(text) && /[А-ЯЁ]\(/i.test(text)) tips.push('В русских версиях программ аргументы функций разделяются точкой с запятой «;».');
  return tips.length ? `<ul class="tips">${tips.map((t) => `<li>${t}</li>`).join('')}</ul>` : '';
}

// ---------- Диаграмма в практикуме ----------

function practiceChartData() {
  const text = $('#q-range').value.trim().toUpperCase();
  if (!text) return { error: 'Укажите диапазон данных, например G6:H8.' };
  const ranges = parseRanges(text.replace(/\s+/g, ''), '');
  if (ranges.length !== 1) return { error: 'Не удалось разобрать диапазон. Запишите его так: G6:H8.' };
  const r = ranges[0];
  const width = r.c2 - r.c1 + 1;
  if (width > 2) return { error: 'Выделите два столбца: подписи и значения — или только столбец значений.' };
  const sheet = practice.sheet;
  if (r.r2 - r.r1 + 1 > 40) return { error: 'Слишком большой диапазон: диаграмму строят по нескольким подсчитанным значениям, а не по исходному столбцу.' };
  const items = [];
  for (let row = r.r1; row <= r.r2; row++) {
    const val = sheet.result(row, r.c2);
    const lab = width === 2 ? sheet.result(row, r.c1) : null;
    if (val.error) return { error: `В ячейке ${cellName(row, r.c2)} ошибка ${val.error}: ${val.message}` };
    items.push({ label: lab && !lab.error ? fmtValue(lab.value) : '', value: typeof val.value === 'number' ? val.value : null });
  }
  if (items.length > 40) return { error: 'Слишком большой диапазон: диаграмму строят по нескольким подсчитанным значениям, а не по исходному столбцу.' };
  return { items, hasLabels: width === 2, range: r };
}

function drawPracticePie() {
  const box = $('#q-pie');
  const d = practiceChartData();
  if (d.error) {
    box.innerHTML = `<p class="muted small">${esc(d.error)}</p>`;
    return;
  }
  const items = d.items.map((it) => ({ label: it.label, value: it.value ?? 0 }));
  box.innerHTML = pieSVG(items, { legend: $('#q-legend').checked, labels: $('#q-labels').value });
}

function checkPracticeChart(q) {
  const d = practiceChartData();
  if (d.error) {
    setStatus(q, false);
    showQResult(false, esc(d.error));
    return;
  }
  const want = q.values(practice.rows);
  const problems = [];
  const vals = d.items.map((it) => it.value);
  if (vals.some((x) => x === null)) problems.push('В диапазоне есть ячейки без чисел. Проверьте, что формулы записаны во всех ячейках значений.');
  else if (vals.length !== want.length) problems.push(`В диапазоне ${vals.length} значений, а категорий в условии ${want.length}.`);
  else {
    const norm = (s) => String(s).toLowerCase().replace(/ё/g, 'е').trim();
    q.labels.forEach((lab, i) => {
      const k = d.items.findIndex((it) => norm(it.label) === norm(lab) || new RegExp(`(^|\\D)${lab}(\\D|$)`).test(it.label));
      if (!d.hasLabels) return;
      if (k < 0) problems.push(`Нет сектора с подписью «${esc(lab)}». Проверьте подписи в первом столбце диапазона.`);
      else if (d.items[k].value !== want[i]) problems.push(`Для «${esc(lab)}» получилось ${fmtValue(d.items[k].value)} — неверно. Проверьте формулу подсчёта (не забыли закрепить диапазон знаком $ перед протягиванием?).`);
    });
    if (!d.hasLabels) {
      const sw = [...want].sort((a, b) => a - b);
      const sv = [...vals].sort((a, b) => a - b);
      if (sw.some((x, i) => x !== sv[i])) problems.push('Значения не совпадают с верными — проверьте формулы подсчёта.');
      problems.push('Диапазон состоит из одного столбца значений, поэтому в легенде будут номера 1, 2, 3 вместо названий. Выделите два столбца: подписи и значения.');
    }
  }
  if (!$('#q-legend').checked) problems.push('Включите легенду — по условию она обязательна.');
  const labels = $('#q-labels').value;
  if (labels === 'none') problems.push('Добавьте подписи данных — на диаграмме должны быть видны числовые значения.');
  else if (labels === 'percent') problems.push('Подписи показаны в процентах, а по условию нужны числовые значения данных: выберите «значение как число».');

  const ok = problems.length === 0;
  setStatus(q, ok);
  showQResult(ok, ok
    ? '<b>Верно!</b> Данные посчитаны правильно, есть легенда и подписи значений. В Calc диаграмма строится так же: выделить диапазон → Вставка → Диаграмма → Круговая.'
    : `<ul class="problems">${problems.map((p) => `<li>${p}</li>`).join('')}</ul>`);
}

// =====================================================================
// Справка, клавиши, запуск
// =====================================================================

const help = $('#help');
$('#btn-help').addEventListener('click', () => help.showModal());
$('#btn-help-close').addEventListener('click', () => help.close());
help.addEventListener('click', (e) => {
  if (e.target === help) help.close();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'F1') {
    e.preventDefault();
    help.open ? help.close() : help.showModal();
  }
});

function applyHash() {
  let h = '';
  try {
    h = decodeURIComponent(location.hash.slice(1));
  } catch {
    // испорченная ссылка — открываем тренажёр как обычно
  }
  const pm = /^practice(?:\/([a-z]+))?$/.exec(h);
  if (pm) {
    setMode('practice', false);
    openPracticeSet(pm[1] || store.get('practice', PRACTICE[0].id), false);
    setHash('practice/' + practice.set.id);
    return true;
  }
  const m = /^([a-z]+)(?:\/(\d+))?$/.exec(h);
  if (m && taskById(m[1])) {
    setMode('file', false);
    openTask(taskById(m[1]), m[2] ? Number(m[2]) : store.get('variant:' + m[1], 1));
    return true;
  }
  return false;
}

window.addEventListener('hashchange', applyHash);

fillTaskSelect();
fillPracticeSelect();
if (!applyHash()) {
  const t = taskById(store.get('task', TASKS[0].id)) || TASKS[0];
  openTask(t, store.get('variant:' + t.id, 1), false);
  setMode(store.get('mode', 'file'));
}
