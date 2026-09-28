// Электронные таблицы: создание файла .ods для задания и чтение присланного
// решения (.ods или .xlsx) — ячейки, их значения и диаграммы.
//
// Модель прочитанной книги:
// {
//   format: 'ods' | 'xlsx',
//   variant: строка из свойств документа или null,
//   sheets: [{ name, cells: Map('строка,столбец' → { v, text, formula }), rows, cols }],
//   charts: [{ sheet, type, anchor: { row, col } | null, legend, labels: { value, percent, category },
//              series: [{ values, ref }], categories, catRef }],
// }
// Строки и столбцы нумеруются с 0: A1 → (0, 0), H2 → (1, 7).

import { makeZip, readZip } from './zip.js';
import { NS, parseXML, attr, kid, kids, find, findAll, textOf, escapeXML } from './xml.js';

export const VARIANT_PROP = 'oge14';

// ---------- Адреса ячеек ----------

export function colName(c) {
  let s = '';
  for (c += 1; c > 0; c = Math.floor((c - 1) / 26)) s = String.fromCharCode(65 + ((c - 1) % 26)) + s;
  return s;
}

export function colIndex(letters) {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export const cellName = (row, col) => colName(col) + (row + 1);

export function parseCell(ref) {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(ref.trim());
  return m ? { row: Number(m[2]) - 1, col: colIndex(m[1]) } : null;
}

const key = (row, col) => row + ',' + col;

export function getCell(sheet, row, col) {
  return sheet?.cells.get(key(row, col)) ?? null;
}

// ---------- Создание .ods ----------

// columns: [{ title, width (см), type: 'string' | 'float' }], rows: массив массивов значений
// → Promise<Uint8Array>
export function makeOds({ sheetName = 'Лист1', columns, rows, variant, title }) {
  const cell = (value, type) => {
    if (value === null || value === undefined || value === '') return '<table:table-cell/>';
    if (type === 'float') {
      const text = String(value).replace('.', ',');
      return `<table:table-cell office:value-type="float" office:value="${value}"><text:p>${text}</text:p></table:table-cell>`;
    }
    return `<table:table-cell office:value-type="string"><text:p>${escapeXML(value)}</text:p></table:table-cell>`;
  };

  const colStyles = columns
    .map((c, i) => `<style:style style:name="co${i + 1}" style:family="table-column"><style:table-column-properties style:column-width="${c.width ?? 2.5}cm"/></style:style>`)
    .join('');
  const colDefs = columns.map((c, i) => `<table:table-column table:style-name="co${i + 1}" table:default-cell-style-name="Default"/>`).join('');
  const header = '<table:table-row>' + columns.map((c) => `<table:table-cell office:value-type="string" table:style-name="head"><text:p>${escapeXML(c.title)}</text:p></table:table-cell>`).join('') + '</table:table-row>';
  const body = rows.map((r) => '<table:table-row>' + r.map((v, i) => cell(v, columns[i].type)).join('') + '</table:table-row>').join('\n');

  const docNs = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.2"';

  const content = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content ${docNs}>
<office:automatic-styles>${colStyles}<style:style style:name="head" style:family="table-cell" style:parent-style-name="Default"><style:text-properties fo:font-weight="bold"/></style:style></office:automatic-styles>
<office:body><office:spreadsheet><table:table table:name="${escapeXML(sheetName)}">${colDefs}
${header}
${body}
</table:table></office:spreadsheet></office:body></office:document-content>`;

  const styles = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles ${docNs}><office:styles><style:style style:name="Default" style:family="table-cell"/></office:styles></office:document-styles>`;

  const meta = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta ${docNs}><office:meta><meta:generator>Тренажёр задания 14 ОГЭ</meta:generator>${title ? `<dc:title>${escapeXML(title)}</dc:title>` : ''}<meta:user-defined meta:name="${VARIANT_PROP}">${escapeXML(variant)}</meta:user-defined></office:meta></office:document-meta>`;

  const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
<manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="application/vnd.oasis.opendocument.spreadsheet"/>
<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
<manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`;

  return makeZip([
    { name: 'mimetype', data: 'application/vnd.oasis.opendocument.spreadsheet', store: true }, // первым и без сжатия — так требует формат
    { name: 'content.xml', data: content },
    { name: 'styles.xml', data: styles },
    { name: 'meta.xml', data: meta },
    { name: 'META-INF/manifest.xml', data: manifest },
  ]);
}

// ---------- Чтение ----------

export class WorkbookError extends Error {}

export async function readWorkbook(bytes, fileName = '') {
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf) {
    throw new WorkbookError('Это файл старого формата .xls. Сохраните таблицу в формате .ods (или .xlsx) и загрузите ещё раз.');
  }
  let zip;
  try {
    zip = readZip(bytes);
  } catch {
    throw new WorkbookError(`Файл «${fileName}» не похож на электронную таблицу. Нужен файл .ods (или .xlsx).`);
  }
  if (zip.has('content.xml')) {
    const mime = zip.has('mimetype') ? (await zip.get('mimetype').text()).trim() : '';
    if (mime && !mime.includes('spreadsheet')) throw new WorkbookError('Это документ OpenDocument, но не электронная таблица. Нужен файл .ods из Calc.');
    return readOds(zip);
  }
  if (zip.has('xl/workbook.xml')) return readXlsx(zip);
  throw new WorkbookError(`Файл «${fileName}» не похож на электронную таблицу. Нужен файл .ods (или .xlsx).`);
}

// Диапазон вида «Лист1.$H$5:.$H$7», «'Лист 1'.H5:'Лист 1'.H7», «Sheet1!$H$5:$H$7»
// → [{ sheet, r1, c1, r2, c2 }] (несколько диапазонов через пробел или запятую)
export function parseRanges(text, defaultSheet) {
  if (!text) return [];
  const out = [];
  const parts = text.match(/(?:'(?:[^']|'')*'|[^\s,;])+/g) || [];
  for (const part of parts) {
    const ends = part.split(/:(?=(?:[^']*'[^']*')*[^']*$)/);
    const refs = ends.map((e) => {
      const m = /^(?:\$?('(?:[^']|'')*'|[^.!']*)[.!])?(\$?[A-Za-z]{1,3}\$?\d+)$/.exec(e);
      if (!m) return null;
      let sheet = m[1] || '';
      if (sheet.startsWith("'")) sheet = sheet.slice(1, -1).replace(/''/g, "'");
      const cell = parseCell(m[2]);
      return cell && { sheet, ...cell };
    });
    if (refs.some((r) => !r)) continue;
    const a = refs[0];
    const b = refs[1] || a;
    const sheet = a.sheet || b.sheet || defaultSheet;
    out.push({ sheet, r1: Math.min(a.row, b.row), c1: Math.min(a.col, b.col), r2: Math.max(a.row, b.row), c2: Math.max(a.col, b.col) });
  }
  return out;
}

export function rangeText(r) {
  const a = cellName(r.r1, r.c1);
  const b = cellName(r.r2, r.c2);
  return a === b ? a : `${a}:${b}`;
}

function rangeCells(book, ranges) {
  const out = [];
  for (const r of ranges) {
    const sheet = book.sheets.find((s) => s.name === r.sheet) ?? null;
    for (let row = r.r1; row <= r.r2; row++) {
      for (let col = r.c1; col <= r.c2; col++) out.push(getCell(sheet, row, col));
    }
  }
  return out;
}

const toNumber = (cell) => (cell && typeof cell.v === 'number' ? cell.v : null);

// ---------- .ods ----------

async function readOds(zip) {
  const content = parseXML(await zip.get('content.xml').text());
  let variant = null;
  if (zip.has('meta.xml')) {
    const meta = parseXML(await zip.get('meta.xml').text());
    for (const u of findAll(meta, NS.meta, 'user-defined')) {
      if (attr(u, NS.meta, 'name') === VARIANT_PROP) variant = textOf(u).trim();
    }
  }

  const book = { format: 'ods', variant, sheets: [], charts: [] };
  const sizes = odsSizes(content);
  const frames = [];
  for (const t of findAll(content, NS.table, 'table')) {
    const sheet = { name: attr(t, NS.table, 'name'), cells: new Map(), rows: 0, cols: 0 };
    book.sheets.push(sheet);
    const geom = { cols: [], rows: [] };
    readOdsRows(t, sheet, frames, geom, sizes);
    for (const c of findAll(t, NS.table, 'table-column')) {
      const w = sizes.get(attr(c, NS.table, 'style-name')) ?? 2.258;
      const rep = Math.min(Number(attr(c, NS.table, 'number-columns-repeated') || 1), 200);
      for (let k = 0; k < rep; k++) geom.cols.push(w);
    }
    // Диаграммы, привязанные к странице, лежат в table:shapes
    const shapes = kid(t, NS.table, 'shapes');
    if (shapes) for (const f of kids(shapes, NS.draw, 'frame')) frames.push({ frame: f, sheet: sheet.name, cell: null, geom });
  }

  for (const { frame, sheet, cell, geom } of frames) {
    const obj = kid(frame, NS.draw, 'object');
    const href = obj && attr(obj, NS.xlink, 'href');
    if (!href) continue;
    const dir = href.replace(/^\.\//, '').replace(/\/$/, '');
    const entry = zip.get(dir + '/content.xml');
    if (!entry) continue;
    const chartDoc = parseXML(await entry.text());
    if (!find(chartDoc, NS.chart, 'chart')) continue;
    const chart = readOdsChart(chartDoc, book, sheet);
    chart.anchor = cell ?? odsFramePosition(frame, geom);
    book.charts.push(chart);
  }
  return book;
}

// Ширины столбцов и высоты строк из автоматических стилей (в сантиметрах)
function odsSizes(content) {
  const sizes = new Map();
  for (const s of findAll(content, NS.style, 'style')) {
    const name = attr(s, NS.style, 'name');
    const col = kid(s, NS.style, 'table-column-properties');
    const row = kid(s, NS.style, 'table-row-properties');
    const v = col ? attr(col, NS.style, 'column-width') : row ? attr(row, NS.style, 'row-height') : null;
    const cm = toCm(v);
    if (cm !== null) sizes.set(name, cm);
  }
  return sizes;
}

function toCm(v) {
  const m = /^(-?[\d.]+)(cm|mm|in|pt)?$/.exec(v || '');
  if (!m) return null;
  return Number(m[1]) * { cm: 1, mm: 0.1, in: 2.54, pt: 2.54 / 72 }[m[2] || 'cm'];
}

function readOdsRows(tableNode, sheet, frames, geom, sizes) {
  let row = 0;
  const walk = (node) => {
    for (const ch of node.children) {
      if (typeof ch === 'string') continue;
      if (ch.ns !== NS.table) continue;
      if (ch.local === 'table-row') {
        const rep = Number(attr(ch, NS.table, 'number-rows-repeated') || 1);
        const h = sizes.get(attr(ch, NS.table, 'style-name')) ?? 0.452;
        for (let k = 0; k < rep && geom.rows.length < 5000; k++) geom.rows.push(h);
        const hasData = readOdsRow(ch, row, sheet, frames);
        // Повторы пустых строк бывают огромными (до миллиона) — данные в них не дублируем
        if (hasData && rep > 1 && rep < 2000) {
          for (let k = 1; k < rep; k++) readOdsRow(ch, row + k, sheet, null);
        }
        row += rep;
      } else if (/^table-(row-group|rows|header-rows)$/.test(ch.local)) {
        walk(ch);
      }
    }
  };
  walk(tableNode);
}

function readOdsRow(rowNode, row, sheet, frames) {
  let col = 0;
  let hasData = false;
  for (const c of rowNode.children) {
    if (typeof c === 'string' || c.ns !== NS.table) continue;
    if (c.local !== 'table-cell' && c.local !== 'covered-table-cell') continue;
    const rep = Number(attr(c, NS.table, 'number-columns-repeated') || 1);
    const value = odsCellValue(c);
    if (value) {
      hasData = true;
      for (let k = 0; k < Math.min(rep, 1000); k++) {
        sheet.cells.set(key(row, col + k), value);
        sheet.rows = Math.max(sheet.rows, row + 1);
        sheet.cols = Math.max(sheet.cols, col + k + 1);
      }
    }
    if (frames) {
      for (const f of kids(c, NS.draw, 'frame')) frames.push({ frame: f, sheet: sheet.name, cell: { row, col } });
    }
    col += rep;
  }
  return hasData;
}

function odsCellValue(c) {
  const type = attr(c, NS.office, 'value-type');
  const formula = attr(c, NS.table, 'formula');
  const text = kids(c, NS.text, 'p').map(odsText).join('\n');
  let v = null;
  if (type === 'float' || type === 'percentage' || type === 'currency') v = Number(attr(c, NS.office, 'value'));
  else if (type === 'boolean') v = attr(c, NS.office, 'boolean-value') === 'true';
  else if (type === 'date') v = attr(c, NS.office, 'date-value');
  else if (type === 'time') v = attr(c, NS.office, 'time-value');
  else if (type === 'string') v = attr(c, NS.office, 'string-value') ?? text;
  else if (text) v = text; // ошибки формул (#ДЕЛ/0! и т. п.) записываются как текст без типа
  if (v === null && !formula) return null;
  return { v, text, formula: formula ? formula.replace(/^of:/, '') : null };
}

function odsText(node) {
  let s = '';
  for (const c of node.children) {
    if (typeof c === 'string') s += c;
    else if (c.local === 's') s += ' '.repeat(Number(attr(c, NS.text, 'c') || 1));
    else if (c.local === 'tab') s += '\t';
    else s += odsText(c);
  }
  return s;
}

// Ячейка под левым верхним углом рамки (для диаграмм, привязанных к странице)
function odsFramePosition(frame, geom) {
  const x = toCm(attr(frame, NS.svg, 'x'));
  const y = toCm(attr(frame, NS.svg, 'y'));
  if (x === null || y === null) return null;
  const locate = (pos, sizes, def) => {
    let i = 0;
    let acc = 0;
    for (;;) {
      const s = sizes[i] ?? def;
      if (acc + s > pos + 0.01) return i;
      acc += s;
      i++;
    }
  };
  return { col: locate(x, geom.cols, 2.258), row: locate(y, geom.rows, 0.452) };
}

function readOdsChart(doc, book, sheetName) {
  const chartNode = find(doc, NS.chart, 'chart');
  const styles = new Map();
  for (const s of findAll(doc, NS.style, 'style')) {
    const props = kid(s, NS.style, 'chart-properties');
    if (props) styles.set(attr(s, NS.style, 'name'), props);
  }
  const labelsOf = (styleName) => {
    const p = styles.get(styleName);
    if (!p) return null;
    const num = attr(p, NS.chart, 'data-label-number') || 'none';
    return {
      value: num === 'value' || num === 'value-and-percentage',
      percent: num === 'percentage' || num === 'value-and-percentage',
      category: attr(p, NS.chart, 'data-label-text') === 'true',
    };
  };

  const plot = find(doc, NS.chart, 'plot-area');
  const cls = (attr(chartNode, NS.chart, 'class') || '').replace(/^chart:/, '');
  const labels = { value: false, percent: false, category: false };
  const addLabels = (l) => {
    if (!l) return;
    labels.value ||= l.value;
    labels.percent ||= l.percent;
    labels.category ||= l.category;
  };

  const local = readLocalTable(doc);
  const series = [];
  for (const [i, s] of findAll(plot || doc, NS.chart, 'series').entries()) {
    addLabels(labelsOf(attr(s, NS.chart, 'style-name')));
    for (const dp of kids(s, NS.chart, 'data-point')) addLabels(labelsOf(attr(dp, NS.chart, 'style-name')));
    for (const dl of kids(s, NS.chart, 'data-label')) addLabels(labelsOf(attr(dl, NS.chart, 'style-name')));
    const ref = attr(s, NS.chart, 'values-cell-range-address');
    const ranges = parseRanges(ref, sheetName);
    let values = ranges.length ? rangeCells(book, ranges).map(toNumber) : [];
    if (!values.length && local) values = local.series[i] ?? [];
    series.push({ values, ref: ranges.map(rangeText).join(', ') || null, type: (attr(s, NS.chart, 'class') || '').replace(/^chart:/, '') || cls });
  }

  let categories = [];
  let catRef = null;
  const cat = find(plot || doc, NS.chart, 'categories');
  const catRanges = cat ? parseRanges(attr(cat, NS.table, 'cell-range-address'), sheetName) : [];
  if (catRanges.length) {
    catRef = catRanges.map(rangeText).join(', ');
    categories = rangeCells(book, catRanges).map((c) => (c ? (c.text || String(c.v ?? '')) : ''));
  }
  // Без диапазона подписей Calc нумерует сектора сам (1, 2, 3) — названий у них нет

  return {
    sheet: sheetName,
    // У кольцевой диаграммы Calc пишет класс ring у диаграммы, но circle у ряда
    type: normType(cls) === 'doughnut' ? 'doughnut' : normType(series[0]?.type || cls),
    anchor: null,
    legend: !!find(chartNode, NS.chart, 'legend'),
    labels,
    series,
    categories,
    catRef,
  };
}

// Кэш данных внутри объекта диаграммы: первая строка — заголовки рядов,
// дальше в каждой строке категория и значения рядов.
function readLocalTable(doc) {
  const t = find(doc, NS.table, 'table');
  if (!t) return null;
  const rows = findAll(t, NS.table, 'table-row').map((r) => kids(r, NS.table, 'table-cell').map((c) => {
    const type = attr(c, NS.office, 'value-type');
    return type === 'float' ? Number(attr(c, NS.office, 'value')) : textOf(c);
  }));
  if (rows.length < 2) return null;
  const body = rows.slice(1);
  const n = Math.max(0, ...body.map((r) => r.length - 1));
  const series = [];
  for (let k = 0; k < n; k++) series.push(body.map((r) => (typeof r[k + 1] === 'number' ? r[k + 1] : null)));
  return { categories: body.map((r) => String(r[0] ?? '')), series };
}

function normType(t) {
  if (/circle|pie|ring|donut|doughnut/i.test(t)) return /ring|donut|doughnut/i.test(t) ? 'doughnut' : 'pie';
  if (/bar/i.test(t)) return 'bar';
  if (/line/i.test(t)) return 'line';
  if (/area/i.test(t)) return 'area';
  if (/scatter/i.test(t)) return 'scatter';
  return t || 'unknown';
}

// ---------- .xlsx ----------

function resolvePath(base, target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/').slice(0, -1);
  for (const p of target.split('/')) {
    if (p === '..') parts.pop();
    else if (p !== '.') parts.push(p);
  }
  return parts.join('/');
}

async function readRels(zip, path) {
  const relPath = path.replace(/([^/]*)$/, '_rels/$1.rels');
  const map = new Map();
  if (!zip.has(relPath)) return map;
  const doc = parseXML(await zip.get(relPath).text());
  for (const r of findAll(doc, NS.rel, 'Relationship')) {
    map.set(attr(r, null, 'Id'), { target: resolvePath(path, attr(r, null, 'Target')), type: attr(r, null, 'Type') || '' });
  }
  return map;
}

async function readXlsx(zip) {
  const xml = async (p) => (zip.has(p) ? parseXML(await zip.get(p).text()) : null);
  let variant = null;
  const custom = await xml('docProps/custom.xml');
  if (custom) {
    for (const p of findAll(custom, NS.cp, 'property')) {
      if (attr(p, null, 'name') === VARIANT_PROP) variant = textOf(p).trim();
    }
  }

  const shared = [];
  const sst = await xml('xl/sharedStrings.xml');
  if (sst) {
    for (const si of kids(find(sst, NS.x, 'sst'), NS.x, 'si')) {
      shared.push(findAll(si, NS.x, 't').filter((t) => !isInPhonetic(si, t)).map(textOf).join(''));
    }
  }

  const book = { format: 'xlsx', variant, sheets: [], charts: [] };
  const wbPath = 'xl/workbook.xml';
  const wb = await xml(wbPath);
  const wbRels = await readRels(zip, wbPath);
  const sheetDefs = findAll(wb, NS.x, 'sheet').map((s) => ({
    name: attr(s, null, 'name'),
    path: wbRels.get(attr(s, NS.r, 'id'))?.target,
  }));

  for (const def of sheetDefs) {
    const sheet = { name: def.name, cells: new Map(), rows: 0, cols: 0 };
    book.sheets.push(sheet);
    const doc = def.path && (await xml(def.path));
    if (!doc) continue;
    for (const c of findAll(doc, NS.x, 'c')) {
      const pos = parseCell(attr(c, null, 'r') || '');
      if (!pos) continue;
      const t = attr(c, null, 't') || 'n';
      const vNode = kid(c, NS.x, 'v');
      const fNode = kid(c, NS.x, 'f');
      const raw = vNode ? textOf(vNode) : null;
      let v = null;
      if (t === 's') v = raw === null ? null : shared[Number(raw)] ?? '';
      else if (t === 'inlineStr') v = findAll(c, NS.x, 't').map(textOf).join('');
      else if (t === 'b') v = raw === '1';
      else if (t === 'str' || t === 'e') v = raw;
      else if (raw !== null && raw !== '') v = Number(raw);
      const formula = fNode ? textOf(fNode) || null : null;
      if (v === null && !formula) continue;
      // Отображаемый текст зависит от формата ячейки; для чисел его не восстанавливаем
      sheet.cells.set(key(pos.row, pos.col), { v, text: v === null || typeof v === 'number' ? '' : String(v), formula });
      sheet.rows = Math.max(sheet.rows, pos.row + 1);
      sheet.cols = Math.max(sheet.cols, pos.col + 1);
    }

    const rels = await readRels(zip, def.path);
    for (const d of findAll(doc, NS.x, 'drawing')) {
      const drawingPath = rels.get(attr(d, NS.r, 'id'))?.target;
      const drawing = drawingPath && (await xml(drawingPath));
      if (!drawing) continue;
      const dRels = await readRels(zip, drawingPath);
      const anchors = [...kids(drawing.children.find((n) => typeof n !== 'string'), NS.xdr)];
      for (const a of anchors) {
        const ch = find(a, NS.c, 'chart');
        if (!ch) continue;
        const chartPath = dRels.get(attr(ch, NS.r, 'id'))?.target;
        const chartDoc = chartPath && (await xml(chartPath));
        if (!chartDoc) continue;
        const from = kid(a, NS.xdr, 'from');
        const anchor = from
          ? { col: Number(textOf(kid(from, NS.xdr, 'col'))), row: Number(textOf(kid(from, NS.xdr, 'row'))) }
          : null;
        const chart = readXlsxChart(chartDoc, book, def.name);
        chart.anchor = anchor;
        book.charts.push(chart);
      }
    }
  }
  return book;
}

function isInPhonetic(si, t) {
  // Текст фонетических подсказок (rPh) не входит в значение строки
  for (const rph of findAll(si, NS.x, 'rPh')) if (findAll(rph, NS.x, 't').includes(t)) return true;
  return false;
}

const CHART_TYPES = ['pieChart', 'pie3DChart', 'ofPieChart', 'doughnutChart', 'barChart', 'bar3DChart', 'lineChart', 'line3DChart', 'areaChart', 'area3DChart', 'scatterChart', 'radarChart', 'bubbleChart'];

function readXlsxChart(doc, book, sheetName) {
  const chartNode = find(doc, NS.c, 'chart');
  const plot = find(chartNode, NS.c, 'plotArea');
  const typeNode = plot && plot.children.find((n) => typeof n !== 'string' && n.ns === NS.c && CHART_TYPES.includes(n.local));
  const flag = (node, name) => {
    const n = node && kid(node, NS.c, name);
    return !!n && attr(n, null, 'val') !== '0' && attr(n, null, 'val') !== 'false';
  };
  const labels = { value: false, percent: false, category: false };
  const addLabels = (dl) => {
    if (!dl || flag(dl, 'delete')) return;
    labels.value ||= flag(dl, 'showVal');
    labels.percent ||= flag(dl, 'showPercent');
    labels.category ||= flag(dl, 'showCatName');
  };

  const series = [];
  let categories = [];
  let catRef = null;
  if (typeNode) {
    addLabels(kid(typeNode, NS.c, 'dLbls'));
    for (const s of kids(typeNode, NS.c, 'ser')) {
      const dLbls = kid(s, NS.c, 'dLbls');
      if (dLbls && flag(dLbls, 'delete')) {
        // подписи ряда удалены целиком
      } else if (dLbls) {
        addLabels(dLbls);
        for (const d of kids(dLbls, NS.c, 'dLbl')) addLabels(d);
      }
      const val = kid(s, NS.c, 'val') || kid(s, NS.c, 'yVal');
      const f = val && find(val, NS.c, 'f');
      const ranges = f ? parseRanges(textOf(f), sheetName) : [];
      let values = ranges.length ? rangeCells(book, ranges).map(toNumber) : [];
      if (!values.length && val) values = cachePoints(val).map((x) => (x === '' ? null : Number(x)));
      series.push({ values, ref: ranges.map(rangeText).join(', ') || null });

      if (series.length === 1) {
        const cat = kid(s, NS.c, 'cat') || kid(s, NS.c, 'xVal');
        const cf = cat && find(cat, NS.c, 'f');
        const cr = cf ? parseRanges(textOf(cf), sheetName) : [];
        if (cr.length) {
          catRef = cr.map(rangeText).join(', ');
          categories = rangeCells(book, cr).map((c) => (c ? String(c.v ?? '') : ''));
        } else if (cat) {
          categories = cachePoints(cat);
        }
      }
    }
  }

  const legend = kid(chartNode, NS.c, 'legend');
  return {
    sheet: sheetName,
    type: normType(typeNode?.local || ''),
    anchor: null,
    legend: !!legend && !flag(legend, 'delete'),
    labels,
    series,
    categories,
    catRef,
  };
}

function cachePoints(node) {
  const cache = find(node, NS.c, 'numCache') || find(node, NS.c, 'strCache');
  if (!cache) return [];
  const count = Number(attr(kid(cache, NS.c, 'ptCount') || { attrs: [] }, null, 'val') || 0);
  const out = new Array(count).fill('');
  for (const pt of kids(cache, NS.c, 'pt')) {
    const idx = Number(attr(pt, null, 'idx'));
    const v = kid(pt, NS.c, 'v');
    out[idx] = v ? textOf(v) : '';
  }
  return out;
}
