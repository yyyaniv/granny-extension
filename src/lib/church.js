// Church holidays (pure, offline). Since 1 Sept 2023 the OCU and the UGCC keep fixed feasts by the
// New Julian calendar (= civil dates until 2800); some parishes keep the old style (Julian, +13 days now).
// Easter (and everything counted from it) is still Julian Paschalion in both styles.

import { CHURCH_STYLES as STYLES } from './config.js';

// UGCC calendar (names and the Church's own feasts). [month, day, name] by the new style.
const FIXED = [
  [1, 1, 'Обрізання Господнє, свт. Василія Великого'],
  [1, 5, 'Навечірʼя Богоявлення (другий Святвечір)'],
  [1, 6, 'Богоявлення Господнє (Йордан)'],
  [2, 2, 'Стрітення Господнє'],
  [3, 25, 'Благовіщення Пресвятої Богородиці'],
  [4, 23, 'Святого великомученика Юрія'],
  [6, 24, 'Різдво Івана Хрестителя'],
  [6, 29, 'Святих апостолів Петра і Павла'],
  [8, 1, 'Винесення Чесного Хреста (Маковія)'],
  [8, 6, 'Преображення Господнє (Спаса)'],
  [8, 15, 'Успіння Пресвятої Богородиці'],
  [8, 29, 'Усікновення глави Івана Хрестителя'],
  [9, 8, 'Різдво Пресвятої Богородиці'],
  [9, 14, 'Воздвиження Чесного Хреста'],
  [10, 1, 'Покрова Пресвятої Богородиці'],
  [11, 12, 'Святого священномученика Йосафата'],
  [11, 21, 'Введення в храм Пресвятої Богородиці'],
  [11, 30, 'Святого апостола Андрія'],
  [12, 6, 'Святого Миколая Чудотворця'],
  [12, 9, 'Зачаття Пресвятої Богородиці святою Анною'],
  [12, 24, 'Святвечір'],
  [12, 25, 'Різдво Христове'],
  [12, 26, 'Собор Пресвятої Богородиці'],
];

// [days from Easter, name]
const MOVABLE = [
  [-48, 'Початок Великого посту'],
  [-7, 'Вхід Господній у Єрусалим (Квітна неділя)'],
  [-3, 'Великий четвер'],
  [-2, 'Страсна пʼятниця'],
  [0, 'Воскресіння Христове (Великдень)'],
  [7, 'Провідна (Томина) неділя'],
  [39, 'Вознесіння Господнє'],
  [49, 'Зіслання Святого Духа (Трійця)'],
  [60, 'Свято Пресвятої Євхаристії'],
];

// Fasts (UGCC). Fixed ones: [from month, day, to month, day, name] by the new style (Пилипівка and the
// one-day fasts); Великий піст and Петрів піст depend on Easter. Weekly Friday fasts are not shown.
const FIXED_FASTS = [
  [1, 5, 1, 5, 'Строгий піст (Навечірʼя Богоявлення)'],
  [8, 1, 8, 14, 'Успенський піст'],
  [8, 29, 8, 29, 'Строгий піст (Усікновення)'],
  [9, 14, 9, 14, 'Строгий піст (Воздвиження)'],
  [11, 15, 12, 24, 'Різдвяний піст (Пилипівка)'],
];

const DAY = 86400000;
const atNoon = (y, m, d) => new Date(y, m - 1, d, 12);
const ymd = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/** Julian -> civil (Gregorian) shift in days for that year: 13 for 1900–2099. */
export function julianShift(year) {
  return Math.floor(year / 100) - Math.floor(year / 400) - 2;
}

/** Orthodox (and Greek-Catholic) Easter as a civil date (local noon). */
export function easter(year) {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  return atNoon(year, month, day + julianShift(year)); // Date rolls over month ends
}

/** All feasts of a civil year: [{date, name}], sorted. style: 'new' | 'old'. */
export function feastsOfYear(year, style = 'new') {
  const out = [];
  const shift = style === 'old' ? julianShift(year) : 0;
  // old style: a feast on Julian day X of year Y falls on X+13; late-December ones move into January of
  // the next year, so take the previous year's too and keep only this year's dates.
  for (const y of style === 'old' ? [year - 1, year] : [year]) {
    for (const [m, d, name] of FIXED) {
      const date = atNoon(y, m, d + shift);
      if (date.getFullYear() === year) out.push({ date, name });
    }
  }
  const e = easter(year);
  for (const [k, name] of MOVABLE) out.push({ date: new Date(e.getTime() + k * DAY), name });
  return out.sort((x, y) => x.date - y.date);
}

/** All fasts touching a civil year: [{from, to, name}] (local noons, inclusive). */
export function fastsOfYear(year, style = 'new') {
  const shift = style === 'old' ? julianShift(year) : 0;
  const out = [];
  for (const y of [year - 1, year]) {
    for (const [m1, d1, m2, d2, name] of FIXED_FASTS) out.push({ from: atNoon(y, m1, d1 + shift), to: atNoon(y, m2, d2 + shift), name });
  }
  const e = easter(year);
  out.push({ from: new Date(e.getTime() - 48 * DAY), to: new Date(e.getTime() - DAY), name: 'Великий піст' });
  // Петрів піст: from the Monday after All Saints' Sunday (Easter + 57) to the eve of Peter and Paul
  const peterFrom = new Date(e.getTime() + 57 * DAY);
  const peterTo = atNoon(year, 6, 28 + shift);
  if (peterFrom <= peterTo) out.push({ from: peterFrom, to: peterTo, name: 'Петрів піст' });
  return out.filter((f) => f.to.getFullYear() >= year && f.from.getFullYear() <= year);
}

/** Name of the fast on this day, or null ('off' style: always null). */
export function fastOn(date, style = 'new') {
  if (!STYLES.includes(style) || style === 'off') return null;
  const t = atNoon(date.getFullYear(), date.getMonth() + 1, date.getDate()).getTime();
  const hit = fastsOfYear(date.getFullYear(), style).filter((f) => t >= f.from.getTime() && t <= f.to.getTime());
  // a strict one-day fast inside a longer one (24 Dec, 5 Jan) is named after the one-day fast
  hit.sort((a, b) => (a.to - a.from) - (b.to - b.from));
  return hit.length ? hit[0].name : null;
}

/**
 * What to show on the home page for `now`: today's feast, else the nearest one within `ahead` days.
 * -> { names: [..], days: 0..ahead } or null.
 */
export function feastNotice(now, style = 'new', ahead = 3) {
  if (!STYLES.includes(style) || style === 'off') return null;
  const today = atNoon(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const all = [...feastsOfYear(today.getFullYear(), style), ...feastsOfYear(today.getFullYear() + 1, style)];
  for (let k = 0; k <= ahead; k++) {
    const day = ymd(new Date(today.getTime() + k * DAY));
    const names = all.filter((f) => ymd(f.date) === day).map((f) => f.name);
    if (names.length) return { names, days: k };
  }
  return null;
}

/** "🕯 Сьогодні: Покрова…" / "🕯 Завтра: …" / "🕯 Через 3 дні: …" */
export function feastLine(n) {
  if (!n) return '';
  const when = n.days === 0 ? 'Сьогодні' : n.days === 1 ? 'Завтра' : `Через ${n.days} ${n.days < 5 ? 'дні' : 'днів'}`;
  return `🕯 ${when}: ${n.names.join(', ')}`;
}
