// Подпись к цене: «за мешок 25 кг», «за тубу 400 мл», «барои тубаи 400 мл» — а не «за туба туба 400 мл».
// Общая для сервера (карточки, страница товара) и браузера (корзина).

/** После «за» по-русски винительный падеж: за канистру, за тубу (мешок, ведро, рулон, комплект не меняются) @type {Record<string, string>} */
const ACC_RU = { канистра: 'канистру', туба: 'тубу', банка: 'банку', коробка: 'коробку', упаковка: 'упаковку', пачка: 'пачку', бочка: 'бочку', бутылка: 'бутылку' };

/** Единица продажи после «за» @param {string} lang @param {string} unit */
export function unitAfterPer(lang, unit) {
  const u = String(unit || '');
  return (lang === 'ru' && ACC_RU[u.toLowerCase()]) || u;
}

/**
 * Слова для шаблона «за {unit} {pack}». Если фасовка уже начинается с единицы («туба 400 мл», «рулони 10 м») — единицу не повторяем.
 * @param {string} lang @param {string} unit @param {string} pack
 * @returns {{ unit: string, pack: string }}
 */
export function perParts(lang, unit, pack) {
  const u = String(unit || ''), p = String(pack || '');
  if (!u || !p.toLowerCase().startsWith(u.toLowerCase())) return { unit: unitAfterPer(lang, u), pack: p };
  // По-таджикски «тубаи 400 мл» уже с изафетом — оставляем фасовку целиком
  if (lang !== 'ru') return { unit: '', pack: p };
  return { unit: unitAfterPer(lang, u), pack: p.slice(u.length).trim() };
}
