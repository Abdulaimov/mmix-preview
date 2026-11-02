// Общие функции для страниц магазина: тексты, суммы, запросы к серверу, корзина в браузере.

const I18N = (() => { try { return JSON.parse(document.getElementById('i18n')?.textContent || '{}'); } catch { return {}; } })();
export const LANG = document.body.dataset.lang === 'tg' ? 'tg' : 'ru';
export const BASE = document.body.dataset.base || '';
// Демо-копия сайта для согласования (GitHub Pages): сайт лежит не в корне домена, сервера нет
export const PREVIEW = document.body.dataset.preview === '1';
export const ROOT = document.body.dataset.root || '';

/** @param {string} key @param {Record<string, any>} [p] */
export function t(key, p) {
  let s = I18N[key] ?? key;
  if (p) s = s.replace(/\{(\w+)\}/g, (m, k) => (p[k] === undefined ? m : String(p[k])));
  return s;
}

/** Сумма в дирамах → «1 234,50 сомони» @param {number|null|undefined} minor */
export function money(minor, withUnit = true) {
  if (minor === null || minor === undefined) return '';
  const neg = minor < 0, abs = Math.abs(minor);
  const int = Math.trunc(abs / 100), frac = abs % 100;
  const s = (neg ? '−' : '') + String(int).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + (frac ? ',' + String(frac).padStart(2, '0') : '');
  return withUnit ? `${s}\u00a0${t('js.money_unit')}` : s;
}

/** @param {any} s */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Запрос к API магазина. Ошибка сервера → Error с полями status и data. @param {string} url @param {any} [body] @param {string} [method] */
export async function api(url, body, method) {
  if (PREVIEW) return (await import('./preview-api.js')).previewApi(url, body);
  const res = await fetch(url, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: { 'content-type': 'application/json', 'x-requested-with': 'mmix', accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { status: res.status, data });
  return data;
}

// ---------- Хранилище браузера (может быть недоступно — тогда работаем в памяти) ----------
const mem = new Map();
/** @param {string} k */
export function load(k, fallback) {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return mem.has(k) ? mem.get(k) : fallback; }
}
/** @param {string} k @param {any} v */
export function save(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { mem.set(k, v); }
}

// ---------- Корзина: [{ variantId, qty, seenPriceMinor }] ----------
const CART_KEY = 'mm_cart';
export const cart = {
  items() { return (load(CART_KEY, { items: [] }).items || []).filter((/** @type {any} */ i) => Number.isInteger(i.variantId) && i.qty > 0); },
  /** @param {any[]} items */
  set(items) { save(CART_KEY, { items, updatedAt: Date.now() }); document.dispatchEvent(new CustomEvent('cart:change')); },
  /** @param {number} variantId @param {number} qty @param {number|null} priceMinor */
  add(variantId, qty, priceMinor) {
    const items = cart.items();
    const cur = items.find((i) => i.variantId === variantId);
    if (cur) { cur.qty = Math.min(9999, cur.qty + qty); if (priceMinor !== undefined) cur.seenPriceMinor = priceMinor; }
    else items.push({ variantId, qty, seenPriceMinor: priceMinor });
    cart.set(items);
  },
  /** @param {number} variantId @param {number} qty */
  setQty(variantId, qty) { cart.set(cart.items().map((i) => (i.variantId === variantId ? { ...i, qty } : i)).filter((i) => i.qty > 0)); },
  /** @param {number} variantId */
  remove(variantId) { cart.set(cart.items().filter((i) => i.variantId !== variantId)); },
  clear() { cart.set([]); },
  count() { return cart.items().reduce((s, i) => s + i.qty, 0); },
};

// ---------- Сравнение: id товаров ----------
const CMP_KEY = 'mm_compare';
export const compare = {
  ids() { return (load(CMP_KEY, []) || []).filter(Number.isInteger).slice(0, 4); },
  /** @param {number[]} ids */
  set(ids) { save(CMP_KEY, ids.slice(0, 4)); document.dispatchEvent(new CustomEvent('compare:change')); },
};

/** Текст ошибки запроса: в демо-копии — её пояснение, иначе — «нет связи» @param {any} err */
export const errText = (err) => (err?.preview ? err.message : t('js.network'));

let toastTimer = 0;
/** @param {string} text @param {{ href?: string, label?: string }} [link] */
export function toast(text, link) {
  const el = /** @type {HTMLElement|null} */ (document.querySelector('[data-toast]'));
  if (!el) return;
  el.innerHTML = `<span>${esc(text)}</span>${link?.href ? `<a href="${esc(link.href)}">${esc(link.label || '')}</a>` : ''}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { el.hidden = true; }, 4000);
}

// Новый ключ для защиты от повторной отправки
export function newKey() {
  const a = new Uint8Array(18);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Текст ошибки для формы и подсветка полей @param {HTMLFormElement} form @param {any} err */
export function showErrors(form, err) {
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  form.querySelectorAll('.field__err, [data-err]').forEach((el) => { el.textContent = ''; });
  const fe = err?.data?.fieldErrors || {};
  for (const [name, msg] of Object.entries(fe)) {
    const input = form.querySelector(`[name="${name}"]`);
    if (input) input.setAttribute('aria-invalid', 'true');
    const box = form.querySelector(`#e-${name}`) || form.querySelector(`[data-err="${name}"]`);
    if (box) box.textContent = String(msg);
  }
  const general = /** @type {HTMLElement|null} */ (form.querySelector('[data-form-error]'));
  if (general) {
    const msg = !err ? '' : err.status ? (Object.keys(fe).length ? '' : err.message) : t('js.network');
    general.textContent = msg;
    general.hidden = !msg;
  }
  const first = form.querySelector('[aria-invalid=true]');
  if (first instanceof HTMLElement) first.focus();
}

/** Ввод телефона: показываем «90 123 45 67», отправляем цифры @param {HTMLInputElement} input */
export function phoneMask(input) {
  input.addEventListener('input', () => {
    let d = input.value.replace(/\D/g, '');
    if (d.startsWith('992') && d.length > 9) d = d.slice(3);
    d = d.slice(0, 9);
    const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);
    input.value = parts.join(' ');
  });
}
/** @param {string} v */
export const phoneValue = (v) => '+992' + String(v || '').replace(/\D/g, '').replace(/^992(?=\d{9})/, '').slice(-9);
