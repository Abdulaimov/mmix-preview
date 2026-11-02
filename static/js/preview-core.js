// Демо-копия сайта (GitHub Pages, без сервера): то, что обычно считает сервер, считаем в браузере
// по снимку каталога (preview-data.json, его собирает scripts/export-preview.js).
// Логика повторяет сервер: корзина — server/lib/orders.js (quote, deliveryQuote), подсказки поиска — /api/search/suggest,
// каталог — runCatalog в server/lib/catalog.js. Совпадение проверяет test/preview.test.js.
import { evalFilter } from './filter-core.js';
import { searchItems } from './search-core.js';

/** @param {any} v */
const toArray = (v) => (v === undefined || v === null || v === '' ? [] : Array.isArray(v) ? v : [v]);

/** Сумма из адреса («1 250,50») → дирамы; пусто — null, неверно — NaN @param {any} value */
function toMinor(value) {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value).replace(/[\s ]/g, '').replace(',', '.');
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return NaN;
  const [int, frac = ''] = s.split('.');
  return Number(int) * 100 + Number((frac + '00').slice(0, 2));
}

/** Адрес страницы демо-копии: корень сайта, язык, путь и «/» на конце (без лишней переадресации) @param {any} data @param {'ru'|'tg'} lang @param {string} path */
export const pageLink = (data, lang, path) => `${data.root}${lang === 'tg' ? '/tg' : ''}${path}/`.replace(/\/+$/, '/');

// ---------- Корзина ----------

/** Как normalizeItems на сервере: одна строка на вариант, количество складывается @param {any} items */
function normalizeItems(items) {
  /** @type {Map<number, any>} */
  const map = new Map();
  for (const it of Array.isArray(items) ? items : []) {
    const variantId = Number(it?.variantId), qty = Number(it?.qty);
    if (!Number.isInteger(variantId) || variantId <= 0 || !Number.isInteger(qty) || qty < 1 || qty > 9999) continue;
    const seen = it?.seenPriceMinor === undefined ? undefined : it.seenPriceMinor === null ? null : Number(it.seenPriceMinor);
    const prev = map.get(variantId);
    map.set(variantId, { variantId, qty: (prev?.qty || 0) + qty, seenPriceMinor: seen });
  }
  return [...map.values()];
}

/** @param {any} settings @param {string} city */
function inFreeZone(settings, city) {
  const norm = (/** @type {string} */ s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/^г\.?\s*/, '').trim();
  const zone = [settings.delivery.cities?.ru, settings.delivery.cities?.tg].flatMap((x) => String(x || '').split(',')).map(norm).filter(Boolean);
  return !zone.length || zone.includes(norm(city));
}

/** @param {any} settings @param {string} method @param {number} itemsTotal @param {boolean} hasUnpriced @param {string|null} city */
function deliveryQuote(settings, method, itemsTotal, hasUnpriced, city) {
  if (method === 'pickup') return { method, mode: 'pickup', minor: 0 };
  const d = settings.delivery;
  if (d.cost_mode === 'free') {
    if (city === null || inFreeZone(settings, city)) return { method, mode: 'free', minor: 0, zone: d.cities?.ru || '' };
    return { method, mode: 'manager', minor: null, outsideZone: true };
  }
  if (d.cost_mode === 'fixed' && d.fixed_minor != null) {
    if (d.free_from_minor != null && !hasUnpriced && itemsTotal >= d.free_from_minor) return { method, mode: 'free', minor: 0 };
    return { method, mode: 'fixed', minor: d.fixed_minor };
  }
  return { method, mode: 'manager', minor: null };
}

/**
 * Ответ как у /api/cart/quote (без кэшбэка мастеров — в демо-копии их нет).
 * @param {any} data @param {any} body — { items, lang, deliveryMethod, city }
 */
export function previewQuote(data, body) {
  const lang = body?.lang === 'tg' ? 'tg' : 'ru';
  const raw = Array.isArray(body?.items) && body.items.length ? normalizeItems(body.items) : [];
  const method = raw.length && body?.deliveryMethod === 'pickup' ? 'pickup' : 'delivery';
  const city = raw.length && typeof body?.city === 'string' ? String(body.city).replace(/\r\n/g, '\n').trim().slice(0, 80) : null;
  const lines = [], changes = [];
  let itemsTotal = 0, hasUnpriced = false, hasUnconfirmed = false;
  for (const it of raw) {
    const base = data.variants[it.variantId]?.[lang];
    if (!base) { changes.push({ variantId: it.variantId, kind: 'unavailable' }); continue; }
    const line = { ...base, qty: it.qty, lineTotalMinor: base.unitPriceMinor == null ? null : base.unitPriceMinor * it.qty };
    if (!base.availability.canBuy) changes.push({ variantId: it.variantId, kind: 'out_of_stock' });
    else if (it.qty > base.maxQty) changes.push({ variantId: it.variantId, kind: 'qty_reduced', available: base.maxQty });
    if (it.seenPriceMinor !== undefined && it.seenPriceMinor !== base.unitPriceMinor) {
      changes.push({ variantId: it.variantId, kind: 'price_changed', was: it.seenPriceMinor, now: base.unitPriceMinor });
    }
    if (base.unitPriceMinor == null) hasUnpriced = true;
    else itemsTotal += base.unitPriceMinor * it.qty;
    if (base.unitPriceMinor != null && !base.priceConfirmed) hasUnconfirmed = true;
    lines.push(line);
  }
  const delivery = deliveryQuote(data.settings, method, itemsTotal, hasUnpriced, city);
  const total = hasUnpriced || delivery.minor === null ? null : itemsTotal + delivery.minor;
  return { lines, changes, itemsTotalMinor: itemsTotal, hasUnpriced, hasUnconfirmed, delivery, totalMinor: total };
}

// ---------- Подсказки поиска ----------

/** Ответ как у /api/search/suggest @param {any} data @param {any} query @param {'ru'|'tg'} lang */
export function previewSuggest(data, query, lang) {
  const q = String(query ?? '').replace(/\r\n/g, '\n').trim().slice(0, 100);
  if (q.length < 2) return { items: [] };
  const res = searchItems(data.products, (/** @type {any} */ p) => p.doc, q);
  const cats = data.categories.filter((/** @type {any} */ c) => c.match.some((/** @type {string} */ n) => String(n || '').toLowerCase().includes(q.toLowerCase())));
  return {
    corrected: res.corrected,
    categories: cats.map((/** @type {any} */ c) => ({ name: c.name[lang], url: pageLink(data, lang, `/catalog/${c.slug}`) })),
    items: res.results.slice(0, 6).map((/** @type {any} */ p) => ({
      title: p.title[lang], subtitle: p.subtitle[lang], url: pageLink(data, lang, `/product/${p.slug}`), sku: p.sku,
      image: p.image ? `${data.root}/media/${p.image}-480.webp` : null, priceMinor: p.priceMinor,
    })),
  };
}

// ---------- Каталог: поиск, фильтры, сортировка ----------

/**
 * Как runCatalog: товары раздела (или всех), поиск, фильтры («нет данных» — отдельно), сортировка.
 * @param {any} data @param {string} slug — раздел или '' для всего каталога @param {Record<string, any>} query @param {'ru'|'tg'} lang
 * @returns {{ q: string, corrected: string|null, sort: string, matched: { id: number, unknownLabels: string[] }[], unknown: { id: number, unknownLabels: string[] }[] }}
 */
export function previewCatalog(data, slug, query, lang) {
  let items = data.products.filter((/** @type {any} */ p) => !slug || p.cat === slug);
  const filters = (data.filters[slug || '*'] || data.filters['*'])[lang];
  const q = String(query.q || '').trim().slice(0, 100);
  let corrected = null;
  /** @type {Map<any, number>|null} */
  let scores = null;
  if (q) {
    const res = searchItems(items, (/** @type {any} */ p) => p.doc, q);
    items = res.results;
    scores = res.scores;
    corrected = res.corrected;
  }
  const pmin = toMinor(query.pmin), pmax = toMinor(query.pmax);
  const packs = toArray(query.pack).map(String);
  const avail = String(query.avail || '');
  const active = filters.filter((/** @type {any} */ f) => query[f.key] !== undefined && query[f.key] !== '' && toArray(query[f.key]).length);
  const matched = [], unknown = [];
  for (const p of items) {
    const prices = p.prices.filter((/** @type {any} */ x) => x != null);
    if (Number.isFinite(pmin) && pmin !== null && !prices.some((/** @type {number} */ x) => x >= /** @type {number} */ (pmin))) continue;
    if (Number.isFinite(pmax) && pmax !== null && !prices.some((/** @type {number} */ x) => x <= /** @type {number} */ (pmax))) continue;
    if (packs.length && !p.packs[lang].some((/** @type {string} */ x) => packs.includes(x))) continue;
    if (avail === 'in_stock' && !p.states.some((/** @type {string} */ s) => s === 'in_stock' || s === 'low')) continue;
    if (avail === 'order' && !p.states.some((/** @type {string} */ s) => s === 'order')) continue;
    let fail = false;
    const unknownLabels = [];
    for (const f of active) {
      const r = evalFilter(f, p.attrs?.[f.key], query[f.key]);
      if (r === 'fail') { fail = true; break; }
      if (r === 'unknown') unknownLabels.push(f.label);
    }
    if (fail) continue;
    (unknownLabels.length ? unknown : matched).push({ p, unknownLabels });
  }
  const sort = String(query.sort || (q ? 'relevance' : 'default'));
  const minPrice = (/** @type {any} */ p) => { const xs = p.prices.filter((/** @type {any} */ x) => x != null); return xs.length ? Math.min(...xs) : null; };
  const cmpPrice = (/** @type {any} */ a, /** @type {any} */ b, dir = 1) => {
    const pa = minPrice(a.p), pb = minPrice(b.p);
    if (pa === null && pb === null) return 0;
    if (pa === null) return 1;
    if (pb === null) return -1;
    return (pa - pb) * dir;
  };
  /** @type {Record<string, (a: any, b: any) => number>} */
  const sorters = {
    default: () => 0,
    relevance: (a, b) => (scores ? (scores.get(b.p) || 0) - (scores.get(a.p) || 0) : 0),
    price_asc: (a, b) => cmpPrice(a, b, 1),
    price_desc: (a, b) => cmpPrice(a, b, -1),
    name: (a, b) => a.p.title[lang].localeCompare(b.p.title[lang], lang === 'tg' ? 'tg' : 'ru'),
    new: (a, b) => String(b.p.created_at).localeCompare(String(a.p.created_at)),
  };
  const sorter = sorters[sort] || sorters.default;
  matched.sort(sorter);
  unknown.sort(sorter);
  const out = (/** @type {any[]} */ list) => list.map((x) => ({ id: x.p.id, unknownLabels: x.unknownLabels }));
  return { q, corrected, sort, matched: out(matched), unknown: out(unknown) };
}

/** Параметры адреса как у сервера: повторяющийся ключ → массив @param {string} search */
export function parseQuery(search) {
  /** @type {Record<string, any>} */
  const q = {};
  for (const [k, v] of new URLSearchParams(search)) q[k] = k in q ? toArray(q[k]).concat(v) : v;
  return q;
}
