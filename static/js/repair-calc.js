// Калькулятор ремонта: из размеров комнаты и списка работ — какие материалы m.mix нужны и сколько упаковок.
// Только расчёт, без страницы: этот же модуль работает в браузере и проверяется тестами на сервере.
// Считаем строго по данным производителя (расход и допустимая толщина из каталога). Где данных нет —
// количество не придумываем, а говорим об этом. Подходит ли товар, решаем по свойствам из каталога:
// «нет данных» — это не «подходит».
import { ceilUp, cheapestPack, largestPack } from './calc-packs.js';

/** Готовые наборы работ */
export const PRESETS = {
  bath: { wet: true, heated: false, tile: { floor: true, walls: true }, primer: { on: true, floor: true, walls: true }, waterproof: { on: true }, tape: { on: true }, plaster: { on: false }, base: { on: false }, finish: { on: false }, grout: { on: true } },
  floor: { wet: false, heated: false, tile: { floor: true, walls: false }, primer: { on: true, floor: true, walls: false }, waterproof: { on: false }, tape: { on: false }, plaster: { on: false }, base: { on: false }, finish: { on: false }, grout: { on: true } },
  walls: { wet: false, heated: false, tile: { floor: false, walls: false }, primer: { on: true, floor: false, walls: true }, waterproof: { on: false }, tape: { on: false }, plaster: { on: false }, base: { on: true }, finish: { on: true }, grout: { on: false } },
};

// Порядок строк в списке — как идут работы на объекте
export const ROLES = /** @type {const} */ (['plaster', 'base', 'finish', 'primer', 'waterproof', 'tape', 'adhesive', 'grout']);

/** Какую работу закрывает товар — по назначению из каталога @param {any} p @returns {string|null} */
export function roleOf(p) {
  const pur = p.attrs?.purpose?.yes || [];
  if (pur.includes('tile')) return 'adhesive';
  if (pur.includes('plaster')) return 'plaster';
  if (pur.includes('base_level')) return 'base';
  if (pur.includes('finish')) return 'finish';
  if (pur.includes('priming')) return 'primer';
  if (pur.includes('grout')) return 'grout';
  if (pur.includes('seal')) return 'tape';
  if (pur.includes('waterproof')) return 'waterproof';
  return null;
}

/**
 * Подходит ли товар под одно условие: yes / no / unknown (в каталоге не сказано).
 * @param {any} p @param {'tile'|'wet'|'heated'|'interior'} cond @param {any} input
 */
export function fitOne(p, cond, input) {
  const a = p.attrs || {};
  if (cond === 'tile') return a.max_tile == null ? 'unknown' : a.max_tile >= input.tile.size ? 'yes' : 'no';
  if (cond === 'wet') return a.wet_rooms === true ? 'yes' : a.wet_rooms === false ? 'no' : 'unknown';
  if (cond === 'heated') return a.heated_floor === true ? 'yes' : a.heated_floor === false ? 'no' : 'unknown';
  if (cond === 'interior') return (a.work_area?.no || []).includes('interior') ? 'no' : (a.work_area?.yes || []).includes('interior') ? 'yes' : 'unknown';
  return 'unknown';
}

/** Какие условия проверять для работы @param {string} role @param {any} input */
export function conditionsFor(role, input) {
  /** @type {('tile'|'wet'|'heated'|'interior')[]} */
  const list = ['interior'];
  if (role === 'adhesive') list.push('tile');
  if (input.wet && role !== 'primer' && role !== 'tape') list.push('wet');
  if (role === 'adhesive' && input.heated && input.tile.floor) list.push('heated');
  return list;
}

/** Можно ли посчитать количество по данным каталога @param {any} p @param {string} role */
export const computable = (p, role) => role === 'grout' || !!p.calc;

/**
 * Кандидаты на работу: товар, итог проверки и проверка по каждому условию.
 * @param {any[]} products @param {string} role @param {any} input
 */
export function candidates(products, role, input) {
  return products.filter((p) => roleOf(p) === role).map((p) => {
    const checks = conditionsFor(role, input).map((c) => ({ cond: c, fit: fitOne(p, c, input) }));
    const fit = checks.some((c) => c.fit === 'no') ? 'no' : checks.some((c) => c.fit === 'unknown') ? 'unknown' : 'yes';
    return { p, fit, checks, computable: computable(p, role) };
  });
}

/** Площади комнаты @param {any} room */
export function areas(room) {
  const L = room.length, W = room.width, H = room.height || 0;
  const floor = L * W;
  const perimeter = 2 * (L + W);
  const walls = Math.max(0, perimeter * H - (room.openings || 0));
  return { floor, perimeter, walls };
}

const ceil = ceilUp;
const clamp = (/** @type {number} */ x, /** @type {number} */ a, /** @type {number} */ b) => Math.min(b, Math.max(a, x));
const okNum = (/** @type {any} */ x) => typeof x === 'number' && Number.isFinite(x);

/**
 * Проверка размеров. Возвращает список полей с ошибкой.
 * @param {any} input
 */
export function validate(input) {
  const bad = [];
  const r = input.room || {};
  if (!okNum(r.length) || r.length <= 0 || r.length > 100) bad.push('length');
  if (!okNum(r.width) || r.width <= 0 || r.width > 100) bad.push('width');
  if (!okNum(r.height) || r.height < 0 || r.height > 10) bad.push('height');
  if (!okNum(r.openings) || r.openings < 0 || r.openings > 200) bad.push('openings');
  return bad;
}

/**
 * Полный расчёт.
 * @param {any} input — размеры, условия, работы (см. PRESETS и страницу калькулятора)
 * @param {any[]} products — товары с attrs, calc и вариантами { id, amount, packUnit, … }
 */
export function plan(input, products) {
  const errors = validate(input);
  if (errors.length) return { errors, lines: [], notes: [], areas: null };
  const A = areas(input.room);
  const k = 1 + clamp(Number(input.reserve) || 0, 0, 30) / 100;
  const overlap = clamp(Number(input.waterproof?.overlapCm) || 0, 0, 300) / 100;
  /** @type {any[]} */
  const lines = [];
  /** @type {any[]} */
  const notes = [];

  // Площадь под каждую работу
  /** @type {Record<string, number>} */
  const area = {
    plaster: input.plaster?.on ? A.walls : 0,
    base: input.base?.on ? A.walls : 0,
    finish: input.finish?.on ? A.walls : 0,
    primer: input.primer?.on ? (input.primer.floor ? A.floor : 0) + (input.primer.walls ? A.walls : 0) : 0,
    waterproof: input.waterproof?.on ? A.floor + A.perimeter * overlap + clamp(Number(input.waterproof.showerM2) || 0, 0, 200) : 0,
    tape: input.waterproof?.on && input.tape?.on ? 1 : 0,
    adhesive: (input.tile?.floor ? A.floor : 0) + (input.tile?.walls ? A.walls : 0),
    grout: input.grout?.on && (input.tile?.floor || input.tile?.walls) ? 1 : 0,
  };
  if (input.tape?.on && !input.waterproof?.on) notes.push({ role: 'tape', code: 'needs_waterproof' });
  if (input.grout?.on && !(input.tile?.floor || input.tile?.walls)) notes.push({ role: 'grout', code: 'needs_tile' });

  for (const role of ROLES) {
    if (!(area[role] > 0)) continue;
    const opts = input[role === 'adhesive' ? 'tile' : role] || {};
    const cands = candidates(products, role, input);
    const usable = cands.filter((c) => c.fit !== 'no' && c.computable);
    const chosen = usable.find((c) => c.p.id === Number(opts.productId)) || usable.find((c) => c.fit === 'yes');
    // Подходящие по условиям, но без данных расхода (например, C0) — упоминаем, но не считаем
    const noCalc = cands.filter((c) => c.fit === 'yes' && !c.computable).map((c) => c.p.id);
    if (!chosen) {
      notes.push({ role, code: usable.length ? 'no_confirmed' : 'no_product', unknown: usable.map((c) => c.p.id) });
      continue;
    }
    const p = chosen.p;
    const variant = (role === 'grout' && p.variants.find((/** @type {any} */ v) => v.id === Number(opts.variantId))) || largestPack(p.variants);
    /** @type {any} */
    const line = { role, productId: p.id, variantId: variant.id, fit: chosen.fit, checks: chosen.checks, options: usable.map((c) => ({ id: c.p.id, fit: c.fit })), noCalc, qty: null, formula: null, error: null };
    const calc = p.calc;

    if (role === 'grout') {
      // Расход затирки зависит от размера плитки и ширины шва (таблица — на странице затирки): количество задаёт покупатель, по умолчанию — ничего
      line.qty = clamp(Math.floor(Number(opts.qty) || 0), 0, 999);
      line.manual = true;
    } else if (role === 'tape') {
      const len = A.perimeter + 4 * overlap;
      if (variant.packUnit !== 'м') line.error = { code: 'pack_unit' };
      else {
        const need = len * k;
        line.qty = ceil(need / variant.amount);
        line.formula = { kind: 'length', len, perimeter: A.perimeter, overlap, k, need, unit: 'м', pack: variant.amount };
      }
    } else if (calc?.type === 'area_layers') {
      const layers = Math.round(Number(opts.layers) || calc.layers?.min || 1);
      if (calc.layers && (layers < calc.layers.min || layers > calc.layers.max)) line.error = { code: 'layers', min: calc.layers.min, max: calc.layers.max };
      else if (variant.packUnit !== 'л') line.error = { code: 'pack_unit' };
      else {
        const a = area[role];
        const min = a * layers * calc.rateMin / 1000 * k, max = a * layers * calc.rateMax / 1000 * k;
        line.qtyMin = ceil(min / variant.amount);
        line.qty = ceil(max / variant.amount);
        line.formula = { kind: 'layers', area: a, layers, rateMin: calc.rateMin, rateMax: calc.rateMax, k, min, max, unit: 'л', pack: variant.amount };
      }
    } else if (calc?.type === 'area_thickness') {
      const layers = role === 'waterproof' ? Math.round(Number(opts.layers) || 1) : 1;
      const mm = Number(role === 'waterproof' ? opts.layerMm : opts.mm);
      const t = calc.thickness || {};
      if (!(mm > 0) || (t.min != null && mm < t.min) || (t.max != null && mm > t.max)) line.error = { code: 'thickness', min: t.min ?? null, max: t.max ?? null };
      else if (role === 'waterproof' && (layers < 1 || layers > 5)) line.error = { code: 'layers', min: 1, max: 5 };
      else if (variant.packUnit !== 'кг') line.error = { code: 'pack_unit' };
      else {
        const a = area[role];
        const need = a * mm * calc.rate * layers * k;
        // Несколько фасовок (гидроизоляция 5 и 10 кг): на нужное количество берём самую выгодную
        const pack = cheapestPack(p.variants, need);
        line.variantId = pack.id;
        line.qty = ceil(need / pack.amount);
        line.formula = { kind: 'thickness', area: a, mm, rate: calc.rate, layers, k, need, unit: 'кг', pack: pack.amount };
      }
    } else {
      line.error = { code: 'no_calc' };
    }
    lines.push(line);
  }
  return { errors, lines, notes, areas: A, k };
}

/**
 * Итог по ценам: сумма строк с ценой; строки без цены считаются отдельно.
 * @param {any[]} lines @param {any[]} products
 */
export function totals(lines, products) {
  let sum = 0, unpriced = 0, unconfirmed = false, items = 0;
  for (const l of lines) {
    if (!(l.qty > 0)) continue;
    const v = products.find((p) => p.id === l.productId)?.variants.find((/** @type {any} */ x) => x.id === l.variantId);
    items++;
    if (v?.price_minor == null) { unpriced++; continue; }
    sum += v.price_minor * l.qty;
    if (!v.price_confirmed) unconfirmed = true;
  }
  return { sum, unpriced, unconfirmed, items };
}
