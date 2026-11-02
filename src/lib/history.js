// Automatic watch history (pure). Entries: {id, title, channel, time, duration, live, updatedAt}.

export const HISTORY_MAX = 30;
const MIN_RESUME = 30; // seconds
const TAIL = 30; // seconds
const NEARLY_DONE = 0.95;

/** Most recent first, deduped by id, capped. Returns a new list. */
export function updateHistory(list, entry, now) {
  const prev = Array.isArray(list) ? list.filter((x) => x && x.id) : [];
  if (!entry || !entry.id) return prev.slice(0, HISTORY_MAX);
  const old = prev.find((x) => x.id === entry.id);
  const next = {
    id: entry.id,
    title: String(entry.title || (old && old.title) || 'Відео'),
    channel: String(entry.channel || (old && old.channel) || ''),
    live: Boolean(entry.live),
    updatedAt: now,
  };
  const t = Number(entry.time);
  const d = Number(entry.duration);
  if (!next.live && Number.isFinite(t) && t >= 0) {
    next.time = Math.floor(t);
    // A fresh start (video just opened, position ~0) must not wipe a saved position.
    if (next.time < 5 && old && Number(old.time) >= MIN_RESUME) next.time = Math.floor(old.time);
  }
  if (!next.live && Number.isFinite(d) && d > 0) next.duration = Math.floor(d);
  else if (!next.live && old && old.duration) next.duration = old.duration;
  return [next, ...prev.filter((x) => x.id !== entry.id)].slice(0, HISTORY_MAX);
}

export const POSITIONS_MAX = 500;

/**
 * Playback positions kept apart from the (short) history, so saved videos resume even
 * after they dropped out of it. map: { [id]: { time, duration, updatedAt } }. Returns a new map.
 */
export function updatePositions(map, entry, now, max = POSITIONS_MAX) {
  const prev = map && typeof map === 'object' ? map : {};
  if (!entry || !entry.id || entry.live) return prev;
  const t = Number(entry.time);
  if (!Number.isFinite(t) || t < 0) return prev;
  const old = prev[entry.id];
  let time = Math.floor(t);
  // same rule as the history: a fresh start must not wipe a saved position
  if (time < 5 && old && Number(old.time) >= MIN_RESUME) time = Math.floor(old.time);
  const d = Number(entry.duration);
  const duration = Number.isFinite(d) && d > 0 ? Math.floor(d) : (old && old.duration) || undefined;
  const next = { ...prev, [entry.id]: { time, ...(duration ? { duration } : {}), updatedAt: now } };
  const ids = Object.keys(next);
  if (ids.length <= max) return next;
  ids.sort((a, b) => next[b].updatedAt - next[a].updatedAt);
  return Object.fromEntries(ids.slice(0, max).map((id) => [id, next[id]]));
}

/** Best known position for a video: the newer of the history entry and the positions map. */
export function positionFor(id, history, positions) {
  const h = Array.isArray(history) ? history.find((x) => x && x.id === id) : null;
  const p = positions && positions[id] ? { id, ...positions[id] } : null;
  if (h && p) return (p.updatedAt || 0) > (h.updatedAt || 0) && !h.live ? p : h;
  return h || p || { id };
}

/** Seconds to resume from, or 0 (start over). */
export function resumeSeconds(entry) {
  if (!entry || entry.live) return 0;
  const t = Math.floor(Number(entry.time));
  if (!Number.isFinite(t) || t < MIN_RESUME) return 0;
  const d = Number(entry.duration);
  if (Number.isFinite(d) && d > 0 && (t >= d - TAIL || t / d >= NEARLY_DONE)) return 0;
  return t;
}

export function resumeUrl(entry) {
  const base = `https://www.youtube.com/watch?v=${entry.id}`;
  const s = resumeSeconds(entry);
  return s > 0 ? `${base}&t=${s}s` : base;
}

/** 754 -> "12:34", 3723 -> "1:02:03". */
export function formatPosition(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
