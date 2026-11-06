// Сравнение товаров: сразу видно только то, чем товары отличаются, остальное — по кнопке «Все характеристики».

/**
 * Какие строки показать сразу. values: значение у каждого товара, null — нет данных.
 * Параметры подбора — если значения разные и данные есть хотя бы у половины товаров.
 * Главное — только то, что есть у всех выбранных товаров: строка из прочерков ничего не объясняет.
 * @param {{ kind: string, label: string, values: (string|null)[] }[]} rows @returns {boolean[]}
 */
export function simpleRows(rows) {
  const params = new Set(rows.filter((r) => r.kind === 'param').map((r) => r.label));
  return rows.map((r) => {
    const known = r.values.filter((x) => x !== null).length;
    const differs = new Set(r.values).size > 1;
    if (r.kind === 'param') return differs && known * 2 >= r.values.length;
    if (r.kind === 'key') return differs && known === r.values.length && !params.has(r.label);
    return false;
  });
}

/** Значение ячейки; прочерк и «нет данных» — null @param {HTMLTableCellElement} c */
const cellValue = (c) => (c.querySelector('.muted') ? null : (c.textContent || '').trim().toLowerCase() || null);

/**
 * Настраивает таблицу по столбцам, которые в ней сейчас есть. Если отличий нет — показывает всё.
 * @param {HTMLTableElement} table
 */
export function initCompare(table) {
  const body = table.tBodies[0];
  const toggle = /** @type {HTMLButtonElement|null} */ (document.querySelector('[data-cmp-toggle]'));
  const rows = [...body.rows].filter((r) => r.dataset.cmp);
  const data = rows.map((r) => ({ kind: String(r.dataset.cmp), label: (r.cells[0].textContent || '').trim(), values: [...r.cells].slice(1).map(cellValue) }));
  const simple = simpleRows(data);
  const empty = data.map((d) => d.values.every((x) => x === null));
  const hasSimple = simple.some(Boolean);
  const hasMore = rows.some((_, i) => !simple[i] && !empty[i]);
  const render = (/** @type {boolean} */ all) => {
    rows.forEach((r, i) => { r.hidden = all ? empty[i] : !simple[i]; });
    let section = /** @type {HTMLTableRowElement|null} */ (null), filled = false;
    for (const r of body.rows) {
      if (r.dataset.cmpHead !== undefined) r.hidden = all;
      if (r.dataset.cmpSec !== undefined) {
        if (section) section.hidden = !all || !filled;
        section = r; filled = false;
      } else if (r.dataset.cmp && !r.hidden) filled = true;
    }
    if (section) section.hidden = !all || !filled;
    if (!toggle) return;
    toggle.hidden = !hasSimple || !hasMore;
    toggle.setAttribute('aria-expanded', String(all));
    toggle.textContent = (all ? toggle.dataset.less : toggle.dataset.more) || '';
  };
  let all = !hasSimple;
  render(all);
  toggle?.addEventListener('click', () => { all = !all; render(all); });
}
