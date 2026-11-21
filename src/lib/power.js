// Power outage schedule. Pure helpers: Львівобленерго parser (poweron.loe.lviv.ua) and the home-page line.
// Other regions plug in through power-providers.js.
// The API gives HTML like «<p>Група 2.2. Електроенергії немає з 00:00 до 00:30, з 18:00 до 21:30.</p>»
// or «Група 2.2. Електроенергія є.» for the day in «Графік погодинних відключень на 21.11.2026».

export const LOE_ORIGIN = 'https://api.loe.lviv.ua';
export const LOE_URL = `${LOE_ORIGIN}/api/menus?page=1&type=photo-grafic`;
export const GROUPS = ['1.1', '1.2', '2.1', '2.2', '3.1', '3.2', '4.1', '4.2', '5.1', '5.2', '6.1', '6.2'];
export const DAY_MIN = 24 * 60;

const toMin = (h, m) => Number(h) * 60 + Number(m);

/** 1110 -> "18:30", 1440 -> "24:00". */
export function fmtMin(min) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** Local date -> "2026-11-21". */
export function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const text = (html) => String(html || '').replace(/<[^>]*>/g, '\n').replace(/&nbsp;/g, ' ');

/** One day's HTML -> { date: "2026-11-21", updated: "07:20", groups: { "2.2": [[0, 30], [1080, 1290]] } } or null. */
export function parseLoeHtml(html) {
  const t = text(html);
  const d = /відключень\s+на\s+(\d{1,2})\.(\d{1,2})\.(\d{4})/i.exec(t);
  if (!d) return null;
  const date = `${d[3]}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}`;
  const u = /станом\s+на\s+(\d{1,2}):(\d{2})/i.exec(t);
  const groups = {};
  for (const line of t.split('\n')) {
    const g = /Група\s+(\d\.\d)\.?\s*(.*)$/i.exec(line.trim());
    if (!g) continue;
    const slots = [];
    for (const m of g[2].matchAll(/з\s+(\d{1,2}):(\d{2})\s+до\s+(\d{1,2}):(\d{2})/gi)) {
      const from = toMin(m[1], m[2]);
      const to = toMin(m[3], m[4]);
      if (from < to && to <= DAY_MIN) slots.push([from, to]);
    }
    // «Електроенергія є» (no slots) -> []; anything unrecognised also ends up as [] only if it says power is on
    if (slots.length || /Електроенергія\s+є/i.test(g[2])) groups[g[1]] = slots.sort((a, b) => a[0] - b[0]);
  }
  if (!Object.keys(groups).length) return null;
  return { date, updated: u ? `${u[1].padStart(2, '0')}:${u[2]}` : '', groups };
}

/** "/media/x_GPV.png" -> "https://api.loe.lviv.ua/media/x_GPV.png"; anything else -> "". */
function loeImage(path) {
  const p = String(path || '');
  if (/^https:\/\//i.test(p)) return p;
  return /^\/media\/[\w.-]+\.(png|jpe?g|webp)$/i.test(p) ? LOE_ORIGIN + p : '';
}

/**
 * API json -> { "2026-11-21": { updated, groups, image }, ... } (today's and tomorrow's items; the archive is skipped).
 * The API answers with a bare array of menus; the older JSON-LD form wraps it in «hydra:member» — both are read.
 * `image` is the full picture of the schedule (all groups), "" when the item has none.
 */
export function parseLoe(json) {
  const out = {};
  const menus = Array.isArray(json) ? json : json && Array.isArray(json['hydra:member']) ? json['hydra:member'] : [];
  for (const menu of menus) {
    for (const item of menu && Array.isArray(menu.menuItems) ? menu.menuItems : []) {
      if (!/^(today|tomorrow)$/i.test(String(item.name || ''))) continue;
      const day = parseLoeHtml(item.rawHtml || item.rawMobileHtml);
      if (day) out[day.date] = { updated: day.updated, groups: day.groups, image: loeImage(item.imageUrl) };
    }
  }
  return out;
}

/** Fresh days replace cached ones; days before `today` are dropped. */
export function mergeDays(cached, fresh, today) {
  const out = {};
  for (const [k, v] of Object.entries({ ...(cached || {}), ...(fresh || {}) })) if (k >= today) out[k] = v;
  return out;
}

const range = ([a, b]) => `${fmtMin(a)}–${fmtMin(b)}`;

/**
 * The home-page line for `now`. slotsToday/slotsTomorrow: arrays of [from, to] minutes or null (unknown).
 * -> { state: 'on' | 'off', text } or null when today's schedule is unknown.
 */
export function homeLine(slotsToday, slotsTomorrow, now) {
  if (!Array.isArray(slotsToday)) return null;
  const min = now.getHours() * 60 + now.getMinutes();
  const cur = slotsToday.find(([a, b]) => a <= min && min < b);
  const later = slotsToday.filter(([a]) => a > min);
  if (cur) {
    let end = fmtMin(cur[1]);
    // off till midnight and tomorrow starts without power: say when it really comes back
    if (cur[1] === DAY_MIN) {
      const first = Array.isArray(slotsTomorrow) ? slotsTomorrow[0] : null;
      end = first && first[0] === 0 ? fmtMin(first[1]) : 'півночі';
    }
    const more = later.length ? ` · ще: ${later.map(range).join(', ')}` : '';
    return { state: 'off', text: `🕯️ Світла немає до ${end}${more}` };
  }
  if (later.length) return { state: 'on', text: `💡 Світло є · сьогодні вимкнуть: ${later.map(range).join(', ')}` };
  return { state: 'on', text: slotsToday.length ? '💡 Світло є · сьогодні більше не вимикатимуть' : '💡 Сьогодні світло не вимикатимуть' };
}
