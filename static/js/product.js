// Страница товара: выбор варианта, галерея и увеличение, калькулятор расхода, закреплённая панель покупки.
import { cart, esc, money, t, toast, BASE, ROOT } from './common.js';

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
  const tpl = /** @type {HTMLTemplateElement|null} */ (document.querySelector(`template[data-stock-for="${r.value}"]`));
  const stockBox = document.querySelector('[data-stock-box]');
  if (tpl && stockBox) stockBox.replaceChildren(tpl.content.cloneNode(true));
  const unconfirmed = document.querySelector('[data-price-box] .price__note');
  if (unconfirmed) /** @type {HTMLElement} */ (unconfirmed).hidden = d.vConfirmed === '1';
  const priceBox = document.querySelector('[data-price-box] .price__val');
  if (priceBox && d.vPrice) priceBox.textContent = money(Number(d.vPrice));
  const sticky = document.querySelector('[data-sticky-price]');
  if (sticky) sticky.textContent = d.vPrice ? money(Number(d.vPrice)) : t('js.price_on_request');
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

// ---- Калькулятор расхода ----
const calcBox = /** @type {HTMLElement|null} */ (document.querySelector('[data-calc]'));
if (calcBox) {
  const calc = JSON.parse(calcBox.dataset.calc || '{}');
  const packs = JSON.parse(calcBox.dataset.packs || '[]');
  const form = /** @type {HTMLFormElement} */ (calcBox.querySelector('[data-calc-form]'));
  const out = /** @type {HTMLElement} */ (calcBox.querySelector('[data-calc-out]'));
  const num = (/** @type {number} */ n, d = 1) => n.toLocaleString(document.documentElement.lang === 'tg' ? 'ru-RU' : 'ru-RU', { maximumFractionDigits: d });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const g = (/** @type {string} */ k) => Number(String(f.get(k) || '').replace(',', '.'));
    const reserve = Math.min(30, Math.max(0, g('reserve') || 0));
    const k = 1 + reserve / 100;
    const variantId = Number(buyForm?.dataset.variant) || packs[0]?.id;
    const pack = packs.find((/** @type {any} */ p) => p.id === variantId) || packs[0];
    const unitLabel = `${pack.unit} ${pack.pack}`;
    let html = '', addQty = 0;
    form.querySelectorAll('[aria-invalid]').forEach((x) => x.removeAttribute('aria-invalid'));
    const bad = (/** @type {string} */ name) => { form.querySelector(`[name=${name}]`)?.setAttribute('aria-invalid', 'true'); out.hidden = false; out.innerHTML = `<p class="field__err">${esc(t('js.calc_invalid'))}</p>`; };
    if (calc.type === 'length') {
      const len = g('length');
      if (!(len > 0)) return bad('length');
      const total = len * k;
      addQty = Math.ceil(total / pack.amount);
      html = `<div class="calc__big">${addQty} × ${esc(unitLabel)}</div>
        <div class="calc__formula">${esc(t('js.calc_formula'))}: ${num(len)} × ${num(k, 2)} = ${num(total)} ${esc(pack.packUnit)} → ${num(total)} ÷ ${num(pack.amount)} = ${num(total / pack.amount, 2)} → <b>${addQty}</b></div>`;
    } else if (calc.type === 'area_layers') {
      const area = g('area'), layers = Math.round(g('layers'));
      if (!(area > 0)) return bad('area');
      if (!(layers >= calc.layers.min && layers <= calc.layers.max)) return bad('layers');
      const lMin = area * layers * calc.rateMin / 1000 * k, lMax = area * layers * calc.rateMax / 1000 * k;
      const pMin = Math.ceil(lMin / pack.amount), pMax = Math.ceil(lMax / pack.amount);
      addQty = pMax;
      html = `<div>${esc(t('js.calc_need'))}: <span class="calc__big">${esc(t('js.calc_range', { min: num(lMin), max: num(lMax) }))} ${esc(pack.packUnit)}</span></div>
        <div>${esc(t('js.calc_packs'))}: <b>${pMin === pMax ? pMin : esc(t('js.calc_range', { min: pMin, max: pMax }))}</b> × ${esc(unitLabel)}</div>
        <div class="calc__formula">${esc(t('js.calc_formula'))}: ${num(area)} м² × ${layers} × ${calc.rateMin}–${calc.rateMax} мл/м² × ${num(k, 2)} = ${num(lMin)}–${num(lMax)} ${esc(pack.packUnit)} → ÷ ${num(pack.amount)} = ${num(lMin / pack.amount, 2)}–${num(lMax / pack.amount, 2)} → <b>${pMin}–${pMax}</b></div>`;
    } else {
      const area = g('area'), h = g('thickness');
      const layers = calc.layers ? Math.round(g('layers')) || 1 : 1;
      if (!(area > 0)) return bad('area');
      const min = calc.thickness?.min ?? 0.1, max = calc.thickness?.max ?? 1000;
      if (!(h >= min && h <= max)) return bad('thickness');
      const kg = area * h * calc.rate * layers * k;
      addQty = Math.ceil(kg / pack.amount);
      html = `<div>${esc(t('js.calc_need'))}: <span class="calc__big">${num(kg)} ${esc(pack.packUnit)}</span></div>
        <div>${esc(t('js.calc_packs'))}: <b>${addQty}</b> × ${esc(unitLabel)}</div>
        <div class="calc__formula">${esc(t('js.calc_formula'))}: ${num(area)} м² × ${num(h)} мм × ${num(calc.rate, 2)} кг/м²·мм${calc.layers ? ` × ${layers}` : ''} × ${num(k, 2)} = ${num(kg)} ${esc(pack.packUnit)} → ${num(kg)} ÷ ${num(pack.amount)} = ${num(kg / pack.amount, 2)} → <b>${addQty}</b></div>`;
    }
    out.hidden = false;
    out.innerHTML = html + (addQty > 0 && buyForm && !buyForm.querySelector('button[type=submit]')?.hasAttribute('disabled')
      ? `<button class="btn btn--primary" type="button" data-calc-add="${addQty}">${esc(t('js.calc_add', { n: `${addQty} × ${unitLabel}` }))}</button>` : '');
  });
  out.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('[data-calc-add]');
    if (!b || !buyForm) return;
    cart.add(Number(buyForm.dataset.variant), Number(/** @type {HTMLElement} */ (b).dataset.calcAdd), buyForm.dataset.price === '' ? null : Number(buyForm.dataset.price));
    toast(t('js.added'), { href: `${BASE}/cart`, label: t('js.go_cart') });
  });
}

// ---- Закреплённая панель покупки на телефоне: появляется, когда блок покупки ушёл с экрана ----
const sticky = /** @type {HTMLElement|null} */ (document.querySelector('[data-stickybuy]'));
if (sticky && buybox && 'IntersectionObserver' in window) {
  new IntersectionObserver(([entry]) => { sticky.hidden = entry.isIntersecting || entry.boundingClientRect.top > 0; }).observe(buybox);
  sticky.querySelector('[data-sticky-add]')?.addEventListener('click', () => buyForm?.requestSubmit());
}
