// «Стать партнёром»: отправка заявки. В демо-копии сайта заявка не уходит — форма покажет это сообщением.
import { LANG, api, phoneMask, phoneValue, showErrors, t } from './common.js';

const form = /** @type {HTMLFormElement|null} */ (document.querySelector('[data-partner]'));
if (form) {
  const phone = /** @type {HTMLInputElement} */ (form.querySelector('[data-phone]'));
  phoneMask(phone);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const submit = /** @type {HTMLButtonElement} */ (form.querySelector('button[type=submit]'));
    submit.disabled = true;
    showErrors(form, null);
    try {
      const r = await api('/api/partners/apply', {
        contactName: f.get('contactName'), phone: phoneValue(phone.value), storeName: f.get('storeName'), city: f.get('city'),
        address: f.get('address'), comment: f.get('comment'), consent: f.get('consent') === '1', website: f.get('website'), lang: LANG,
      });
      form.hidden = true;
      const done = /** @type {HTMLElement} */ (document.querySelector('[data-partner-done]'));
      /** @type {HTMLElement} */ (done.querySelector('[data-partner-no]')).textContent = t('js.partner_sent', { no: r.applicationNo });
      done.hidden = false;
      done.scrollIntoView({ block: 'center' });
    } catch (err) { showErrors(form, err); }
    submit.disabled = false;
  });
}
