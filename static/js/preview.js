// Демо-копия сайта: страницы сохранены заранее, поэтому поиск, фильтры, сортировку каталога и сравнение
// применяем в браузере по снимку каталога. Подключается только в демо-копии (scripts/export-preview.js).
import { LANG, ROOT, compare } from './common.js';
import { loadPreviewData } from './preview-api.js';
import { pageLink, parseQuery, previewCatalog } from './preview-core.js';

/** @param {string} s @param {Record<string, any>} [p] */
const fmt = (s, p = {}) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (p[k] === undefined ? m : String(p[k])));
/** @param {string} tag @param {string} [cls] @param {string} [text] */
const el = (tag, cls, text) => { const x = document.createElement(tag); if (cls) x.className = cls; if (text !== undefined) x.textContent = text; return x; };

// Путь страницы без корня сайта и языка: «/mmix-preview/tg/catalog/x/» → «/catalog/x»
const path = location.pathname.slice(ROOT.length).replace(/^\/tg(?=\/|$)/, '').replace(/\/+$/, '') || '/';

const catalogMatch = /^\/catalog(?:\/([^/]+))?$/.exec(path);
const query = parseQuery(location.search);
if (catalogMatch && Object.keys(query).length) {
  const results = /** @type {HTMLElement|null} */ (document.querySelector('.results'));
  if (results) {
    results.style.visibility = 'hidden';
    loadPreviewData().then((data) => applyCatalog(data, results, catalogMatch[1] || '')).finally(() => { results.style.visibility = ''; });
  }
}
if (document.body.classList.contains('page-compare')) applyCompare();

/** @param {any} data @param {HTMLElement} results @param {string} slug */
function applyCatalog(data, results, slug) {
  const i = data.i18n[LANG];
  const r = previewCatalog(data, slug, query, LANG);
  const grid = /** @type {HTMLElement} */ (results.querySelector(':scope > .grid'));
  /** @type {Map<number, HTMLElement>} */
  const cards = new Map([...results.querySelectorAll('.card[data-product]')].map((c) => [Number(/** @type {HTMLElement} */ (c).dataset.product), /** @type {HTMLElement} */ (c)]));
  const take = (/** @type {{ id: number, unknownLabels: string[] }} */ x) => {
    const card = cards.get(x.id);
    if (!card) return null;
    card.querySelector('.card__unknown')?.remove();
    if (x.unknownLabels.length) card.querySelector('.card__meta')?.append(el('p', 'card__unknown', fmt(i.no_data_for, { list: x.unknownLabels.join(', ') })));
    return card;
  };
  grid.replaceChildren(.../** @type {HTMLElement[]} */ (r.matched.map(take).filter(Boolean)));
  grid.hidden = !r.matched.length;
  if (r.unknown.length) {
    const sec = el('section', 'unknown');
    const g = el('div', 'grid');
    g.append(.../** @type {HTMLElement[]} */ (r.unknown.map(take).filter(Boolean)));
    sec.append(el('h2', '', i.unknown_title), el('p', 'note', i.unknown_text), g);
    results.append(sec);
  }
  const count = r.matched.length + r.unknown.length;
  const counter = results.querySelector('.toolbar__count');
  if (counter) counter.textContent = fmt(i.found_n, { n: count });
  const base = pageLink(data, LANG, slug ? `/catalog/${slug}` : '/catalog');
  const activeFilters = Object.keys(query).filter((k) => k !== 'q' && k !== 'sort');
  if (!count) {
    const empty = el('div', 'empty');
    const actions = el('div', 'empty__actions');
    const all = /** @type {HTMLAnchorElement} */ (el('a', 'btn btn--secondary', i.all_products));
    all.href = pageLink(data, LANG, '/catalog');
    actions.append(all);
    empty.append(el('h2', '', i.empty_title), el('p', '', r.q ? fmt(i.empty_search, { q: r.q }) : i.empty_filters), actions);
    grid.before(empty);
  }
  // Заголовок поиска и подсказка про раскладку
  if (r.q) {
    const h1 = document.querySelector('.pagehead h1');
    if (h1) h1.textContent = fmt(i.results_for, { q: r.q });
    document.querySelector('.pagehead .lead')?.remove();
    if (r.corrected) document.querySelector('.pagehead')?.append(el('p', 'note', fmt(i.corrected, { q: r.corrected })));
  }
  // Форма фильтров и сортировка показывают то, что выбрано в адресе
  const filters = /** @type {HTMLFormElement|null} */ (document.querySelector('[data-filters]'));
  if (filters) {
    for (const input of /** @type {HTMLInputElement[]} */ ([...filters.querySelectorAll('input[name], select[name]')])) {
      const v = query[input.name];
      const vals = v === undefined ? [] : [].concat(v).map(String);
      if (input.type === 'checkbox' || input.type === 'radio') input.checked = vals.includes(input.value) || (input.type === 'radio' && !vals.length && input.value === '');
      else if (vals.length) input.value = vals[0];
    }
    for (const k of ['q', 'sort']) if (query[k] && !filters.querySelector(`input[type=hidden][name=${k}]`)) filters.prepend(Object.assign(document.createElement('input'), { type: 'hidden', name: k, value: String(query[k]) }));
    const acts = filters.querySelector('.filters__actions');
    if (activeFilters.length && acts && !acts.querySelector('a')) {
      const reset = /** @type {HTMLAnchorElement} */ (el('a', 'btn btn--ghost', i.reset));
      reset.href = r.q ? `${base}?q=${encodeURIComponent(r.q)}` : base;
      acts.append(reset);
    }
  }
  const sortForm = /** @type {HTMLFormElement|null} */ (document.querySelector('[data-sort]'));
  const sortSel = /** @type {HTMLSelectElement|null} */ (sortForm?.querySelector('select[name=sort]'));
  if (sortForm && sortSel) {
    if (r.q && ![...sortSel.options].some((o) => o.value === 'relevance')) sortSel.add(new Option(i.relevance, 'relevance'), 1);
    sortSel.value = r.sort;
    for (const [k, v] of Object.entries(query)) {
      if (k === 'sort') continue;
      for (const x of [].concat(v)) sortForm.prepend(Object.assign(document.createElement('input'), { type: 'hidden', name: k, value: String(x) }));
    }
  }
}

// Сравнение: страница сохранена со всеми товарами — оставляем выбранные (до четырёх) в их порядке
function applyCompare() {
  const fromUrl = String(new URLSearchParams(location.search).get('ids') || '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const table = /** @type {HTMLTableElement|null} */ (document.querySelector('.cmptable'));
  const empty = /** @type {HTMLElement|null} */ (document.querySelector('[data-compare-empty]'));
  if (!table) return;
  const head = /** @type {HTMLTableRowElement} */ (table.tHead?.rows[0]);
  /** @type {Map<number, number>} */
  const col = new Map([...head.cells].slice(1).map((th, idx) => [Number(/** @type {HTMLElement|null} */ (th.querySelector('[data-compare-remove]'))?.dataset.compareRemove), idx + 1]));
  const ids = [...new Set(fromUrl.length ? fromUrl : compare.ids())].filter((id) => col.has(id)).slice(0, 4);
  if (empty) empty.hidden = ids.length >= 2;
  const wrap = /** @type {HTMLElement|null} */ (table.closest('.cmptable-wrap'));
  const note = wrap?.nextElementSibling;
  if (!ids.length) {
    if (wrap) wrap.hidden = true;
    if (note instanceof HTMLElement) note.hidden = true;
    /** @type {HTMLElement|null} */ (document.querySelector('[data-compare-clear]'))?.setAttribute('hidden', '');
    return;
  }
  for (const row of [...table.rows]) {
    if (row.classList.contains('cmptable__sec')) { row.cells[0].colSpan = ids.length + 1; continue; }
    const cells = [...row.cells];
    row.replaceChildren(cells[0], ...ids.map((id) => cells[/** @type {number} */ (col.get(id))]));
  }
  // Строки, где у выбранных товаров нет данных, и пустые разделы — скрываем
  const body = table.tBodies[0];
  let section = null, sectionHasRows = false;
  for (const row of [...body.rows]) {
    if (row.classList.contains('cmptable__sec')) {
      if (section) section.hidden = !sectionHasRows;
      section = row; sectionHasRows = false;
      continue;
    }
    const filled = [...row.cells].slice(1).some((c) => !(c.children.length === 1 && c.firstElementChild?.classList.contains('muted')) && c.textContent?.trim() !== '');
    row.hidden = !filled;
    if (filled) sectionHasRows = true;
  }
  if (section) section.hidden = !sectionHasRows;
}
