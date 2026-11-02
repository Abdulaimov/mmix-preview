// Демо-копия сайта: ответы вместо сервера. Корзина и подсказки поиска считаются в браузере по снимку каталога;
// заказ, смета, заявка мастера и вход не отправляются — покупатель видит понятное сообщение, а не ошибку связи.
import { t } from './common.js';
import { previewQuote, previewSuggest } from './preview-core.js';

/** @type {Promise<any>|null} */
let dataPromise = null;
/** Снимок каталога лежит рядом со скриптами: …/static/preview-data.json */
export const loadPreviewData = () => (dataPromise ||= fetch(new URL('../preview-data.json', import.meta.url)).then((r) => r.json()));

/** @param {string} url @param {any} [body] */
export async function previewApi(url, body) {
  const data = await loadPreviewData();
  const [path, search = ''] = url.split('?');
  // Как при настоящем запросе: тело уходит в JSON, пустые поля пропадают
  const b = body === undefined ? undefined : JSON.parse(JSON.stringify(body));
  if (path === '/api/cart/quote') return previewQuote(data, b);
  if (path === '/api/search/suggest') {
    const p = new URLSearchParams(search);
    return previewSuggest(data, p.get('q'), p.get('lang') === 'tg' ? 'tg' : 'ru');
  }
  if (path.startsWith('/api/ref/')) return { valid: false };
  throw Object.assign(new Error(t('js.preview_off')), { status: 503, data: {}, preview: true });
}
