// Страница товара: выбор варианта, галерея и увеличение, калькулятор расхода, закреплённая панель покупки.
import { cart, esc, money, t, toast, BASE, ROOT } from './common.js';
import { calcNeed, ceilUp, packLabel, packOptions, packRows } from './calc-packs.js';

const buybox = /** @type {HTMLElement|null} */ (document.querySelector('[data-buybox]'));
const buyForm = /** @type {HTMLFormElement|null} */ (buybox?.querySelector('[data-buy]'));

// ---- Варианты (например, матовая и глянцевая затирка): свой артикул, цена и наличие ----
buybox?.querySelectorAll('input[name=variant]').forEach((el) => el.addEventListener('change', () => {
  const r = /** @type {HTMLInputElement} */ (el);
  const d = r.dataset;
  if (!buyForm) return;
  buyForm.dataset.variant = r.value;
  buyForm.dataset.price = d.vPrice || '';
  const qty = /** @type {HTMLInputElement} */ (buyForm.querySelector('input[name=qty]'));
  qty.max = d.vMax || '1';
  if (Number(qty.value) > Number(qty.max)) qty.value = qty.max;
  const sku = document.querySelector('[data-sku]');
  if (sku) sku.textContent = d.vSku || '';
  const colorName = document.querySelector('[data-color-name]');
  if (colorName) colorName.textContent = d.vName || '';
  const tpl = /** @type {HTMLTemplateElement|null} */ (document.querySelector(`template[data-stock-for="${r.value}"]`));
  const stockBox = document.querySelector('[data-stock-box]');
  if (tpl && stockBox) stockBox.replaceChildren(tpl.content.cloneNode(true));
  const unconfirmed = document.querySelector('[data-price-box] .price__note');
  if (unconfirmed) /** @type {HTMLElement} */ (unconfirmed).hidden = d.vConfirmed === '1';
  const priceBox = document.querySelector('[data-price-box] .price__val');
  if (priceBox && d.vPrice) priceBox.textContent = money(Number(d.vPrice));
  // Подпись «за ведро 5 кг» — своя у каждой фасовки
  const perBox = document.querySelector('[data-price-box] .price__unit');
  if (perBox && d.vPer) perBox.textContent = d.vPer;
  document.querySelectorAll('[data-sticky-price]').forEach((x) => { x.textContent = d.vPrice ? money(Number(d.vPrice)) : t('js.price_on_request'); });
  const sideVar = document.querySelector('[data-side-var]');
  if (sideVar) sideVar.textContent = d.vName || d.vPack || '';
  const url = new URL(location.href);
  url.searchParams.set('v', r.value);
  history.replaceState(null, '', url);
}));

// ---- Галерея ----
const gallery = document.querySelector('[data-gallery]');
const dialog = /** @type {HTMLDialogElement|null} */ (document.querySelector('[data-zoom-dialog]'));
const zoomImg = /** @type {HTMLImageElement|null} */ (dialog?.querySelector('[data-zoom-img]'));
gallery?.querySelectorAll('[data-thumb]').forEach((th) => th.addEventListener('click', () => {
  const key = /** @type {HTMLElement} */ (th).dataset.thumb;
  const main = /** @type {HTMLImageElement|null} */ (gallery.querySelector('.gallery__img'));
  if (main) {
    main.src = `${ROOT}/media/${key}-960.webp`;
    main.srcset = `${ROOT}/media/${key}-480.webp 480w, ${ROOT}/media/${key}-960.webp 960w, ${ROOT}/media/${key}-1600.webp 1600w`;
  }
  if (zoomImg) zoomImg.src = `${ROOT}/media/${key}-1600.webp`;
  gallery.querySelectorAll('[data-thumb]').forEach((x) => x.classList.toggle('is-active', x === th));
}));
gallery?.querySelector('[data-zoom]')?.addEventListener('click', () => { if (zoomImg && dialog?.showModal) dialog.showModal(); });
dialog?.addEventListener('click', (e) => { if (e.target === dialog || /** @type {HTMLElement} */ (e.target).closest('[data-close]') || e.target === zoomImg) dialog.close(); });

// ---- Калькулятор расхода: считает на лету, запас показан отдельно, по каждой упаковке — количество и сумма ----
const calcBox = /** @type {HTMLElement|null} */ (document.querySelector('[data-calc]'));
if (calcBox) {
  const calc = JSON.parse(calcBox.dataset.calc || '{}');
  const packs = JSON.parse(calcBox.dataset.packs || '[]');
  const form = /** @type {HTMLFormElement} */ (calcBox.querySelector('[data-calc-form]'));
  const out = /** @type {HTMLElement} */ (calcBox.querySelector('[data-calc-out]'));
  const num = (/** @type {number} */ n, d = 2) => n.toLocaleString('ru-RU', { maximumFractionDigits: d });
  // Цвет затирки — в подписи: выбирают его далеко от калькулятора
  const label = (/** @type {any} */ p) => (calc.type === 'coverage' ? `${p.pack}${p.name ? ` (${p.name})` : ''}` : packLabel(p));
  const mainField = calc.type === 'length' ? 'length' : 'area';

  /** Сообщение об ошибке по полю @param {any} need */
  const errorText = (need) => {
    if (need.error === 'thickness') {
      const range = need.min != null && need.max != null ? t('js.calc_range', { min: num(need.min), max: num(need.max) }) : need.max != null ? t('js.calc_upto', { max: num(need.max) }) : t('js.calc_from', { min: num(need.min) });
      return t('js.calc_err_thickness', { range });
    }
    return t(`js.calc_err_${need.error}`, { min: need.min, max: need.max });
  };

  /** @param {any} need @param {any[]} opts @param {string} unit */
  const formula = (need, opts, unit) => {
    const k = num(need.k);
    const total = need.total.map((/** @type {number} */ x) => num(x));
    const split = (/** @type {number} */ x) => opts.map((/** @type {any} */ p) => `${num(x)} ÷ ${num(p.amount)} = ${num(x / p.amount)} → <b>${ceilUp(x / p.amount)}</b>`).join('; ');
    if (calc.type === 'length') return `${num(need.base[0])} м × ${k} = ${total[0]} ${esc(unit)} → ${split(need.total[0])}`;
    if (calc.type === 'coverage') return `${num(need.base[0])} м² × ${k} = ${total[0]} м² → ${total[0]} ÷ ${num(need.perOne)} м² = ${num(need.total[0] / need.perOne)} → <b>${ceilUp(need.total[0] / need.perOne)}</b>`;
    if (calc.type === 'area_layers') {
      const ranges = opts.map((/** @type {any} */ p) => `÷ ${num(p.amount)} = ${num(need.total[0] / p.amount)}–${num(need.total[1] / p.amount)} → <b>${ceilUp(need.total[0] / p.amount)}–${ceilUp(need.total[1] / p.amount)}</b>`).join('; ');
      return `${num(need.area)} м² × ${need.layers} × ${calc.rateMin}–${calc.rateMax} мл/м² × ${k} = ${total[0]}–${total[1]} ${esc(unit)} → ${ranges}`;
    }
    return `${num(need.area)} м² × ${num(need.mm)} мм × ${num(calc.rate)} кг/м²·мм${calc.layers ? ` × ${need.layers}` : ''} × ${k} = ${total[0]} ${esc(unit)} → ${split(need.total[0])}`;
  };

  /** @param {boolean} insist — нажали «Рассчитать»: сказать и про пустое поле */
  const render = (insist) => {
    const f = new FormData(form);
    const g = (/** @type {string} */ k) => Number(String(f.get(k) || '').replace(',', '.'));
    form.querySelectorAll('[aria-invalid]').forEach((x) => x.removeAttribute('aria-invalid'));
    if (!insist && !String(f.get(mainField) || '').trim()) { out.hidden = true; return; }
    const need = calcNeed(calc, { area: g('area'), length: g('length'), thickness: g('thickness'), layers: g('layers'), tile: g('tile'), joint: g('joint'), reserve: g('reserve') });
    out.hidden = false;
    if (need.error) {
      form.querySelector(`[name=${need.error}]`)?.setAttribute('aria-invalid', 'true');
      out.innerHTML = `<p class="field__err">${esc(errorText(need))}</p>`;
      return;
    }
    const selectedId = Number(buyForm?.dataset.variant) || packs[0]?.id;
    // Разные объёмы упаковки считаем все сразу, покупатель выбирает сам; обычно строка одна
    const opts = packOptions(packs, selectedId);
    const unit = need.unit || opts[0].packUnit;
    const show = (/** @type {number[]} */ pair) => `${pair[0] === pair[1] ? num(pair[0]) : esc(t('js.calc_range', { min: num(pair[0]), max: num(pair[1]) }))} ${esc(unit)}`;
    const exact = need.total[0] === need.total[1];
    const rows = packRows(need, opts).map((r) => {
      const left = exact && r.left > 0.005 ? ` · ${esc(t('js.calc_left', { n: `${num(r.left)} ${unit}` }))}` : '';
      const detail = calc.type === 'coverage' ? esc(t('js.calc_covers', { n: `${num(r.amount)} м²` })) : `${num(r.amount)} ${esc(unit)}${left}`;
      const title = `${r.qty} × ${label(r.p)}`;
      return `<li class="calcopt${r.best ? ' is-best' : ''}">
        <div class="calcopt__main"><b>${esc(title)}</b>${r.best ? ` <span class="calcopt__tag">${esc(t('js.calc_cheaper'))}</span>` : ''}<small>${detail}</small></div>
        <div class="calcopt__buy">${r.sum !== null ? `<span class="calcopt__sum">${esc(money(r.sum))}</span>` : ''}${r.p.canBuy ? `<button class="btn btn--primary" type="button" data-calc-add="${r.qty}" data-calc-variant="${r.p.id}" data-calc-price="${r.p.price ?? ''}" aria-label="${esc(t('js.calc_add', { n: title }))}">${esc(t('js.calc_add_short'))}</button>` : ''}</div>
      </li>`;
    }).join('');
    out.innerHTML = `<div class="calcres__need"><span>${esc(t('js.calc_need'))}</span> <b class="calc__big">${show(need.total)}</b></div>
      <p class="calcres__break">${need.reserve ? esc(t('js.calc_breakdown', { base: 'BASE', n: need.reserve, extra: 'EXTRA' })).replace('BASE', show(need.base)).replace('EXTRA', show(need.extra)) : esc(t('js.calc_no_reserve'))}</p>
      <p class="calc__choose">${esc(t(opts.length > 1 ? 'js.calc_choose' : 'js.calc_buy'))}</p>
      <ul class="calc__opts">${rows}</ul>
      <details class="calcres__how"><summary>${esc(t('js.calc_formula'))}</summary><div class="calc__formula">${formula(need, opts, unit)}</div></details>`;
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); render(true); });
  form.addEventListener('input', () => render(false));
  form.addEventListener('change', () => render(false));
  // Выбрали другой цвет или фасовку — расчёт следует за выбором
  buybox?.addEventListener('change', () => render(false));
  out.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('[data-calc-add]');
    if (!b) return;
    const d = /** @type {HTMLElement} */ (b).dataset;
    cart.add(Number(d.calcVariant), Number(d.calcAdd), d.calcPrice === '' ? null : Number(d.calcPrice));
    toast(t('js.added'), { href: `${BASE}/cart`, label: t('js.go_cart') });
  });
  render(false);
}

// ---- Закреплённая панель покупки на телефоне: появляется, когда блок покупки ушёл с экрана ----
const sticky = /** @type {HTMLElement|null} */ (document.querySelector('[data-stickybuy]'));
if (sticky && buybox && 'IntersectionObserver' in window) {
  new IntersectionObserver(([entry]) => { sticky.hidden = entry.isIntersecting || entry.boundingClientRect.top > 0; }).observe(buybox);
}
document.querySelectorAll('[data-sticky-add]').forEach((x) => x.addEventListener('click', () => buyForm?.requestSubmit()));
