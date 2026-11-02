// Поиск по каталогу: названия на русском и таджикском, артикулы, коды классов в любой записи
// («C2TES1», «c2 te s1», «С2 ТЕ S1» кириллицей), категории и назначение.

const TJ_FOLD = { ҳ: 'х', қ: 'к', ғ: 'г', ӯ: 'у', ӣ: 'и', ҷ: 'ч', ё: 'е', й: 'и' };

// Текст для сравнения: строчные, без таджикских диакритик и ё, только буквы и цифры
/** @param {any} s */
export function foldText(s) {
  return String(s || '').toLowerCase().replace(/[ҳқғӯӣҷёй]/g, (c) => TJ_FOLD[c])
    .replace(/[^a-z0-9а-я]+/g, ' ').trim();
}

// Кириллические буквы, похожие на латинские в маркировках. «Р» читается как «R» (R1–R4).
const CODE_MAP = { А: 'A', В: 'B', С: 'C', Е: 'E', Н: 'H', К: 'K', М: 'M', О: 'O', Р: 'R', Т: 'T', Х: 'X', Ѕ: 'S' };
/** @param {any} s */
export function codeKey(s) {
  return String(s || '').toUpperCase().replace(/[АВСЕНКМОРТХЅ]/g, (c) => CODE_MAP[c]).replace(/[^A-Z0-9]/g, '');
}

// Набрано в английской раскладке вместо русской: «rktq» → «клей»
const EN = 'qwertyuiop[]asdfghjkl;\'zxcvbnm,.`';
const RU = 'йцукенгшщзхъфывапролджэячсмитьбюё';
/** @param {string} s */
export function swapLayout(s) {
  return s.toLowerCase().split('').map((c) => { const i = EN.indexOf(c); return i >= 0 ? RU[i] : c; }).join('');
}

// Простая основа слова для русских и таджикских окончаний: «шпаклёвку» → «шпаклев», «ширешҳо» → «шире»
/** @param {string} w */
function stem(w) {
  if (w.length > 6) return w.slice(0, w.length - 2);
  if (w.length > 4) return w.slice(0, w.length - 1);
  return w;
}

/**
 * @param {{ codes: string[], text: string, title: string }} doc
 * @param {string} query
 * @returns {number} 0 — не найдено
 */
export function scoreDoc(doc, query) {
  const q = String(query || '').trim();
  if (!q) return 1;
  let score = 0;
  const qc = codeKey(q);
  // Коды: «C2TES1» найдёт «C2 TE S1 Super Flex». Кириллическая «С» похожа и на C, и на S
  // («С2 ТЕ С1»), поэтому дополнительно сравниваем коды, где S и C не различаются.
  if (qc.length >= 2 && /\d/.test(qc)) {
    const loose = (/** @type {string} */ x) => x.replace(/S/g, 'C');
    const ql = loose(qc);
    for (const c of doc.codes) {
      const cl = loose(c);
      if (c === qc) score = Math.max(score, 120);
      else if (cl === ql) score = Math.max(score, 110);
      else if (c.startsWith(qc) || cl.startsWith(ql)) score = Math.max(score, 90);
      else if (c.includes(qc) || cl.includes(ql)) score = Math.max(score, 60);
    }
  }
  const words = doc.text.split(' ');
  const titleWords = doc.title.split(' ');
  const tokens = foldText(q).split(' ').filter((x) => x.length >= 2 || /\d/.test(x));
  if (tokens.length) {
    let all = true, textScore = 0;
    for (const tok of tokens) {
      const st = stem(tok);
      const inTitle = titleWords.some((w) => w.startsWith(st));
      const inText = inTitle || words.some((w) => w.startsWith(st));
      const inCode = doc.codes.some((c) => c.includes(codeKey(tok)) && codeKey(tok).length >= 2);
      if (!inText && !inCode) { all = false; break; }
      textScore += inTitle ? 20 : inCode ? 15 : 5;
    }
    if (all) score = Math.max(score, textScore);
  }
  return score;
}

/**
 * @template T
 * @param {T[]} items
 * @param {(item: T) => { codes: string[], text: string, title: string }} toDoc
 * @param {string} query
 */
export function searchItems(items, toDoc, query) {
  const run = (/** @type {string} */ q) => items
    .map((item) => ({ item, score: scoreDoc(toDoc(item), q) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  let res = run(query);
  let corrected = null;
  if (!res.length && /[a-z]/i.test(query) && !/\d/.test(query)) {
    const swapped = swapLayout(query);
    res = run(swapped);
    if (res.length) corrected = swapped;
  }
  return { results: res.map((x) => x.item), scores: new Map(res.map((x) => [x.item, x.score])), corrected };
}
