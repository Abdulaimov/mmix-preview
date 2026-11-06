// Какие упаковки предложить в калькуляторе расхода и какую взять для расчёта на всю комнату.

/**
 * Разные объёмы считаем все сразу: покупатель сам выбирает, 8 вёдер по 10 кг или 16 по 5 кг; крупная упаковка — первой.
 * Варианты одного объёма (цвета затирки) — одна строка, по выбранному варианту.
 * @param {any[]} packs @param {number} selectedId @returns {any[]}
 */
export function packOptions(packs, selectedId) {
  const selected = packs.find((p) => p.id === selectedId) || packs[0];
  if (!selected) return [];
  /** @type {Map<number, any>} */
  const byAmount = new Map();
  for (const p of packs) {
    if (p.packUnit !== selected.packUnit) continue;
    if (!byAmount.has(p.amount) || p.id === selected.id) byAmount.set(p.amount, p);
  }
  return [...byAmount.values()].sort((a, b) => b.amount - a.amount);
}

/** Самая крупная упаковка товара, при равном объёме — первая по порядку @param {any[]} variants */
export function largestPack(variants) {
  return variants.reduce((best, v) => (v.amount > best.amount ? v : best), variants[0]);
}

/** Округление вверх без ошибки дробных чисел: 11,000000000000002 упаковки — это 11, а не 12 @param {number} x */
export const ceilUp = (x) => Math.ceil(x - 1e-9);

/** «мешок 25 кг», но «рулон 10 м», а не «рулон рулон 10 м» @param {{ unit: string, pack: string }} p */
export const packLabel = (p) => (String(p.pack).toLowerCase().startsWith(String(p.unit).toLowerCase()) ? p.pack : `${p.unit} ${p.pack}`);

/**
 * Сколько материала нужно, по данным товара. Ошибка — { error: поле, min, max }.
 * Иначе base — без запаса, total — с запасом, оба диапазоном [от, до] (у грунтовки расход «от и до»);
 * unit — единица, если она не от упаковки; size(p) — на сколько хватает одной упаковки.
 * @param {any} calc @param {{ area?: number, length?: number, thickness?: number, layers?: number, tile?: number, joint?: number, reserve?: number }} v
 * @returns {any}
 */
export function calcNeed(calc, v) {
  const reserve = v.reserve ?? 0;
  if (!(reserve >= 0 && reserve <= 30)) return { error: 'reserve', min: 0, max: 30 };
  const k = 1 + reserve / 100;
  const result = (/** @type {number} */ min, /** @type {number} */ max, /** @type {(p: any) => number} */ size, /** @type {string} */ unit = '') => ({
    reserve, k, unit, size, base: [min, max], extra: [min * (k - 1), max * (k - 1)], total: [min * k, max * k],
  });
  if (calc.type === 'length') {
    const len = Number(v.length);
    return len > 0 ? result(len, len, (p) => p.amount) : { error: 'length' };
  }
  const area = Number(v.area);
  if (!(area > 0)) return { error: 'area' };
  if (calc.type === 'coverage') {
    const perOne = calc.rows[Number(v.tile)]?.area[Number(v.joint)];
    return perOne > 0 ? { ...result(area, area, () => perOne, 'м²'), perOne } : { error: 'tile' };
  }
  const layersMin = calc.layers?.min ?? 1, layersMax = calc.layers?.max ?? 5;
  const layers = calc.layers ? Math.round(Number(v.layers)) : 1;
  if (!(layers >= layersMin && layers <= layersMax)) return { error: 'layers', min: layersMin, max: layersMax };
  if (calc.type === 'area_layers') {
    return { ...result(area * layers * calc.rateMin / 1000, area * layers * calc.rateMax / 1000, (p) => p.amount), area, layers };
  }
  const mm = Number(v.thickness), t = calc.thickness || {};
  if (!(mm > 0) || (t.min != null && mm < t.min) || (t.max != null && mm > t.max)) return { error: 'thickness', min: t.min ?? null, max: t.max ?? null };
  const kg = area * mm * calc.rate * layers;
  return { ...result(kg, kg, (p) => p.amount), area, layers, mm };
}

/**
 * Что покупать: по каждой упаковке — сколько штук, всего материала, что останется и сумма; выгодная помечена, если есть выбор.
 * @param {any} need @param {any[]} packs @returns {any[]}
 */
export function packRows(need, packs) {
  const rows = packs.map((p) => {
    const size = need.size(p), qty = ceilUp(need.total[1] / size), amount = qty * size;
    return { p, qty, amount, left: Math.max(0, amount - need.total[1]), sum: p.price != null && p.confirmed ? p.price * qty : null, best: false };
  });
  const sums = rows.map((r) => r.sum).filter((x) => x !== null);
  if (rows.length > 1 && sums.length === rows.length && new Set(sums).size > 1) {
    const min = Math.min(...sums);
    for (const r of rows) r.best = r.sum === min;
  }
  return rows;
}

/**
 * Какую упаковку взять на всю комнату: самую выгодную на нужное количество, без цен — самую крупную.
 * @param {any[]} variants @param {number} need @returns {any}
 */
export function cheapestPack(variants, need) {
  if (variants.some((v) => v.price_minor == null)) return largestPack(variants);
  const cost = (/** @type {any} */ v) => ceilUp(need / v.amount) * v.price_minor;
  return variants.reduce((best, v) => (cost(v) < cost(best) || (cost(v) === cost(best) && v.amount > best.amount) ? v : best), variants[0]);
}
