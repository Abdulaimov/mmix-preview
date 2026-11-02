// Корзина, смета и оформление заказа. Цены и наличие всегда пересчитывает сервер.
import { BASE, LANG, ROOT, api, cart, errText, esc, load, money, newKey, phoneMask, phoneValue, showErrors, t, toast } from './common.js';
import { unitAfterPer } from './units.js';

const img = (/** @type {string|null} */ key) => (key ? `<img src="${ROOT}/media/${esc(key)}-480.webp" alt="" loading="lazy">` : '');
const cookie = (/** @type {string} */ name) => document.cookie.split('; ').find((c) => c.startsWith(name + '='))?.split('=')[1] || '';

/** @param {any} q */
function summaryRows(q, cashback) {
  const n = q.lines.reduce((s, /** @type {any} */ l) => s + l.qty, 0);
  const delivery = q.delivery.mode === 'pickup' ? t('js.pickup') : q.delivery.outsideZone ? t('js.delivery_outside') : q.delivery.minor === null ? t('js.delivery_manager')
    : q.delivery.minor === 0 ? (q.delivery.zone ? t('js.free_zone', { zone: q.delivery.zone }) : t('js.free')) : money(q.delivery.minor);
  return `<div><dt>${esc(t('js.items_n', { n }))}</dt><dd>${money(q.itemsTotalMinor)}${q.hasUnpriced ? ` + ${esc(t('js.price_on_request'))}` : ''}</dd></div>
    <div><dt>${esc(t('js.delivery'))}</dt><dd>${esc(delivery)}</dd></div>
    <div class="summary__total"><dt>${esc(t('js.total'))}</dt><dd>${q.totalMinor === null ? esc(t('js.total_pending')) : money(q.totalMinor)}</dd></div>
    ${q.hasUnconfirmed ? `<p class="note">${esc(t('js.preliminary'))}</p>` : ''}
    ${cashback ? `<p class="note">${esc(cashback)}</p>` : ''}`;
}

/** Сообщения об изменениях по строке @param {any} q @param {number} id */
function lineWarnings(q, id) {
  return q.changes.filter((/** @type {any} */ c) => c.variantId === id).map((/** @type {any} */ c) => {
    if (c.kind === 'price_changed') return t('js.price_changed', { was: c.was == null ? t('js.price_on_request') : money(c.was), now: c.now == null ? t('js.price_on_request') : money(c.now) });
    if (c.kind === 'qty_reduced') return t('js.qty_reduced', { n: c.available });
    if (c.kind === 'out_of_stock') return t('js.out_of_stock');
    return t('js.unavailable');
  });
}

// ---------- Корзина ----------
const cartPage = document.querySelector('[data-cart-page]');
if (cartPage) {
  const linesBox = /** @type {HTMLElement} */ (cartPage.querySelector('[data-cart-lines]'));
  const summary = /** @type {HTMLElement} */ (cartPage.querySelector('[data-cart-summary]'));
  const empty = /** @type {HTMLElement} */ (document.querySelector('[data-cart-empty]'));
  let last = null;
  const render = async () => {
    const items = cart.items();
    if (!items.length) { cartPage.setAttribute('hidden', ''); empty.hidden = false; return; }
    let q;
    try { q = await api('/api/cart/quote', { items, lang: LANG }); } catch { linesBox.innerHTML = `<p class="formerr">${esc(t('js.network'))}</p>`; return; }
    last = q;
    const unknown = items.filter((i) => !q.lines.some((/** @type {any} */ l) => l.variantId === i.variantId));
    linesBox.innerHTML = q.lines.map((/** @type {any} */ l) => {
      const warn = lineWarnings(q, l.variantId);
      return `<div class="cline" data-line="${l.variantId}">
        <a class="cline__img" href="${BASE}/product/${esc(l.slug)}">${img(l.imageKey)}</a>
        <div><a class="cline__title" href="${BASE}/product/${esc(l.slug)}">${esc([l.code, l.name].filter(Boolean).join(' '))}${l.variantName ? ` · ${esc(l.variantName)}` : ''}</a>
          <div class="cline__meta">${esc(l.packLabel)} · ${esc(l.sku)} · ${l.unitPriceMinor == null ? esc(t('js.price_on_request')) : `${money(l.unitPriceMinor)} ${esc(t('js.each', { unit: unitAfterPer(LANG, l.unit) }))}`}</div></div>
        <div class="cline__row">
          <div class="qty" data-qty><button type="button" class="qty__btn" data-step="-1" aria-label="−">−</button>
            <input class="qty__in" type="number" min="1" max="${l.maxQty || 1}" value="${l.qty}" data-line-qty="${l.variantId}" inputmode="numeric" aria-label="${esc(l.unit)}">
            <button type="button" class="qty__btn" data-step="1" aria-label="+">+</button></div>
          <span class="cline__sum">${l.lineTotalMinor == null ? esc(t('js.price_on_request')) : money(l.lineTotalMinor)}</span>
          <button type="button" class="btn btn--ghost btn--sm" data-line-remove="${l.variantId}">${esc(t('js.remove'))}</button>
        </div>
        ${warn.length ? `<div class="cline__warn">${warn.map(esc).join('<br>')}</div>` : ''}
      </div>`;
    }).join('') + unknown.map((i) => `<div class="cline"><div class="cline__warn">${esc(t('js.unavailable'))} <button type="button" class="linkbtn" data-line-remove="${i.variantId}">${esc(t('js.remove'))}</button></div></div>`).join('');
    summary.hidden = false;
    /** @type {HTMLElement} */ (summary.querySelector('[data-summary-rows]')).innerHTML = summaryRows(q);
    // Покупатель увидел актуальные цены — запоминаем их, чтобы при оформлении сравнивать с ними
    cart.set(cart.items().map((i) => { const l = q.lines.find((/** @type {any} */ x) => x.variantId === i.variantId); return l ? { ...i, seenPriceMinor: l.unitPriceMinor } : i; }));
  };
  document.addEventListener('change', (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (!el.dataset.lineQty) return;
    const max = Number(el.max) || 9999;
    const v = Math.min(max, Math.max(1, Math.floor(Number(el.value) || 1)));
    cart.setQty(Number(el.dataset.lineQty), v);
    render();
  });
  document.addEventListener('click', async (e) => {
    const el = /** @type {HTMLElement} */ (e.target);
    const rm = el.closest('[data-line-remove]');
    if (rm) { cart.remove(Number(/** @type {HTMLElement} */ (rm).dataset.lineRemove)); render(); }
    if (el.closest('[data-estimate-print]') || el.closest('[data-estimate-share]')) {
      try {
        const res = await api('/api/estimates', { items: cart.items(), lang: LANG });
        const url = location.origin + res.url;
        if (el.closest('[data-estimate-print]')) { location.href = `${res.url}?print=1`; return; }
        if (navigator.share) { try { await navigator.share({ url, title: document.title }); return; } catch { /* отменили */ } }
        await navigator.clipboard.writeText(url).catch(() => {});
        toast(t('js.estimate_link'), { href: res.url, label: '↗' });
      } catch (err) { toast(errText(err)); }
    }
  });
  void last;
  render();
}

// ---------- Смета ----------
const toCart = /** @type {HTMLElement|null} */ (document.querySelector('[data-estimate-to-cart]'));
if (toCart) {
  toCart.addEventListener('click', () => {
    for (const i of JSON.parse(toCart.dataset.estimateToCart || '[]')) cart.add(i.variantId, i.qty, undefined);
    toast(t('js.added'), { href: `${BASE}/cart`, label: t('js.go_cart') });
  });
  if (new URLSearchParams(location.search).get('print') === '1') setTimeout(() => window.print(), 400);
}

// ---------- Оформление ----------
const form = /** @type {HTMLFormElement|null} */ (document.querySelector('[data-checkout-form]'));
if (form) {
  const linesBox = /** @type {HTMLElement} */ (document.querySelector('[data-checkout-lines]'));
  const changesBox = /** @type {HTMLElement} */ (form.querySelector('[data-changes]'));
  const submitBtn = /** @type {HTMLButtonElement} */ (form.querySelector('[data-submit]'));
  const phone = /** @type {HTMLInputElement} */ (form.querySelector('[data-phone]'));
  phoneMask(phone);
  let quote = null, ref = { code: '', name: '', confirmed: false };
  let pendingKey = sessionStorage.getItem('mm_idem_pending') || '';

  const method = () => /** @type {HTMLInputElement|null} */ (form.querySelector('input[name=deliveryMethod]:checked'))?.value || 'delivery';
  const toggleDelivery = () => {
    const pickup = method() === 'pickup';
    /** @type {HTMLElement} */ (form.querySelector('[data-delivery-fields]')).hidden = pickup;
    const pn = /** @type {HTMLElement|null} */ (form.querySelector('[data-pickup-note]'));
    if (pn) pn.hidden = !pickup;
  };

  const refresh = async () => {
    const items = cart.items();
    if (!items.length) { location.replace(`${BASE}/cart`); return; }
    try {
      const city = /** @type {HTMLInputElement|null} */ (form.querySelector('[name=city]'))?.value || '';
      quote = await api('/api/cart/quote', { items, lang: LANG, deliveryMethod: method(), city, refCode: ref.confirmed ? ref.code : '' });
    } catch { linesBox.innerHTML = `<p class="formerr">${esc(t('js.network'))}</p>`; return; }
    const cb = quote.cashback ? t(document.querySelector('.masterbox__own') ? 'js.cashback_own' : 'js.cashback_ref', { sum: money(quote.cashback.minor) }) : '';
    linesBox.innerHTML = quote.lines.map((/** @type {any} */ l) => `<div class="sline"><span>${esc([l.code, l.name].filter(Boolean).join(' '))}${l.variantName ? ` · ${esc(l.variantName)}` : ''} × ${l.qty}</span><b>${l.lineTotalMinor == null ? '—' : money(l.lineTotalMinor)}</b></div>`).join('')
      + `<dl class="summary__rows">${summaryRows(quote, cb)}</dl>`;
  };

  // Привязка к мастеру по коду из ссылки или введённому вручную
  const refBox = /** @type {HTMLElement|null} */ (form.querySelector('[data-ref-box]'));
  const setRef = async (/** @type {string} */ code, silent = false) => {
    if (!refBox) return;
    const err = form.querySelector('[data-ref-err]');
    if (err) err.textContent = '';
    try {
      const r = await api(`/api/ref/${encodeURIComponent(code)}`);
      if (!r.valid) { ref = { code: '', name: '', confirmed: false }; refBox.hidden = true; if (!silent && err) err.textContent = t('js.ref_invalid'); return refresh(); }
      if (r.isSelf) { if (err) err.textContent = t('js.ref_self'); return; }
      ref = { code: r.code, name: r.name, confirmed: true };
      /** @type {HTMLElement} */ (refBox.querySelector('[data-ref-text]')).textContent = t('js.ref_master', { name: r.name });
      /** @type {HTMLInputElement} */ (refBox.querySelector('[data-ref-confirm]')).checked = true;
      refBox.hidden = false;
      const entry = /** @type {HTMLDetailsElement|null} */ (form.querySelector('[data-ref-entry]'));
      if (entry) entry.hidden = true;
      refresh();
    } catch { if (!silent && err) err.textContent = t('js.network'); }
  };
  const clearRef = () => {
    ref = { code: '', name: '', confirmed: false };
    document.cookie = 'mm_ref=; Max-Age=0; path=/';
    if (refBox) refBox.hidden = true;
    const entry = /** @type {HTMLElement|null} */ (form.querySelector('[data-ref-entry]'));
    if (entry) entry.hidden = false;
    refresh();
  };
  form.querySelector('[data-ref-remove]')?.addEventListener('click', clearRef);
  form.querySelector('[data-ref-confirm]')?.addEventListener('change', (e) => { ref.confirmed = /** @type {HTMLInputElement} */ (e.target).checked; refresh(); });
  form.querySelector('[data-ref-apply]')?.addEventListener('click', () => {
    const code = /** @type {HTMLInputElement} */ (form.querySelector('[name=refCodeInput]')).value.trim();
    if (code) setRef(code);
  });

  form.querySelectorAll('input[name=deliveryMethod]').forEach((r) => r.addEventListener('change', () => { toggleDelivery(); refresh(); }));
  let cityTimer = 0;
  form.querySelector('[name=city]')?.addEventListener('input', () => { clearTimeout(cityTimer); cityTimer = window.setTimeout(refresh, 400); });
  toggleDelivery();
  const initialRef = cookie('mm_ref');
  if (initialRef && refBox) setRef(initialRef, true); else refresh();

  const send = async (/** @type {string} */ key) => {
    const f = new FormData(form);
    const body = {
      idempotencyKey: key, lang: LANG,
      items: cart.items().map((i) => ({ variantId: i.variantId, qty: i.qty, seenPriceMinor: quote?.lines.find((/** @type {any} */ l) => l.variantId === i.variantId)?.unitPriceMinor ?? i.seenPriceMinor ?? null })),
      name: f.get('name'), phone: phoneValue(String(f.get('phone') || '')), deliveryMethod: method(), city: f.get('city'), address: f.get('address'),
      comment: f.get('comment'), paymentMethod: f.get('paymentMethod'), website: f.get('website'),
      refCode: ref.confirmed ? ref.code : '', refConfirmed: ref.confirmed, source: load('mm_src', {}),
    };
    return api('/api/orders', body);
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitBtn.disabled) return;
    changesBox.hidden = true;
    submitBtn.disabled = true;
    const label = submitBtn.textContent;
    submitBtn.textContent = t('js.submitting');
    // Ключ повтора: если прошлая отправка оборвалась без ответа, повторяем с тем же ключом — второй заказ не создастся
    const key = pendingKey || newKey();
    pendingKey = key;
    sessionStorage.setItem('mm_idem_pending', key);
    try {
      const res = await send(key);
      sessionStorage.removeItem('mm_idem_pending');
      cart.clear();
      location.href = res.url;
      return;
    } catch (err) {
      const ex = /** @type {any} */ (err);
      if (ex.status) { pendingKey = ''; sessionStorage.removeItem('mm_idem_pending'); }
      if (ex.status === 409 && ex.data?.code === 'err.conditions_changed') {
        quote = ex.data.quote;
        const list = ex.data.changes.map((/** @type {any} */ c) => {
          const l = quote.lines.find((/** @type {any} */ x) => x.variantId === c.variantId);
          return `<li><b>${esc(l ? [l.code, l.name].filter(Boolean).join(' ') : '')}</b>: ${esc(lineWarnings({ changes: [c] }, c.variantId).join(', '))}</li>`;
        }).join('');
        changesBox.innerHTML = `<b>${esc(t('js.changes_title'))}</b><ul>${list}</ul><button type="button" class="btn btn--primary" data-accept>${esc(t('js.confirm_changes'))}</button>`;
        changesBox.hidden = false;
        changesBox.querySelector('[data-accept]')?.addEventListener('click', () => {
          // Принимаем новые цены и доступное количество; недоступное убираем
          const items = cart.items().flatMap((i) => {
            const l = quote.lines.find((/** @type {any} */ x) => x.variantId === i.variantId);
            if (!l || !l.availability.canBuy) return [];
            return [{ ...i, qty: Math.min(i.qty, l.maxQty || i.qty), seenPriceMinor: l.unitPriceMinor }];
          });
          cart.set(items);
          changesBox.hidden = true;
          refresh().then(() => form.requestSubmit());
        });
        changesBox.scrollIntoView({ block: 'center' });
      } else if (ex.status === 409 && ex.data?.refInvalid) {
        clearRef();
        showErrors(form, { status: 409, message: ex.message, data: {} });
      } else {
        showErrors(form, ex);
      }
    }
    submitBtn.disabled = false;
    submitBtn.textContent = label;
  });
}
