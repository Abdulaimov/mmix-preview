// Программа для мастеров: заявка с кодом из SMS, вход, заявка на выплату в кабинете.
import { LANG, api, esc, newKey, phoneMask, phoneValue, showErrors, t, toast } from './common.js';

/** Кнопка «Получить код» с обратным отсчётом @param {HTMLFormElement} form @param {'register'|'login'} purpose */
function otpFlow(form, purpose) {
  const phone = /** @type {HTMLInputElement} */ (form.querySelector('[data-phone]'));
  const btn = /** @type {HTMLButtonElement} */ (form.querySelector('[data-send-code]'));
  const sent = /** @type {HTMLElement} */ (form.querySelector('[data-code-sent]'));
  const codeField = /** @type {HTMLElement} */ (form.querySelector('[data-code-field]'));
  phoneMask(phone);
  let timer = 0;
  const countdown = (/** @type {number} */ s) => {
    clearInterval(timer);
    btn.disabled = true;
    btn.textContent = t('js.resend_in', { s });
    timer = window.setInterval(() => {
      s--;
      if (s <= 0) { clearInterval(timer); btn.disabled = false; btn.textContent = t('js.resend'); }
      else btn.textContent = t('js.resend_in', { s });
    }, 1000);
  };
  btn?.addEventListener('click', async () => {
    showErrors(form, null);
    try {
      const r = await api('/api/otp/send', { phone: phoneValue(phone.value), purpose, lang: LANG });
      sent.textContent = purpose === 'login' ? t('js.code_sent_login') : t('js.code_sent', { phone: phoneValue(phone.value) });
      sent.hidden = false;
      codeField.hidden = false;
      form.querySelector('[data-login-submit]')?.removeAttribute('hidden');
      /** @type {HTMLInputElement} */ (codeField.querySelector('input')).focus();
      countdown(r.resendIn || 60);
    } catch (err) {
      const ex = /** @type {any} */ (err);
      if (ex.data?.resendIn) countdown(ex.data.resendIn);
      showErrors(form, ex);
    }
  });
  return { phone };
}

// ---- Заявка ----
const join = /** @type {HTMLFormElement|null} */ (document.querySelector('[data-join]'));
if (join) {
  const { phone } = otpFlow(join, 'register');
  join.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(join);
    const submit = /** @type {HTMLButtonElement} */ (join.querySelector('button[type=submit]'));
    submit.disabled = true;
    try {
      const r = await api('/api/masters/apply', {
        phone: phoneValue(phone.value), code: f.get('code'), fullName: f.get('fullName'), city: f.get('city'),
        specialization: f.get('specialization'), comment: f.get('comment'), consent: f.get('consent') === '1', website: f.get('website'), lang: LANG,
      });
      join.hidden = true;
      const done = /** @type {HTMLElement} */ (document.querySelector('[data-join-done]'));
      /** @type {HTMLElement} */ (done.querySelector('[data-join-no]')).textContent = r.applicationNo;
      done.hidden = false;
      done.scrollIntoView({ block: 'center' });
    } catch (err) { showErrors(join, err); }
    submit.disabled = false;
  });
}

// ---- Вход ----
const login = /** @type {HTMLFormElement|null} */ (document.querySelector('[data-login]'));
if (login) {
  const { phone } = otpFlow(login, 'login');
  login.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api('/api/masters/login', { phone: phoneValue(phone.value), code: new FormData(login).get('code'), lang: LANG });
      location.href = r.cabinet;
    } catch (err) { showErrors(login, err); }
  });
}

// ---- Кабинет: выход ----
document.querySelector('[data-logout]')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  try { const r = await api('/api/masters/logout', { lang: LANG }); location.href = r.url; } catch { location.reload(); }
});

// ---- Кабинет: заявка на выплату в два шага ----
const open = document.querySelector('[data-payout-open]');
const pform = /** @type {HTMLFormElement|null} */ (document.querySelector('[data-payout-form]'));
if (open && pform) {
  const step1 = /** @type {HTMLElement} */ (pform.querySelector('[data-payout-step="1"]'));
  const step2 = /** @type {HTMLElement} */ (pform.querySelector('[data-payout-step="2"]'));
  const detailsField = /** @type {HTMLElement} */ (pform.querySelector('[data-details-field]'));
  const detailsInput = /** @type {HTMLInputElement} */ (detailsField.querySelector('input'));
  const label = /** @type {HTMLElement} */ (pform.querySelector('[data-details-label]'));
  let key = newKey();
  let changeDetails = !pform.dataset.savedMask;
  const methodEl = () => /** @type {HTMLInputElement|null} */ (pform.querySelector('input[name=method]:checked'));
  const sync = () => {
    const m = methodEl();
    const field = m?.dataset.field || 'card';
    const usesSaved = !changeDetails && m?.value === pform.dataset.savedMethod;
    detailsField.hidden = field === 'none' || usesSaved;
    const note = /** @type {HTMLElement|null} */ (pform.querySelector('[data-saved-note]'));
    if (note) note.hidden = !(m?.value === pform.dataset.savedMethod) || changeDetails;
    label.textContent = field === 'phone' ? label.dataset.labelPhone || '' : label.dataset.labelCard || '';
    detailsInput.inputMode = field === 'phone' ? 'tel' : 'numeric';
  };
  pform.addEventListener('change', sync);
  pform.querySelector('[data-change-details]')?.addEventListener('click', () => { changeDetails = true; sync(); detailsInput.focus(); });
  open.addEventListener('click', () => { pform.hidden = false; sync(); pform.scrollIntoView({ block: 'start' }); });
  const mask = () => {
    const field = methodEl()?.dataset.field;
    if (field === 'none') return '—';
    if (detailsField.hidden) return pform.dataset.savedMask || '';
    const d = detailsInput.value.replace(/\D/g, '');
    return d.length >= 4 ? `•••• ${d.slice(-4)}` : '';
  };
  pform.querySelector('[data-payout-next]')?.addEventListener('click', () => {
    const f = new FormData(pform);
    /** @type {Record<string, string>} */
    const fe = {};
    if (String(f.get('recipientName') || '').trim().length < 3) fe.recipientName = t('js.calc_invalid');
    if (!detailsField.hidden && detailsInput.value.replace(/\D/g, '').length < 9) fe.details = t('js.calc_invalid');
    if (Object.keys(fe).length) { showErrors(pform, { status: 422, data: { fieldErrors: fe } }); return; }
    showErrors(pform, null);
    /** @type {HTMLElement} */ (pform.querySelector('[data-confirm-method]')).textContent = methodEl()?.closest('label')?.textContent?.trim() || '';
    /** @type {HTMLElement} */ (pform.querySelector('[data-confirm-recipient]')).textContent = String(f.get('recipientName'));
    /** @type {HTMLElement} */ (pform.querySelector('[data-confirm-mask]')).textContent = mask();
    step1.hidden = true; step2.hidden = false;
  });
  pform.querySelector('[data-payout-back]')?.addEventListener('click', () => { step2.hidden = true; step1.hidden = false; key = newKey(); });
  pform.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = /** @type {HTMLButtonElement} */ (pform.querySelector('button[type=submit]'));
    if (btn.disabled) return;
    btn.disabled = true;
    const f = new FormData(pform);
    try {
      const r = await api('/api/cabinet/payout', {
        idempotencyKey: key, method: methodEl()?.value, recipientName: f.get('recipientName'),
        details: detailsField.hidden ? '' : (methodEl()?.dataset.field === 'phone' ? '+992' + detailsInput.value.replace(/\D/g, '').slice(-9) : detailsInput.value),
      });
      toast(t('js.payout_sent', { no: r.number }));
      setTimeout(() => location.reload(), 600);
    } catch (err) {
      const ex = /** @type {any} */ (err);
      if (ex.status) key = newKey();
      if (ex.data?.fieldErrors) { step2.hidden = true; step1.hidden = false; }
      showErrors(pform, ex);
      btn.disabled = false;
    }
  });
  void esc;
}
