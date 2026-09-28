// Формулы электронной таблицы для практикума: разбор и вычисление.
// Поддерживаются русские и английские имена функций, разделители «;» и «,»,
// диапазоны A2:D31, условия вида ">200", "<>С", "Ю*", как в Calc и Excel.

export class FormulaError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // то, что увидит ученик в ячейке: #ИМЯ?, #ДЕЛ/0!, #ЗНАЧ!, Err:…
  }
}

// ---------- Лексер ----------

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      let s = '';
      for (;;) {
        if (j >= src.length) throw new FormulaError('Err:501', 'Не закрыта кавычка в текстовом значении.');
        if (src[j] === '"') {
          if (src[j + 1] === '"') {
            s += '"';
            j += 2;
            continue;
          }
          break;
        }
        s += src[j++];
      }
      tokens.push({ t: 'str', v: s });
      i = j + 1;
      continue;
    }
    // Ссылка или диапазон: A1, $A$1, A1:B10
    let m = /^\$?[A-Za-z]{1,2}\$?\d+(?::\$?[A-Za-z]{1,2}\$?\d+)?/.exec(src.slice(i));
    if (m && !/^[\p{L}\d_.]/u.test(src.slice(i + m[0].length))) {
      tokens.push({ t: 'ref', v: m[0].toUpperCase() });
      i += m[0].length;
      continue;
    }
    m = /^\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?/.exec(src.slice(i));
    if (m) {
      // запятая — десятичный разделитель, только если за ней цифра и это не список аргументов «1,2»
      tokens.push({ t: 'num', v: Number(m[0].replace(',', '.')), raw: m[0] });
      i += m[0].length;
      continue;
    }
    m = /^[\p{L}_][\p{L}\d_.]*/u.exec(src.slice(i));
    if (m) {
      tokens.push({ t: 'name', v: m[0].toUpperCase().replace(/Ё/g, 'Е') });
      i += m[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '<>') {
      tokens.push({ t: 'op', v: two });
      i += 2;
      continue;
    }
    if ('+-*/^&=<>();,:%'.includes(ch)) {
      tokens.push({ t: 'op', v: ch });
      i++;
      continue;
    }
    throw new FormulaError('Err:501', `Недопустимый символ «${ch}» в формуле.`);
  }
  return tokens;
}

// ---------- Парсер (рекурсивный спуск) ----------
// сравнение < & (сцепка) < +,- < *,/ < ^ < унарный минус < процент

export function parseFormula(text) {
  let src = text.trim();
  if (src.startsWith('=')) src = src.slice(1);
  // «1,5» внутри аргументов неоднозначно; в русских программах аргументы делятся «;»,
  // поэтому если в формуле есть «;», запятая считается десятичной, иначе — разделителем.
  const semi = src.includes(';');
  let tokens = tokenize(src);
  if (!semi) {
    tokens = tokens.flatMap((tk) => {
      if (tk.t === 'num' && tk.raw.includes(',')) {
        const [a, b] = tk.raw.split(',');
        return [{ t: 'num', v: Number(a) }, { t: 'op', v: ',' }, { t: 'num', v: Number(b) }];
      }
      return [tk];
    });
  }
  let p = 0;
  const peek = () => tokens[p];
  const isOp = (v) => peek() && peek().t === 'op' && peek().v === v;
  const expect = (v) => {
    if (!isOp(v)) throw new FormulaError('Err:501', v === ')' ? 'Не хватает закрывающей скобки.' : `Ожидался символ «${v}».`);
    p++;
  };

  function comparison() {
    let left = concat();
    while (peek() && peek().t === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes(peek().v)) {
      const op = tokens[p++].v;
      left = { k: 'bin', op, a: left, b: concat() };
    }
    return left;
  }
  function concat() {
    let left = additive();
    while (isOp('&')) {
      p++;
      left = { k: 'bin', op: '&', a: left, b: additive() };
    }
    return left;
  }
  function additive() {
    let left = mult();
    while (isOp('+') || isOp('-')) {
      const op = tokens[p++].v;
      left = { k: 'bin', op, a: left, b: mult() };
    }
    return left;
  }
  function mult() {
    let left = power();
    while (isOp('*') || isOp('/')) {
      const op = tokens[p++].v;
      left = { k: 'bin', op, a: left, b: power() };
    }
    return left;
  }
  function power() {
    let left = unary();
    while (isOp('^')) {
      p++;
      left = { k: 'bin', op: '^', a: left, b: unary() };
    }
    return left;
  }
  function unary() {
    if (isOp('-')) {
      p++;
      return { k: 'neg', a: unary() };
    }
    if (isOp('+')) {
      p++;
      return unary();
    }
    let node = primary();
    while (isOp('%')) {
      p++;
      node = { k: 'bin', op: '/', a: node, b: { k: 'num', v: 100 } };
    }
    return node;
  }
  function primary() {
    const tk = peek();
    if (!tk) throw new FormulaError('Err:501', 'Формула обрывается — не хватает значения.');
    if (tk.t === 'num') {
      p++;
      return { k: 'num', v: tk.v };
    }
    if (tk.t === 'str') {
      p++;
      return { k: 'str', v: tk.v };
    }
    if (tk.t === 'ref') {
      p++;
      const [a, b] = tk.v.replace(/\$/g, '').split(':');
      return b ? { k: 'range', a: parseRef(a), b: parseRef(b), text: tk.v } : { k: 'ref', ...parseRef(a), text: tk.v };
    }
    if (tk.t === 'name') {
      p++;
      if (isOp('(')) {
        p++;
        const args = [];
        if (!isOp(')')) {
          for (;;) {
            if (isOp(';') || isOp(',') || isOp(')')) args.push({ k: 'empty' });
            else args.push(comparison());
            if (isOp(';') || isOp(',')) {
              p++;
              continue;
            }
            break;
          }
        }
        expect(')');
        return { k: 'call', name: tk.v, args };
      }
      if (tk.v === 'ИСТИНА' || tk.v === 'TRUE') return { k: 'bool', v: true };
      if (tk.v === 'ЛОЖЬ' || tk.v === 'FALSE') return { k: 'bool', v: false };
      throw new FormulaError('#ИМЯ?', `Неизвестное имя «${tk.v}». Возможно, пропущены кавычки вокруг текста или скобки после имени функции.`);
    }
    if (isOp('(')) {
      p++;
      const e = comparison();
      expect(')');
      return e;
    }
    throw new FormulaError('Err:501', `Лишний символ «${tk.v}».`);
  }

  if (!tokens.length) throw new FormulaError('Err:501', 'Пустая формула.');
  const tree = comparison();
  if (p < tokens.length) {
    const tk = tokens[p];
    if (tk.t === 'op' && tk.v === ')') throw new FormulaError('Err:501', 'Лишняя закрывающая скобка.');
    if (tk.t === 'op' && (tk.v === ';' || tk.v === ',')) throw new FormulaError('Err:501', 'Разделитель аргументов вне скобок функции.');
    throw new FormulaError('Err:501', `Не удалось разобрать формулу около «${tk.v}».`);
  }
  return tree;
}

function parseRef(s) {
  const m = /^([A-Z]{1,2})(\d+)$/.exec(s);
  let col = 0;
  for (const ch of m[1]) col = col * 26 + ch.charCodeAt(0) - 64;
  return { row: Number(m[2]) - 1, col: col - 1 };
}

// ---------- Вычисление ----------

// sheet: { get(row, col) → число | строка | логическое | null }
// Результат: число, строка, логическое или объект ошибки { error: код, message }

const isRange = (x) => x && x.k === 'rangeValue';

function rangeValues(r) {
  return r.values;
}

function toNum(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === null || v === '') return 0;
  if (typeof v === 'string') {
    const s = v.trim().replace(',', '.');
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  }
  throw new FormulaError('#ЗНАЧ!', `Нельзя выполнить арифметику с текстом «${v}».`);
}

function toBool(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (v === null || v === '') return false;
  throw new FormulaError('#ЗНАЧ!', `«${v}» — не логическое значение.`);
}

const norm = (s) => String(s).toLowerCase().replace(/ё/g, 'е');

function compare(a, b) {
  // Как в электронных таблицах: числа < текст < логические
  const rank = (x) => (typeof x === 'number' || x === null ? 0 : typeof x === 'string' ? 1 : 2);
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 0) return (a ?? 0) - (b ?? 0);
  if (ra === 1) return norm(a) < norm(b) ? -1 : norm(a) > norm(b) ? 1 : 0;
  return Number(a) - Number(b);
}

// Условие СЧЁТЕСЛИ: ">200", "<>С", "Ю*", 8, ИСТИНА
export function makeCriterion(crit) {
  if (typeof crit === 'number' || typeof crit === 'boolean') {
    return (v) => (typeof crit === 'boolean' ? v === crit : typeof v === 'number' ? v === crit : typeof v === 'string' && Number(v.replace(',', '.')) === crit && v.trim() !== '');
  }
  const s = String(crit ?? '');
  const m = /^(<=|>=|<>|<|>|=)?(.*)$/s.exec(s);
  const op = m[1] || '=';
  const raw = m[2];
  const numStr = raw.trim().replace(',', '.');
  const isNum = /^-?\d+(\.\d+)?$/.test(numStr);
  const target = isNum ? Number(numStr) : raw;
  const boolTarget = /^(истина|true)$/i.test(raw) ? true : /^(ложь|false)$/i.test(raw) ? false : null;

  if (op === '=' || op === '<>') {
    let test;
    if (boolTarget !== null) test = (v) => v === boolTarget;
    else if (isNum) test = (v) => typeof v === 'number' && v === target;
    else if (raw === '') test = (v) => v === null || v === '';
    else if (/[*?]/.test(raw)) {
      const re = new RegExp('^' + norm(raw).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/~\*/g, '\u0001').replace(/\*/g, '.*').replace(/\?/g, '.').replace(/\u0001/g, '\\*') + '$', 's');
      test = (v) => typeof v === 'string' && re.test(norm(v));
    } else test = (v) => typeof v === 'string' && norm(v) === norm(raw);
    return op === '=' ? test : (v) => !test(v);
  }
  return (v) => {
    if (isNum) {
      if (typeof v !== 'number') return false;
    } else if (typeof v !== 'string') return false;
    const c = compare(v, target);
    return op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0;
  };
}

const FUNCS = {};
const alias = (names, fn) => names.forEach((n) => (FUNCS[n] = fn));

function flatNums(args) {
  const out = [];
  for (const a of args) {
    if (isRange(a)) for (const v of rangeValues(a)) {
      if (typeof v === 'number') out.push(v);
    }
    else if (a !== null && a !== undefined) out.push(toNum(a));
  }
  return out;
}

function needRange(a, fname, n) {
  if (!isRange(a)) throw new FormulaError('#ЗНАЧ!', `В функции ${fname} аргумент ${n} должен быть диапазоном ячеек, например C2:C31.`);
  return a;
}

function sameSize(a, b, fname) {
  if (a.values.length !== b.values.length) {
    throw new FormulaError('#ЗНАЧ!', `В функции ${fname} диапазоны разного размера (${a.text} и ${b.text}). Диапазоны должны охватывать одни и те же строки.`);
  }
}

function argCount(args, min, max, fname) {
  if (args.length < min || args.length > max) {
    const want = min === max ? `${min}` : max === Infinity ? `не менее ${min}` : `от ${min} до ${max}`;
    throw new FormulaError('Err:511', `У функции ${fname} должно быть ${want} аргумента(ов), а указано ${args.length}.`);
  }
}

alias(['СУММ', 'SUM'], (args) => flatNums(args).reduce((s, x) => s + x, 0));
alias(['СРЗНАЧ', 'AVERAGE'], (args) => {
  const xs = flatNums(args);
  if (!xs.length) throw new FormulaError('#ДЕЛ/0!', 'Нет чисел для вычисления среднего.');
  return xs.reduce((s, x) => s + x, 0) / xs.length;
});
alias(['СЧЁТ', 'СЧЕТ', 'COUNT'], (args) => flatNums(args).length);
alias(['СЧЁТЗ', 'СЧЕТЗ', 'COUNTA'], (args) => args.reduce((s, a) => s + (isRange(a) ? a.values.filter((v) => v !== null && v !== '').length : 1), 0));
alias(['МАКС', 'MAX'], (args) => {
  const xs = flatNums(args);
  return xs.length ? Math.max(...xs) : 0;
});
alias(['МИН', 'MIN'], (args) => {
  const xs = flatNums(args);
  return xs.length ? Math.min(...xs) : 0;
});
alias(['ОКРУГЛ', 'ROUND'], (args, f) => {
  argCount(args, 2, 2, f);
  const k = 10 ** toNum(args[1]);
  return Math.round(toNum(args[0]) * k) / k;
});
alias(['ABS'], (args) => Math.abs(toNum(args[0])));
alias(['И', 'AND'], (args) => args.every((a) => (isRange(a) ? a.values.every((v) => v === null || toBool(v)) : toBool(a))));
alias(['ИЛИ', 'OR'], (args) => args.some((a) => (isRange(a) ? a.values.some((v) => v !== null && toBool(v)) : toBool(a))));
alias(['НЕ', 'NOT'], (args, f) => {
  argCount(args, 1, 1, f);
  return !toBool(args[0]);
});

alias(['СЧЁТЕСЛИ', 'СЧЕТЕСЛИ', 'COUNTIF'], (args, f) => {
  argCount(args, 2, 2, f);
  const r = needRange(args[0], f, 1);
  const test = makeCriterion(args[1]);
  return r.values.filter(test).length;
});
alias(['СУММЕСЛИ', 'SUMIF'], (args, f) => {
  argCount(args, 2, 3, f);
  const r = needRange(args[0], f, 1);
  const s = args[2] === undefined ? r : needRange(args[2], f, 3);
  sameSize(r, s, f);
  const test = makeCriterion(args[1]);
  return r.values.reduce((acc, v, i) => acc + (test(v) && typeof s.values[i] === 'number' ? s.values[i] : 0), 0);
});
alias(['СРЗНАЧЕСЛИ', 'AVERAGEIF'], (args, f) => {
  argCount(args, 2, 3, f);
  const r = needRange(args[0], f, 1);
  const s = args[2] === undefined ? r : needRange(args[2], f, 3);
  sameSize(r, s, f);
  const test = makeCriterion(args[1]);
  const xs = r.values.flatMap((v, i) => (test(v) && typeof s.values[i] === 'number' ? [s.values[i]] : []));
  if (!xs.length) throw new FormulaError('#ДЕЛ/0!', 'Ни одна строка не подходит под условие, поэтому среднее вычислить нельзя. Проверьте текст условия.');
  return xs.reduce((a, b) => a + b, 0) / xs.length;
});

function multiTest(pairs, f, base) {
  if (pairs.length % 2) throw new FormulaError('Err:511', `У функции ${f} условия задаются парами «диапазон; условие».`);
  const tests = [];
  for (let i = 0; i < pairs.length; i += 2) {
    const r = needRange(pairs[i], f, i + 1 + (base ? 1 : 0));
    if (base) sameSize(base, r, f);
    else if (tests.length) sameSize(tests[0].r, r, f);
    tests.push({ r, test: makeCriterion(pairs[i + 1]) });
  }
  return (i) => tests.every((t) => t.test(t.r.values[i]));
}

alias(['СЧЁТЕСЛИМН', 'СЧЕТЕСЛИМН', 'COUNTIFS'], (args, f) => {
  argCount(args, 2, Infinity, f);
  const ok = multiTest(args, f, null);
  return args[0].values.reduce((acc, _, i) => acc + (ok(i) ? 1 : 0), 0);
});
alias(['СУММЕСЛИМН', 'SUMIFS'], (args, f) => {
  argCount(args, 3, Infinity, f);
  const s = needRange(args[0], f, 1);
  const ok = multiTest(args.slice(1), f, s);
  return s.values.reduce((acc, v, i) => acc + (ok(i) && typeof v === 'number' ? v : 0), 0);
});
alias(['СРЗНАЧЕСЛИМН', 'AVERAGEIFS'], (args, f) => {
  argCount(args, 3, Infinity, f);
  const s = needRange(args[0], f, 1);
  const ok = multiTest(args.slice(1), f, s);
  const xs = s.values.filter((v, i) => ok(i) && typeof v === 'number');
  if (!xs.length) throw new FormulaError('#ДЕЛ/0!', 'Ни одна строка не подходит под все условия, поэтому среднее вычислить нельзя.');
  return xs.reduce((a, b) => a + b, 0) / xs.length;
});
alias(['МАКСЕСЛИ', 'MAXIFS'], (args, f) => {
  argCount(args, 3, Infinity, f);
  const s = needRange(args[0], f, 1);
  const ok = multiTest(args.slice(1), f, s);
  const xs = s.values.filter((v, i) => ok(i) && typeof v === 'number');
  return xs.length ? Math.max(...xs) : 0;
});
alias(['МИНЕСЛИ', 'MINIFS'], (args, f) => {
  argCount(args, 3, Infinity, f);
  const s = needRange(args[0], f, 1);
  const ok = multiTest(args.slice(1), f, s);
  const xs = s.values.filter((v, i) => ok(i) && typeof v === 'number');
  return xs.length ? Math.min(...xs) : 0;
});

const LAZY = {
  ЕСЛИ: 'if', IF: 'if',
};

// Функции, которые на ОГЭ по-русски называются иначе — подсказка при опечатке
const NEAR = {
  СЧЕТЕСЛИМ: 'СЧЁТЕСЛИМН', СЧЁТЕСЛИМ: 'СЧЁТЕСЛИМН', СРЕДНЕЕ: 'СРЗНАЧ', СРЗНАЧЕНИЕ: 'СРЗНАЧ', СУММА: 'СУММ', СЧЕТЕСЛ: 'СЧЁТЕСЛИ', КОЛИЧЕСТВО: 'СЧЁТ',
};

export function evaluate(tree, sheet, ctx = { depth: 0 }) {
  const ev = (n) => evaluate(n, sheet, ctx);
  switch (tree.k) {
    case 'num':
    case 'str':
    case 'bool':
      return tree.v;
    case 'empty':
      return null;
    case 'ref':
      return sheet.get(tree.row, tree.col);
    case 'range': {
      const r1 = Math.min(tree.a.row, tree.b.row);
      const r2 = Math.max(tree.a.row, tree.b.row);
      const c1 = Math.min(tree.a.col, tree.b.col);
      const c2 = Math.max(tree.a.col, tree.b.col);
      const values = [];
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) values.push(sheet.get(r, c));
      return { k: 'rangeValue', values, text: tree.text };
    }
    case 'neg':
      return -toNum(scalar(ev(tree.a)));
    case 'bin': {
      const a = scalar(ev(tree.a));
      const b = scalar(ev(tree.b));
      switch (tree.op) {
        case '+': return toNum(a) + toNum(b);
        case '-': return toNum(a) - toNum(b);
        case '*': return toNum(a) * toNum(b);
        case '/': {
          const d = toNum(b);
          if (d === 0) throw new FormulaError('#ДЕЛ/0!', 'Деление на ноль.');
          return toNum(a) / d;
        }
        case '^': return toNum(a) ** toNum(b);
        case '&': return str(a) + str(b);
        default: {
          const c = compare(a === null ? (typeof b === 'string' ? '' : 0) : a, b === null ? (typeof a === 'string' ? '' : 0) : b);
          return { '=': c === 0, '<>': c !== 0, '<': c < 0, '>': c > 0, '<=': c <= 0, '>=': c >= 0 }[tree.op];
        }
      }
    }
    case 'call': {
      const name = tree.name;
      if (LAZY[name] === 'if') {
        if (tree.args.length < 2 || tree.args.length > 3) throw new FormulaError('Err:511', 'У функции ЕСЛИ должно быть 2 или 3 аргумента: ЕСЛИ(условие; значение_если_истина; значение_если_ложь).');
        const cond = toBool(scalar(ev(tree.args[0])));
        if (cond) return scalar(ev(tree.args[1]));
        return tree.args[2] ? scalar(ev(tree.args[2])) : false;
      }
      const fn = FUNCS[name];
      if (!fn) {
        const near = NEAR[name];
        throw new FormulaError('#ИМЯ?', near ? `Нет функции ${name}. Возможно, имелась в виду ${near}.` : `Неизвестная функция ${name}.`);
      }
      return fn(tree.args.map((a) => (a.k === 'empty' ? null : ev(a))), name);
    }
    default:
      throw new FormulaError('Err:501', 'Не удалось вычислить формулу.');
  }
}

function scalar(v) {
  if (isRange(v)) {
    if (v.values.length === 1) return v.values[0];
    throw new FormulaError('#ЗНАЧ!', `Диапазон ${v.text} нельзя использовать как одно значение. Возможно, нужна функция, например СУММ(${v.text}).`);
  }
  return v;
}

function str(v) {
  if (v === null) return '';
  if (typeof v === 'boolean') return v ? 'ИСТИНА' : 'ЛОЖЬ';
  return String(v);
}

// Ссылки формулы на ячейки (для зависимостей)
export function refsOf(tree, out = []) {
  if (!tree) return out;
  if (tree.k === 'ref') out.push({ r1: tree.row, c1: tree.col, r2: tree.row, c2: tree.col });
  else if (tree.k === 'range') out.push({ r1: Math.min(tree.a.row, tree.b.row), c1: Math.min(tree.a.col, tree.b.col), r2: Math.max(tree.a.row, tree.b.row), c2: Math.max(tree.a.col, tree.b.col) });
  for (const k of ['a', 'b']) if (tree[k] && tree[k].k) refsOf(tree[k], out);
  if (tree.args) tree.args.forEach((a) => refsOf(a, out));
  return out;
}

// Сдвиг относительных ссылок при копировании формулы (протягивании)
export function shiftFormula(text, dRow, dCol) {
  let inStr = false;
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      inStr = !inStr;
      out += ch;
      i++;
      continue;
    }
    if (!inStr) {
      const m = /^(\$?)([A-Za-z]{1,2})(\$?)(\d+)/.exec(text.slice(i));
      const prev = out[out.length - 1];
      if (m && !(prev && /[\p{L}\d_]/u.test(prev)) && !/^[\p{L}\d_(]/u.test(text.slice(i + m[0].length))) {
        let col = 0;
        for (const c of m[2].toUpperCase()) col = col * 26 + c.charCodeAt(0) - 64;
        col -= 1;
        let row = Number(m[4]) - 1;
        if (!m[1]) col += dCol;
        if (!m[3]) row += dRow;
        if (col < 0 || row < 0) return null;
        let letters = '';
        for (let c = col + 1; c > 0; c = Math.floor((c - 1) / 26)) letters = String.fromCharCode(65 + ((c - 1) % 26)) + letters;
        out += `${m[1]}${letters}${m[3]}${row + 1}`;
        i += m[0].length;
        continue;
      }
    }
    out += ch;
    i++;
  }
  return out;
}
