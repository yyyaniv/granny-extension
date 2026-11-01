// Auto-update helpers (pure): version compare and "is it a safe moment to reload".
import { nextStart, prevStart } from './schedule.js';

const MIN = 60000;
export const AHEAD_MS = 15 * MIN;
export const BEHIND_MS = 5 * MIN;

const parse = (v) => String(v == null ? '' : v).trim().split('.').map((x) => {
  const n = parseInt(x, 10);
  return Number.isFinite(n) ? n : 0;
});

/** -1 / 0 / 1 like a - b for dotted numeric versions ("1.10.0" > "1.9.9"). */
export function compareVersions(a, b) {
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** Reload only if the version on disk is newer and no schedule event is near. */
export function shouldReloadNow({ diskVersion, runningVersion, now, schedule }) {
  if (!diskVersion || !runningVersion) return false;
  if (compareVersions(diskVersion, runningVersion) <= 0) return false;
  for (const e of schedule || []) {
    if (!e || e.enabled === false) continue;
    const start = nextStart(e, now);
    if (start != null) {
      const warn = Number(e.warnMinutes);
      const first = Number.isFinite(warn) && warn > 0 ? start - warn * MIN : start;
      if (first <= now + AHEAD_MS || start <= now + AHEAD_MS) return false;
    }
    const prev = prevStart(e, now);
    if (prev != null && now - prev < BEHIND_MS) return false;
  }
  return true;
}
