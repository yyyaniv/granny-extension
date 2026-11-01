// Pure logic: choose which stream to open for a schedule entry.

export function normalizeText(s) {
  return String(s == null ? '' : s)
    .replace(/[’ʼ`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('uk');
}

export function splitKeywords(keywords) {
  return String(keywords == null ? '' : keywords)
    .split(';')
    .map(normalizeText)
    .filter(Boolean);
}

const pad = (n) => String(n).padStart(2, '0');

export function localDateKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayKey(today) {
  if (today instanceof Date) return localDateKey(today);
  if (typeof today === 'number') return localDateKey(new Date(today));
  return String(today);
}

/** Find all d.m.yyyy dates in a title, returned as YYYY-MM-DD keys. */
export function parseDatesFromTitle(title) {
  const out = [];
  const re = /(?<!\d)(\d{1,2})\.(\d{1,2})\.(\d{4})(?!\d)/g;
  let m;
  while ((m = re.exec(String(title || '')))) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    const y = Number(m[3]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) out.push(`${y}-${pad(mo)}-${pad(d)}`);
  }
  return out;
}

export function matchesKeywords(title, keywords) {
  const alts = splitKeywords(keywords);
  if (!alts.length) return true;
  const t = normalizeText(title);
  return alts.some((k) => t.includes(k));
}

/**
 * Priority: (1) LIVE matching (prefer today's date in title, else first);
 * (2) non-live matching with today's date in title; (3) null.
 */
export function pickStream(items, keywords, today) {
  if (!Array.isArray(items)) return null;
  const key = todayKey(today);
  const matching = items.filter((i) => i && matchesKeywords(i.title, keywords));
  const live = matching.filter((i) => i.isLive);
  if (live.length) {
    return live.find((i) => parseDatesFromTitle(i.title).includes(key)) || live[0];
  }
  return matching.find((i) => !i.isLive && parseDatesFromTitle(i.title).includes(key)) || null;
}
