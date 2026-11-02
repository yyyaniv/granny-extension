// Folk lunar sowing calendar (pure, offline), in the style of the Ukrainian monthly calendars
// (vikna.tv & co): moon phases with advice, favourable / unfavourable days, favourable days per crop.
// Low-precision Sun/Moon positions (Meeus, ~0.3°). The Moon's sign is used only inside the rules
// (fertile / barren signs, tropical zodiac) and never shown. Tradition, not agronomy.

const RAD = Math.PI / 180;
const DAY = 86400000;
const norm = (x) => ((x % 360) + 360) % 360;
const sin = (deg) => Math.sin(deg * RAD);

/** Ecliptic longitudes (degrees, tropical) of the Sun and the Moon at a moment. */
export function positions(date) {
  const d = date.getTime() / DAY + 2440587.5 - 2451545.0; // days since J2000.0
  const Ms = 357.529 + 0.98560028 * d; // Sun mean anomaly
  const sun = norm(280.459 + 0.98564736 * d + 1.915 * sin(Ms) + 0.020 * sin(2 * Ms));
  const L = 218.316 + 13.176396 * d; // Moon mean longitude
  const Mm = 134.963 + 13.064993 * d; // Moon mean anomaly
  const D = 297.850 + 12.190749 * d; // mean elongation
  const F = 93.272 + 13.229350 * d; // argument of latitude
  const moon = norm(L + 6.289 * sin(Mm) + 1.274 * sin(2 * D - Mm) + 0.658 * sin(2 * D)
    + 0.214 * sin(2 * Mm) - 0.186 * sin(Ms) - 0.114 * sin(2 * F));
  return { sun, moon };
}

/** Moon minus Sun, 0..360: 0 new moon, 180 full moon. */
export const elongation = (date) => { const p = positions(date); return norm(p.moon - p.sun); };

// Sign index (0 = Aries) -> rating. Fertile: Taurus, Cancer, Libra, Scorpio, Sagittarius, Capricorn, Pisces;
// barren: Aquarius; the rest neutral. Matches the published calendars (e.g. November 2026).
const SIGN_RATING = ['neutral', 'good', 'neutral', 'good', 'neutral', 'neutral', 'good', 'good', 'good', 'good', 'bad', 'good'];

export const PHASES = {
  new: { icon: '🌑', name: 'Молодик', advice: 'Нічого не сіяти й не садити. Можна прибирати на городі й відпочивати.' },
  waxing: { icon: '🌒', name: 'Місяць росте', advice: 'Сіяти й садити те, що росте над землею: зелень, помідори, огірки, квіти. Підживлювати.' },
  full: { icon: '🌕', name: 'Повня', advice: 'Не сіяти й не обрізати. Можна збирати врожай, мульчувати, поливати.' },
  waning: { icon: '🌘', name: 'Місяць спадає', advice: 'Коренеплоди, цибуля й часник, обрізка, прополювання, боротьба зі шкідниками.' },
};

// d: {phase, rating}. Rules for the per-crop lists.
const waxing = (d) => d.phase === 'waxing';
const waning = (d) => d.phase === 'waning';
export const CROPS = [
  { id: 'greens', icon: '🥬', name: 'Зелень, салат, капуста, цибуля на перо', ok: (d) => d.rating === 'good' || (d.rating === 'neutral' && waxing(d)) },
  { id: 'fruit', icon: '🍅', name: 'Помідори, огірки, перець, кабачки, горох', ok: (d) => d.rating === 'good' && waxing(d) },
  { id: 'roots', icon: '🥕', name: 'Картопля, морква, буряк, цибуля, часник', ok: (d) => d.rating === 'good' && waning(d) },
  { id: 'flowers', icon: '🌸', name: 'Квіти', ok: (d) => d.rating === 'good' && waxing(d) },
  { id: 'trees', icon: '🌳', name: 'Дерева, кущі, полуниця', ok: (d) => d.rating === 'good' },
  { id: 'prune', icon: '✂️', name: 'Обрізка, прополювання', ok: (d) => d.rating !== 'bad' && waning(d) && !d.nearFull },
];

const ICONS = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];

/** The calendar day containing `date` (local midnight to midnight): { phase, sign, icon }. */
export function moonDay(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  const e0 = elongation(start);
  const e1 = elongation(end);
  let phase;
  if (e1 < e0) phase = 'new'; // passed 360 -> 0 during the day
  else if (e0 < 180 && e1 >= 180) phase = 'full';
  else phase = e0 < 180 ? 'waxing' : 'waning';
  // sign at noon; on days when the Moon changes sign around midday printed calendars may differ by a day
  const sign = Math.floor(positions(new Date(start.getTime() + DAY / 2)).moon / 30) % 12;
  const k = Math.round(((e0 + (e1 < e0 ? e1 + 360 : e1)) / 2 % 360) / 45);
  const icon = phase === 'new' ? '🌑' : phase === 'full' ? '🌕'
    : ICONS[phase === 'waxing' ? Math.min(3, Math.max(1, k)) : Math.min(7, Math.max(5, k))];
  return { phase, sign, icon };
}

/**
 * One day with its rating: 'bad' on the new moon and a day either side, on the full moon and with the
 * Moon in a barren sign; otherwise 'good' / 'neutral' by sign. -> { phase, icon, rating, nearFull }
 */
export function rateDay(date) {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  const md = moonDay(date);
  const prev = moonDay(new Date(y, m, d - 1, 12));
  const next = moonDay(new Date(y, m, d + 1, 12));
  const nearNew = md.phase === 'new' || prev.phase === 'new' || next.phase === 'new';
  const nearFull = md.phase === 'full' || prev.phase === 'full' || next.phase === 'full';
  const rating = nearNew || md.phase === 'full' ? 'bad' : SIGN_RATING[md.sign];
  return { phase: md.phase, icon: md.icon, rating, nearFull };
}

/** [6,7,11,12,13,14] -> "6, 7, 11–14" (runs of 3+ days as a range). */
export function formatDays(list) {
  const out = [];
  for (let i = 0; i < list.length;) {
    let j = i;
    while (j + 1 < list.length && list[j + 1] === list[j] + 1) j++;
    if (j - i >= 2) out.push(`${list[i]}–${list[j]}`);
    else for (let k = i; k <= j; k++) out.push(String(list[k]));
    i = j + 1;
  }
  return out.join(', ');
}

/**
 * A whole month (month 0..11):
 * { days: [{day, phase, icon, rating}], good: [..], bad: [..], phases: {new: [..], ...}, crops: [{...crop, days}] }
 */
export function monthCalendar(year, month) {
  const n = new Date(year, month + 1, 0).getDate();
  const days = [];
  for (let i = 1; i <= n; i++) days.push({ day: i, ...rateDay(new Date(year, month, i, 12)) });
  const pick = (f) => days.filter(f).map((x) => x.day);
  return {
    days,
    good: pick((x) => x.rating === 'good'),
    bad: pick((x) => x.rating === 'bad'),
    phases: Object.fromEntries(Object.keys(PHASES).map((k) => [k, pick((x) => x.phase === k)])),
    crops: CROPS.map((c) => ({ ...c, days: pick(c.ok) })),
  };
}
