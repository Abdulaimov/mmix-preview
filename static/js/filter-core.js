// Проверка товара по фильтру каталога. Общая для сервера и демо-копии сайта в браузере:
// «нет данных» (unknown) — это не «не подходит» (fail), такие товары показываются отдельным блоком.

/** @param {any} v */
const toArray = (v) => (v === undefined || v === null || v === '' ? [] : Array.isArray(v) ? v : [v]);

/**
 * Совпадает ли товар с выбранным значением фильтра.
 * @param {any} filter — { type, exhaustive } @param {any} value — свойство товара @param {any} selected — выбранное в фильтре
 * @returns {'match'|'unknown'|'fail'}
 */
export function evalFilter(filter, value, selected) {
  if (filter.type === 'bool') {
    if (value === true) return 'match';
    if (value === false) return 'fail';
    return 'unknown';
  }
  if (filter.type === 'capacity') {
    if (typeof value !== 'number') return 'unknown';
    return value >= Number(selected) ? 'match' : 'fail';
  }
  if (filter.type === 'range_fit') {
    if (!value || (value.min == null && value.max == null)) return 'unknown';
    const x = Number(selected);
    if (value.min != null && x < value.min) return 'fail';
    if (value.max != null && x > value.max) return 'fail';
    return 'match';
  }
  // enum: выбранные варианты через «или»
  const sel = toArray(selected);
  if (value === undefined || value === null) return 'unknown';
  if (typeof value === 'string') return sel.includes(value) ? 'match' : 'fail';
  const yes = value.yes || [], no = value.no || [];
  if (sel.some((s) => yes.includes(s))) return 'match';
  if (sel.every((s) => no.includes(s))) return 'fail';
  if (filter.exhaustive && yes.length) return 'fail';
  return 'unknown';
}
