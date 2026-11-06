// Калькулятор ремонта на странице: читает форму, считает (repair-calc.js) и показывает список материалов.
// Пересчёт — при каждом изменении; введённое запоминается в этом браузере.
import { BASE, LANG, ROOT, api, cart, errText, esc, load, money, save, t, toast } from './common.js';
import { PRESETS, candidates, plan, totals } from './repair-calc.js';
import { packLabel } from './calc-packs.js';

const form = /** @type {HTMLFormElement|null} */ (document.querySelector('[data-rc]'));
if (form) init(form);

/** @param {HTMLFormElement} form */
function init(form) {
  const data = JSON.parse(document.getElementById('rc-data')?.textContent || '{"products":[]}');
  /** @type {any[]} */
  const products = data.products;
  const byId = (/** @type {number} */ id) => products.find((p) => p.id === id);
  const el = (/** @type {string} */ name) => /** @type {HTMLInputElement} */ (form.elements.namedItem(name));
  const val = (/** @type {string} */ name) => (el(name) ? Number(String(el(name).value).replace(',', '.')) : 0);
  const on = (/** @type {string} */ name) => !!el(name)?.checked;
  const num = (/** @type {number} */ n, d = 1) => n.toLocaleString('ru-RU', { maximumFractionDigits: d });
  const linesBox = /** @type {HTMLElement} */ (document.querySelector('[data-rc-lines]'));
  const notesBox = /** @type {HTMLElement} */ (document.querySelector('[data-rc-notes]'));
  const totalBox = /** @type {HTMLElement} */ (document.querySelector('[data-rc-total]'));
  const areasBox = /** @type {HTMLElement} */ (document.querySelector('[data-rc-areas]'));
  const roomBox = /** @type {HTMLElement|null} */ (document.querySelector('[data-rc-room]'));
  const addBtn = /** @type {HTMLButtonElement} */ (document.querySelector('[data-rc-add]'));
  const shareBtn = /** @type {HTMLButtonElement} */ (document.querySelector('[data-rc-share]'));
  const STORE = 'mm_rc';
  /** @type {any} */
  let last = null;
  /** @type {Record<string, number>} */
  const prevQty = {};
  let shown = new Set();

  // ---- Состояние формы: сохранить и восстановить ----
  const fields = () => /** @type {HTMLInputElement[]} */ ([...form.elements]).filter((x) => x.name);
  const snapshot = () => Object.fromEntries(fields().map((x) => [x.name, x.type === 'checkbox' ? x.checked : x.type === 'radio' ? (x.checked ? x.value : undefined) : x.value]).filter(([, v]) => v !== undefined));
  function restore() {
    const s = load(STORE, null);
    if (!s || typeof s !== 'object') { applyPreset('bath'); return; }
    for (const x of fields()) {
      if (!(x.name in s)) continue;
      if (x.type === 'checkbox') x.checked = !!s[x.name];
      else if (x.type === 'radio') x.checked = x.value === s[x.name];
      else x.value = String(s[x.name]);
    }
    // Запас теперь выбирают из списка: если сохранилось другое значение — обычные 10 %
    const reserve = /** @type {HTMLSelectElement|null} */ (form.querySelector('select[name=reserve]'));
    if (reserve && reserve.selectedIndex < 0) reserve.value = '10';
  }

  /** @param {string} key */
  function applyPreset(key) {
    const p = /** @type {any} */ (PRESETS)[key];
    const set = (/** @type {string} */ name, /** @type {boolean} */ v) => { if (el(name)) el(name).checked = v; };
    if (!p) { for (const n of ['tile_on', 'primer_on', 'wp_on', 'tape_on', 'plaster_on', 'base_on', 'finish_on', 'grout_on']) set(n, false); return; }
    set('wet', p.wet); set('heated', p.heated);
    set('tile_on', p.tile.floor || p.tile.walls); set('tile_floor', p.tile.floor); set('tile_walls', p.tile.walls);
    set('primer_on', p.primer.on); set('primer_floor', p.primer.floor); set('primer_walls', p.primer.walls);
    set('wp_on', p.waterproof.on); set('tape_on', p.tape.on);
    set('plaster_on', p.plaster.on); set('base_on', p.base.on); set('finish_on', p.finish.on); set('grout_on', p.grout.on);
  }

  function readInput() {
    return {
      room: { length: val('length'), width: val('width'), height: val('height'), openings: val('openings') },
      wet: on('wet'), heated: on('heated'), reserve: val('reserve'),
      tile: { floor: on('tile_on') && on('tile_floor'), walls: on('tile_on') && on('tile_walls'), size: val('tile_size'), mm: val('adh_mm'), productId: val('adh_product') },
      primer: { on: on('primer_on'), floor: on('primer_floor'), walls: on('primer_walls'), layers: val('primer_layers') },
      waterproof: { on: on('wp_on'), overlapCm: val('wp_overlap'), showerM2: val('wp_shower'), layers: val('wp_layers'), layerMm: val('wp_mm') },
      tape: { on: on('tape_on') },
      plaster: { on: on('plaster_on'), mm: val('plaster_mm'), productId: val('plaster_product') },
      base: { on: on('base_on'), mm: val('base_mm'), productId: val('base_product') },
      finish: { on: on('finish_on'), mm: val('finish_mm'), productId: val('finish_product') },
      grout: { on: on('grout_on'), variantId: val('grout_variant'), qty: val('grout_qty') },
    };
  }

  // ---- Выбор материала: что не подходит или без данных о расходе — недоступно ----
  /** @param {any} input @param {any} res */
  function updatePickers(input, res) {
    for (const [name, role] of [['adh_product', 'adhesive'], ['plaster_product', 'plaster'], ['base_product', 'base'], ['finish_product', 'finish']]) {
      const sel = /** @type {HTMLSelectElement|null} */ (form.elements.namedItem(name));
      if (!sel) continue;
      const info = new Map(candidates(products, role, input).map((c) => [c.p.id, c]));
      const line = res.lines.find((/** @type {any} */ l) => l.role === role);
      for (const opt of [...sel.options]) {
        if (!opt.value) { opt.textContent = line && !Number(sel.value) ? t('js.rc_auto_is', { name: byId(line.productId)?.title || '' }) : t('js.rc_auto'); continue; }
        const c = info.get(Number(opt.value));
        const p = byId(Number(opt.value));
        const tag = !c ? '' : c.fit === 'no' ? t('js.rc_tag_no') : !c.computable ? t('js.rc_tag_nocalc') : c.fit === 'unknown' ? t('js.rc_tag_unknown') : '';
        opt.textContent = tag ? `${p?.title} — ${tag}` : p?.title || '';
        opt.disabled = !c || c.fit === 'no' || !c.computable;
      }
      if (sel.selectedOptions[0]?.disabled) sel.value = '';
    }
  }

  const condText = (/** @type {string} */ cond, /** @type {any} */ input) => (cond === 'tile' ? t('js.rc_c_tile', { mm: input.tile.size }) : t(`js.rc_c_${cond}`));

  /** @param {any} l */
  function formula(l) {
    const f = l.formula;
    if (!f) return '';
    const kk = num(f.k, 2);
    if (f.kind === 'thickness') return `${num(f.area)} м² × ${num(f.mm)} мм × ${num(f.rate, 2)} кг/м²·мм${f.layers > 1 ? ` × ${f.layers}` : ''} × ${kk} = ${num(f.need)} кг → ${num(f.need)} ÷ ${num(f.pack)} = ${num(f.need / f.pack, 2)} → <b>${l.qty}</b>`;
    if (f.kind === 'layers') return `${num(f.area)} м² × ${f.layers} × ${f.rateMin}–${f.rateMax} мл/м² × ${kk} = ${num(f.min)}–${num(f.max)} л → ÷ ${num(f.pack)} → <b>${l.qtyMin === l.qty ? l.qty : `${l.qtyMin}–${l.qty}`}</b>`;
    return `(${num(f.perimeter)} м + 4 × ${num(f.overlap, 2)} м) × ${kk} = ${num(f.need)} м → ÷ ${num(f.pack)} = ${num(f.need / f.pack, 2)} → <b>${l.qty}</b>`;
  }

  /** @param {any} input */
  function render(input) {
    const res = plan(input, products);
    last = { input, res };
    form.querySelectorAll('[aria-invalid]').forEach((x) => x.removeAttribute('aria-invalid'));
    if (res.errors.length) {
      for (const n of res.errors) el(n)?.setAttribute('aria-invalid', 'true');
      areasBox.textContent = '';
      linesBox.innerHTML = `<p class="field__err">${esc(t('js.rc_bad_size'))}</p>`;
      notesBox.innerHTML = ''; totalBox.innerHTML = '';
      addBtn.disabled = true; shareBtn.disabled = true;
      return;
    }
    const A = res.areas;
    areasBox.innerHTML = [[t('js.rc_floor'), `${num(A.floor, 2)} м²`], [t('js.rc_walls'), `${num(A.walls, 2)} м²`], [t('js.rc_perimeter'), `${num(A.perimeter, 2)} м`]]
      .map(([k, v]) => `<span><small>${esc(k)}</small> <b>${esc(v)}</b></span>`).join('');
    if (roomBox) {
      const L = input.room.length, W = input.room.width;
      roomBox.style.aspectRatio = `${Math.max(0.25, Math.min(4, L / W))}`;
      /** @type {HTMLElement} */ (roomBox.querySelector('[data-rc-dim-l]')).textContent = `${num(L, 2)} м`;
      /** @type {HTMLElement} */ (roomBox.querySelector('[data-rc-dim-w]')).textContent = `${num(W, 2)} м`;
    }
    updatePickers(input, res);

    if (!res.lines.length) linesBox.innerHTML = `<p class="note">${esc(t('js.rc_empty'))}</p>`;
    else linesBox.innerHTML = res.lines.map((/** @type {any} */ l) => {
      const p = byId(l.productId), v = p.variants.find((/** @type {any} */ x) => x.id === l.variantId);
      const conds = l.checks.filter((/** @type {any} */ c) => c.cond !== 'interior');
      const chips = conds.map((/** @type {any} */ c) => `<span class="rcchip rcchip--${c.fit}">${c.fit === 'yes' ? '✓' : '?'} ${esc(condText(c.cond, input))}</span>`).join('');
      let qty = '';
      if (l.error) qty = `<p class="rcline__err">${esc(l.error.code === 'thickness' ? t('js.rc_err_thickness', { range: [l.error.min, l.error.max].map((x) => (x == null ? '…' : num(x))).join('–') })
        : l.error.code === 'layers' ? t('js.rc_err_layers', { range: `${l.error.min}–${l.error.max}` }) : t('js.rc_err_other'))}</p>`;
      else if (l.manual) qty = `<div class="rcline__qty"><div class="qty qty--sm"><button type="button" class="qty__btn" data-grout-step="-1" aria-label="−">−</button><b class="rcline__n">${l.qty}</b><button type="button" class="qty__btn" data-grout-step="1" aria-label="+">+</button></div> × ${esc(packLabel(v))}</div><p class="rcline__hint">${esc(t('js.rc_grout_manual'))}</p>`;
      else {
        const f = l.formula;
        const need = f.kind === 'layers' ? t('js.calc_range', { min: num(f.min), max: num(f.max) }) : num(f.need);
        const bump = prevQty[l.role] !== undefined && prevQty[l.role] !== l.qty ? ' is-bump' : '';
        qty = `<div class="rcline__qty"><b class="rcline__n${bump}">${l.qtyMin != null && l.qtyMin !== l.qty ? `${l.qtyMin}–${l.qty}` : l.qty}</b> × ${esc(packLabel(v))} <span class="rcline__need">≈ ${need} ${f.unit}</span></div>
          <details class="rcline__how"><summary>${esc(t('js.calc_formula'))}</summary><div class="calc__formula">${formula(l)}</div></details>`;
      }
      prevQty[l.role] = l.qty;
      const price = v.price_minor == null ? `<span class="rcline__price rcline__price--req">${esc(t('js.rc_on_request'))}</span>`
        : l.qty > 0 ? `<span class="rcline__price">${esc(money(v.price_minor * l.qty))}${v.price_confirmed ? '' : '<sup>*</sup>'}</span>` : '';
      return `<article class="rcline${l.error ? ' rcline--err' : ''}${shown.has(l.role) ? '' : ' is-new'}">
        <a class="rcline__img" href="${esc(p.url)}" tabindex="-1" aria-hidden="true">${p.image ? `<img src="${ROOT}/media/${esc(p.image)}-480.webp" alt="" loading="lazy">` : ''}</a>
        <div class="rcline__body">
          <span class="rcline__work">${esc(t(`js.rc_w_${l.role}`))}</span>
          <a class="rcline__name" href="${esc(p.url)}">${esc(p.title)}${l.role === 'grout' && v.name ? ` · ${esc(v.name)}` : ''}</a>
          ${chips ? `<div class="rcchips">${chips}</div>` : ''}
          ${qty}
        </div>
        ${price}
      </article>`;
    }).join('');
    // Появляются плавно только новые строки — при вводе цифр список не мигает
    shown = new Set(res.lines.map((/** @type {any} */ l) => l.role));

    // Пояснения: чего нет в каталоге и что нельзя посчитать
    /** @type {string[]} */
    const notes = [];
    for (const n of res.notes) {
      const work = t(`js.rc_w_${n.role}`);
      if (n.code === 'no_confirmed') notes.push(t('js.rc_note_no_confirmed', { work, list: n.unknown.map((/** @type {number} */ id) => byId(id)?.title).join(', ') }));
      else if (n.code === 'no_product') notes.push(t('js.rc_note_no_product', { work }));
      else notes.push(t(`js.rc_note_${n.code}`));
    }
    for (const l of res.lines) if (l.noCalc?.length) notes.push(t('js.rc_note_nocalc', { list: l.noCalc.map((/** @type {number} */ id) => byId(id)?.title).join(', ') }));
    notesBox.innerHTML = notes.map((x) => `<p class="rcnote">${esc(x)}</p>`).join('');

    const tt = totals(res.lines, products);
    totalBox.innerHTML = tt.items ? `<div class="rcres__sum"><span>${esc(t('js.rc_total'))}</span><b>${esc(money(tt.sum))}</b></div>
      <p class="note">${esc(input.reserve ? t('js.rc_reserve_note', { n: input.reserve }) : t('js.rc_no_reserve'))}</p>
      ${tt.unpriced ? `<p class="note">${esc(t('js.rc_unpriced', { n: tt.unpriced }))}</p>` : ''}
      ${tt.unconfirmed ? `<p class="note">* ${esc(t('js.rc_prelim'))}</p>` : ''}` : '';
    const buyable = res.lines.some((/** @type {any} */ l) => l.qty > 0 && byId(l.productId)?.variants.find((/** @type {any} */ x) => x.id === l.variantId)?.canBuy);
    addBtn.disabled = !buyable; shareBtn.disabled = !buyable;
    // Панель внизу телефона: итог виден, пока список материалов за пределами экрана
    if (bar) {
      /** @type {HTMLElement} */ (bar.querySelector('[data-rc-bar-sum]')).textContent = tt.items ? money(tt.sum) : '';
      /** @type {HTMLElement} */ (bar.querySelector('[data-rc-bar-n]')).textContent = t('js.rc_bar_items', { n: tt.items });
      barHasItems = tt.items > 0;
      bar.hidden = !barHasItems || resVisible;
    }
  }
  const bar = /** @type {HTMLElement|null} */ (document.querySelector('[data-rc-bar]'));
  let barHasItems = false, resVisible = false;
  const resBox = document.querySelector('.rcres__in');
  if (bar && resBox && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { resVisible = e.isIntersecting; bar.hidden = !barHasItems || resVisible; }).observe(resBox);
  }

  // ---- События ----
  const sync = () => {
    form.querySelectorAll('.rcwork').forEach((w) => w.classList.toggle('is-on', !!/** @type {HTMLInputElement} */ (w.querySelector('.rcwork__head input'))?.checked));
    render(readInput());
    save(STORE, snapshot());
  };
  form.addEventListener('change', (e) => {
    const x = /** @type {HTMLInputElement} */ (e.target);
    if (x.name === 'preset') applyPreset(x.value);
    // Работы поменяли вручную — это уже свой набор
    else if (x.closest('.rcwork__head')) { const custom = /** @type {HTMLInputElement|null} */ (form.querySelector('input[name=preset][value=custom]')); if (custom) custom.checked = true; }
    sync();
  });
  let timer = 0;
  form.addEventListener('input', () => { clearTimeout(timer); timer = window.setTimeout(sync, 120); });
  form.addEventListener('submit', (e) => e.preventDefault());

  linesBox.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('[data-grout-step]');
    if (!b || !el('grout_qty')) return;
    el('grout_qty').value = String(Math.max(0, Math.min(999, val('grout_qty') + Number(/** @type {HTMLElement} */ (b).dataset.groutStep))));
    sync();
  });

  const buyLines = () => (last?.res.lines || []).map((/** @type {any} */ l) => ({ l, v: byId(l.productId)?.variants.find((/** @type {any} */ x) => x.id === l.variantId) }))
    .filter((/** @type {any} */ x) => x.l.qty > 0 && x.v?.canBuy);
  addBtn.addEventListener('click', () => {
    const items = buyLines();
    for (const { l, v } of items) cart.add(v.id, l.qty, v.price_minor);
    toast(t('js.rc_added', { n: items.length }), { href: `${BASE}/cart`, label: t('js.go_cart') });
  });
  shareBtn.addEventListener('click', async () => {
    const items = buyLines().map((/** @type {any} */ x) => ({ variantId: x.v.id, qty: x.l.qty }));
    if (!items.length) return;
    shareBtn.disabled = true;
    try {
      const res = await api('/api/estimates', { items, lang: LANG });
      const url = new URL(res.url, location.origin).href;
      if (navigator.share) { try { await navigator.share({ title: t('js.rc_share_title'), url }); return; } catch { /* отменили — копируем */ } }
      try { await navigator.clipboard.writeText(url); } catch { /* буфер недоступен */ }
      toast(t('js.estimate_link'), { href: res.url, label: '↗' });
    } catch (err) { toast(errText(err)); } finally { shareBtn.disabled = false; }
  });

  restore();
  sync();
}
