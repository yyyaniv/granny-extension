// Pure schedule math. Days use JS getDay(): 0 = Sunday ... 6 = Saturday.

const MIN = 60000;

export function parseTime(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t == null ? '' : t).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return { h, min };
}

function warnOf(entry) {
  const w = Number(entry.warnMinutes);
  return Number.isFinite(w) && w >= 0 ? w : 3;
}

/** Next start timestamp strictly after `now`, or null. */
export function nextStart(entry, now) {
  if (!entry || entry.enabled === false) return null;
  const t = parseTime(entry.time);
  if (!t || !Array.isArray(entry.days) || !entry.days.length) return null;
  const base = new Date(now);
  for (let i = 0; i <= 7; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, t.h, t.min, 0, 0);
    if (!entry.days.includes(d.getDay())) continue;
    if (d.getTime() > base.getTime()) return d.getTime();
  }
  return null;
}

/** Future alarm events: [{entryId, kind:'warn'|'start', time, startTime}] sorted by time. */
export function nextOccurrences(entries, now) {
  const nowMs = new Date(now).getTime();
  const events = [];
  for (const e of entries || []) {
    const start = nextStart(e, nowMs);
    if (start == null) continue;
    const warn = warnOf(e);
    if (warn > 0 && start - warn * MIN > nowMs) {
      events.push({ entryId: e.id, kind: 'warn', time: start - warn * MIN, startTime: start });
    }
    events.push({ entryId: e.id, kind: 'start', time: start, startTime: start });
  }
  return events.sort((a, b) => a.time - b.time);
}

/** Entries whose warning moment has passed but start has not yet happened. */
export function currentWindows(entries, now) {
  const nowMs = new Date(now).getTime();
  const out = [];
  for (const e of entries || []) {
    const start = nextStart(e, nowMs);
    if (start == null) continue;
    const warn = warnOf(e);
    const warnTime = start - warn * MIN;
    if (warn > 0 && warnTime <= nowMs) out.push({ entryId: e.id, startTime: start, warnTime });
  }
  return out;
}

export function nextStartToday(entries, now) {
  const nowMs = new Date(now).getTime();
  const today = new Date(nowMs).toDateString();
  let best = null;
  for (const e of entries || []) {
    const s = nextStart(e, nowMs);
    if (s == null || new Date(s).toDateString() !== today) continue;
    if (!best || s < best.time) best = { entry: e, time: s };
  }
  return best;
}

/** Enabled entries that happen on the weekday of `now`, sorted by time. */
export function todaysEntries(entries, now) {
  const day = new Date(now).getDay();
  return (entries || [])
    .filter((e) => e && e.enabled !== false && parseTime(e.time) && Array.isArray(e.days) && e.days.includes(day))
    .sort((a, b) => {
      const ta = parseTime(a.time);
      const tb = parseTime(b.time);
      return ta.h * 60 + ta.min - (tb.h * 60 + tb.min);
    });
}

/** Latest start timestamp at or before `now`, or null (looks back up to 7 days). */
export function prevStart(entry, now) {
  if (!entry || entry.enabled === false) return null;
  const t = parseTime(entry.time);
  if (!t || !Array.isArray(entry.days) || !entry.days.length) return null;
  const base = new Date(now);
  for (let i = 0; i <= 7; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i, t.h, t.min, 0, 0);
    if (!entry.days.includes(d.getDay())) continue;
    if (d.getTime() <= base.getTime()) return d.getTime();
  }
  return null;
}
