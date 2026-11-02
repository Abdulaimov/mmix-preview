// Общее поведение страниц: счётчики, «В корзину», сравнение, подсказки поиска, фильтры, метки рекламы.
import { BASE, LANG, api, cart, compare, esc, money, t, toast, save, load } from './common.js';

// ---- Счётчики в шапке ----
function renderCounts() {
  const n = cart.count();
  document.querySelectorAll('[data-cart-count]').forEach((el) => { el.textContent = String(n); /** @type {HTMLElement} */ (el).hidden = n === 0; });
  const c = compare.ids().length;
  document.querySelectorAll('[data-compare-count]').forEach((el) => { el.textContent = String(c); /** @type {HTMLElement} */ (el).hidden = c === 0; });
  document.querySelectorAll('[data-compare]').forEach((el) => { /** @type {HTMLInputElement} */ (el).checked = compare.ids().includes(Number(/** @type {HTMLElement} */ (el).dataset.compare)); });
}
document.addEventListener('cart:change', renderCounts);
document.addEventListener('compare:change', renderCounts);
window.addEventListener('storage', renderCounts);
renderCounts();

// ---- Количество: кнопки − и + ----
document.addEventListener('click', (e) => {
  const btn = /** @type {HTMLElement} */ (e.target).closest('[data-step]');
  if (!btn) return;
  const input = /** @type {HTMLInputElement} */ (btn.closest('[data-qty]')?.querySelector('input'));
  if (!input || input.disabled) return;
  const max = Number(input.max) || 9999;
  const next = Math.min(max, Math.max(1, (Number(input.value) || 1) + Number(/** @type {HTMLElement} */ (btn).dataset.step)));
  input.value = String(next);
  input.dispatchEvent(new Event('change', { bubbles: true }));
});

// ---- В корзину ----
document.addEventListener('submit', (e) => {
  const form = /** @type {HTMLFormElement} */ (e.target);
  if (!form.matches('[data-buy]')) return;
  e.preventDefault();
  const input = /** @type {HTMLInputElement} */ (form.querySelector('input[name=qty]'));
  const max = Number(input.max) || 9999;
  let qty = Math.floor(Number(input.value) || 1);
  if (qty > max) { qty = max; input.value = String(max); toast(t('js.qty_max', { n: max })); }
  const price = form.dataset.price === '' ? null : Number(form.dataset.price);
  cart.add(Number(form.dataset.variant), Math.max(1, qty), price);
  toast(`${t('js.added')}: ${form.dataset.title || ''}`, { href: `${BASE}/cart`, label: t('js.go_cart') });
});

// ---- Сравнение ----
document.addEventListener('change', (e) => {
  const el = /** @type {HTMLInputElement} */ (e.target);
  if (!el.matches('[data-compare]')) return;
  const id = Number(el.dataset.compare);
  let ids = compare.ids();
  if (el.checked) {
    if (ids.length >= 4) { el.checked = false; toast(t('js.compare_max')); return; }
    ids = [...ids.filter((x) => x !== id), id];
    compare.set(ids);
    toast(t('js.compare_added'), ids.length >= 2 ? { href: `${BASE}/compare?ids=${ids.join(',')}`, label: t('js.compare_go') } : undefined);
  } else {
    compare.set(ids.filter((x) => x !== id));
    toast(t('js.compare_removed'));
  }
});
document.querySelectorAll('a[href$="/compare"]').forEach((a) => a.addEventListener('click', (e) => {
  const ids = compare.ids();
  if (ids.length) { e.preventDefault(); location.href = `${BASE}/compare?ids=${ids.join(',')}`; }
}));
if (document.body.classList.contains('page-compare')) {
  const params = new URLSearchParams(location.search);
  if (!params.get('ids') && compare.ids().length) location.replace(`${BASE}/compare?ids=${compare.ids().join(',')}`);
  document.addEventListener('click', (e) => {
    const rm = /** @type {HTMLElement} */ (e.target).closest('[data-compare-remove]');
    if (rm) {
      const ids = compare.ids().filter((x) => x !== Number(/** @type {HTMLElement} */ (rm).dataset.compareRemove));
      compare.set(ids);
      location.href = `${BASE}/compare${ids.length ? `?ids=${ids.join(',')}` : ''}`;
    }
    if (/** @type {HTMLElement} */ (e.target).closest('[data-compare-clear]')) { compare.set([]); location.href = `${BASE}/compare`; }
  });
}

// ---- Подсказки поиска ----
const search = /** @type {HTMLFormElement|null} */ (document.querySelector('[data-search]'));
if (search) {
  const input = /** @type {HTMLInputElement} */ (search.querySelector('input[name=q]'));
  const box = /** @type {HTMLElement} */ (search.querySelector('.suggest'));
  const params = new URLSearchParams(location.search);
  if (params.get('q')) input.value = params.get('q') || '';
  let timer = 0, seq = 0, active = -1;
  const close = () => { box.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; };
  const items = () => /** @type {HTMLElement[]} */ ([...box.querySelectorAll('.suggest__item')]);
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { close(); return; }
    timer = window.setTimeout(async () => {
      const my = ++seq;
      try {
        const data = await api(`/api/search/suggest?lang=${LANG}&q=${encodeURIComponent(q)}`);
        if (my !== seq) return;
        let h = '';
        if (data.categories.length) h += `<div class="suggest__h">${esc(t('js.search_categories'))}</div>` + data.categories.map((/** @type {any} */ c) => `<a class="suggest__item" role="option" href="${esc(c.url)}"><span></span><span>${esc(c.name)}</span></a>`).join('');
        if (data.items.length) h += `<div class="suggest__h">${esc(t('js.search_products'))}</div>` + data.items.map((/** @type {any} */ it) => `<a class="suggest__item" role="option" href="${esc(it.url)}">${it.image ? `<img src="${esc(it.image)}" alt="" loading="lazy">` : '<span></span>'}<span>${esc(it.title)}<small>${esc(it.subtitle || '')} · ${esc(it.sku || '')}</small></span><b>${it.priceMinor != null ? esc(money(it.priceMinor)) : ''}</b></a>`).join('');
        if (!h) h = `<div class="suggest__h">${esc(t('js.search_empty'))}</div>`;
        h += `<a class="suggest__all" href="${BASE}/catalog?q=${encodeURIComponent(q)}">${esc(t('js.search_all'))}</a>`;
        box.innerHTML = h;
        box.hidden = false;
        input.setAttribute('aria-expanded', 'true');
        active = -1;
      } catch { close(); }
    }, 180);
  });
  input.addEventListener('keydown', (e) => {
    const list = items();
    if (box.hidden || !list.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
      list.forEach((el, i) => el.setAttribute('aria-selected', String(i === active)));
    } else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); list[active].click(); }
    else if (e.key === 'Escape') close();
  });
  document.addEventListener('click', (e) => { if (!search.contains(/** @type {Node} */ (e.target))) close(); });
}

// ---- Фильтры и сортировка: применяем сразу (на компьютере), на телефоне — кнопкой «Показать» ----
const filters = /** @type {HTMLFormElement|null} */ (document.querySelector('[data-filters]'));
if (filters) {
  const wide = window.matchMedia('(min-width: 980px)');
  filters.addEventListener('change', (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (wide.matches && el.type !== 'text' && el.type !== 'number') filters.requestSubmit();
  });
  // Пустые поля не попадают в адрес
  filters.addEventListener('submit', () => {
    filters.querySelectorAll('input, select').forEach((el) => { const i = /** @type {HTMLInputElement} */ (el); if (!i.value && i.name) i.disabled = true; });
  });
  const panel = /** @type {HTMLDetailsElement|null} */ (document.querySelector('[data-fpanel]'));
  if (panel && !wide.matches && !new URLSearchParams(location.search).toString().replace(/(^|&)(q|sort)=[^&]*/g, '')) panel.open = false;
}
document.querySelector('[data-sort] select')?.addEventListener('change', (e) => /** @type {HTMLFormElement} */ (/** @type {HTMLElement} */ (e.target).closest('form')).submit());

// ---- Меню: закрыть при клике мимо ----
document.addEventListener('click', (e) => {
  document.querySelectorAll('details[data-menu][open]').forEach((d) => { if (!d.contains(/** @type {Node} */ (e.target))) d.removeAttribute('open'); });
});

// ---- Живость: появление блоков, тень шапки, отклик первого экрана на мышь, счёт цифр ----
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
(() => {
  const els = /** @type {HTMLElement[]} */ ([...document.querySelectorAll('.reveal')]);
  if (!els.length || !('IntersectionObserver' in window)) return;   // без наблюдателя всё видно сразу
  // Что уже на экране, отмечаем до того, как прятать остальное, — иначе первый экран мигнул бы
  const onScreen = new Set(els.filter((el) => el.getBoundingClientRect().top < innerHeight * 0.94));
  for (const el of onScreen) el.classList.add('is-in');
  document.documentElement.classList.add('js-reveal');
  const io = new IntersectionObserver((entries) => {
    let n = 0;
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = /** @type {HTMLElement} */ (e.target);
      // Соседи появляются по очереди; задержку потом снимаем, чтобы не тормозила наведение
      el.style.setProperty('--d', `${Math.min(n++, 6) * 80}ms`);
      el.classList.add('is-in');
      io.unobserve(el);
      setTimeout(() => el.style.removeProperty('--d'), 1400);
    }
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
  for (const el of els) if (!onScreen.has(el)) io.observe(el);
})();
// Шапка: тень после начала прокрутки. На телефоне и планшете, где шапка в две строки и с разделами, она уходит,
// когда листают вниз, и возвращается, как только листают вверх. Пока открыто меню или идёт поиск — стоит на месте.
(() => {
  const hdr = /** @type {HTMLElement|null} */ (document.querySelector('.hdr'));
  if (!hdr) return;
  const root = document.documentElement;
  const narrow = matchMedia('(max-width: 979px)');
  const input = hdr.querySelector('.search input');
  const suggest = /** @type {HTMLElement|null} */ (hdr.querySelector('.suggest'));
  // Высоту шапки знают липкие блоки под ней (строка разделов товара) и отступ при переходе по якорю
  let height = 0;
  const measure = () => { height = hdr.offsetHeight; root.style.setProperty('--hdr-h', `${height}px`); };
  measure();
  new ResizeObserver(measure).observe(hdr);
  let hidden = false, lastY = Math.max(0, scrollY);
  const hide = (/** @type {boolean} */ v) => {
    if (v === hidden) return;
    hidden = v;
    hdr.classList.toggle('is-hidden', v);
    root.classList.toggle('hdr-hidden', v);
  };
  const busy = () => !!hdr.querySelector('details[open]') || document.activeElement === input || !!(suggest && !suggest.hidden);
  const on = () => {
    const y = Math.max(0, scrollY);
    hdr.classList.toggle('is-scrolled', y > 8);
    if (!narrow.matches || busy() || y < height) { hide(false); lastY = y; return; }
    // У нижнего края страница «пружинит» — это не прокрутка вверх
    if (y + innerHeight >= root.scrollHeight - 4) { lastY = y; return; }
    // Мелкое дрожание пальца не считаем
    if (Math.abs(y - lastY) < 10) return;
    hide(y > lastY);
    lastY = y;
  };
  addEventListener('scroll', on, { passive: true });
  narrow.addEventListener('change', () => hide(false));
  // С клавиатуры (Tab) в спрятанную шапку — показываем
  hdr.addEventListener('focusin', () => hide(false));
  // Переход по якорю на этой странице: если цель ниже — шапка уйдёт сразу, и отступ сверху посчитается без неё
  document.addEventListener('click', (e) => {
    const a = /** @type {HTMLAnchorElement|null} */ (/** @type {Element} */ (e.target).closest?.('a[href^="#"]'));
    if (!a || !narrow.matches || a.hash.length < 2) return;
    const target = document.getElementById(decodeURIComponent(a.hash.slice(1)));
    if (target) hide(target.getBoundingClientRect().top > height);
  });
  on();
})();
(() => {
  const hero = /** @type {HTMLElement|null} */ (document.querySelector('[data-hero]'));
  if (!hero || calm) return;
  if (matchMedia('(pointer: fine)').matches) {
    let raf = 0;
    hero.addEventListener('pointermove', (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = hero.getBoundingClientRect();
        hero.style.setProperty('--mx', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
        hero.style.setProperty('--my', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
      });
    });
    hero.addEventListener('pointerleave', () => { hero.style.setProperty('--mx', '0'); hero.style.setProperty('--my', '0'); });
  }
})();

// ---- Метки рекламы и источник первого визита (уходят в заказ, без личных данных) ----
(() => {
  const p = new URLSearchParams(location.search);
  const utm = {};
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) if (p.get(k)) utm[k] = p.get(k);
  if (Object.keys(utm).length || !load('mm_src', null)) {
    const ref = document.referrer && !document.referrer.startsWith(location.origin) ? document.referrer.slice(0, 200) : '';
    save('mm_src', { ...utm, referrer: ref, landing: location.pathname.slice(0, 200), at: Date.now() });
  }
})();

// ---- Печать, копирование, «поделиться» ----
document.addEventListener('click', async (e) => {
  const el = /** @type {HTMLElement} */ (e.target);
  if (el.closest('[data-print]')) window.print();
  const copy = el.closest('[data-copy]');
  if (copy) {
    try { await navigator.clipboard.writeText(/** @type {HTMLElement} */ (copy).dataset.copy || ''); toast(t('js.copied')); } catch { /* буфер обмена недоступен */ }
  }
  const share = el.closest('[data-share-link]');
  if (share) {
    const url = /** @type {HTMLElement} */ (share).dataset.shareLink || '';
    const text = /** @type {HTMLElement} */ (share).dataset.shareText || '';
    if (navigator.share) { try { await navigator.share({ text, url }); } catch { /* отменили */ } }
    else { try { await navigator.clipboard.writeText(`${text} ${url}`); toast(t('js.copied')); } catch { /* недоступно */ } }
  }
});
