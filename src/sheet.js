// Маленькая электронная таблица для практикума: исходные данные только для чтения,
// в свободных ячейках можно писать числа, текст и формулы.

import { parseFormula, evaluate, FormulaError } from './formula.js';

const key = (r, c) => r * 1000 + c;

export class PracticeSheet {
  constructor(header, rows) {
    this.header = header;
    this.rows = rows;
    this.dataCols = header.length;
    this.inputs = new Map(); // key → исходный текст, который ввёл ученик
    this.cache = new Map();
    this.computing = new Set();
  }

  isLocked(r, c) {
    return (r === 0 || r <= this.rows.length) && c < this.dataCols;
  }

  raw(r, c) {
    if (r === 0 && c < this.dataCols) return this.header[c];
    if (r >= 1 && r <= this.rows.length && c < this.dataCols) return this.rows[r - 1][c];
    return this.inputs.get(key(r, c)) ?? '';
  }

  set(r, c, text) {
    if (this.isLocked(r, c)) return false;
    const t = String(text ?? '');
    if (t.trim() === '') this.inputs.delete(key(r, c));
    else this.inputs.set(key(r, c), t);
    this.cache.clear();
    return true;
  }

  clear() {
    this.inputs.clear();
    this.cache.clear();
  }

  // Значение ячейки: число, строка, логическое или null. Ошибку формулы выбрасывает.
  get(r, c) {
    const res = this.result(r, c);
    if (res.error) throw new FormulaError(res.error, res.message);
    return res.value;
  }

  // { value } или { error, message }
  result(r, c) {
    const k = key(r, c);
    if (this.cache.has(k)) return this.cache.get(k);
    const raw = this.raw(r, c);
    let res;
    if (typeof raw === 'number') res = { value: raw };
    else if (this.isLocked(r, c)) res = { value: raw === '' ? null : raw };
    else res = this.compute(k, raw);
    this.cache.set(k, res);
    return res;
  }

  compute(k, raw) {
    const t = raw.trim();
    if (t === '') return { value: null };
    if (!t.startsWith('=')) {
      const n = t.replace(',', '.');
      if (/^-?\d+(\.\d+)?$/.test(n)) return { value: Number(n) };
      if (/^(истина|true)$/i.test(t)) return { value: true };
      if (/^(ложь|false)$/i.test(t)) return { value: false };
      return { value: raw };
    }
    if (this.computing.has(k)) return { error: 'Err:522', message: 'Циклическая ссылка: формула прямо или через другие ячейки ссылается сама на себя.' };
    this.computing.add(k);
    try {
      return { value: this.evalText(t) };
    } catch (e) {
      return errorResult(e);
    } finally {
      this.computing.delete(k);
    }
  }

  evalText(text) {
    const tree = parseFormula(text);
    let v = evaluate(tree, this);
    if (v && v.k === 'rangeValue') {
      if (v.values.length === 1) v = v.values[0];
      else throw new FormulaError('#ЗНАЧ!', `Формула возвращает целый диапазон ${v.text}, а в ячейку нужно одно значение.`);
    }
    if (typeof v === 'number' && !Number.isFinite(v)) throw new FormulaError('#ЧИСЛО!', 'Результат не является конечным числом.');
    return v;
  }

  // Вычислить формулу, не записывая её в таблицу (ответ на вопрос)
  evaluateAnswer(text) {
    try {
      const t = text.trim();
      if (!t.startsWith('=')) {
        const n = t.replace(',', '.').replace(/\s/g, '');
        if (/^-?\d+(\.\d+)?%?$/.test(n)) return { value: n.endsWith('%') ? Number(n.slice(0, -1)) : Number(n), typed: true };
        return { error: 'текст', message: 'Ответ должен быть числом или формулой, начинающейся со знака =.' };
      }
      return { value: this.evalText(t) };
    } catch (e) {
      return errorResult(e);
    }
  }
}

function errorResult(e) {
  if (e instanceof FormulaError) return { error: e.code, message: e.message };
  console.error(e);
  return { error: 'Err:501', message: 'Не удалось вычислить формулу.' };
}
