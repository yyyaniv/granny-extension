// Outage schedule for the pages: Львівобленерго API, cached in storage.local (fresh 15 min).
// Days are kept by date, so a stale copy is still right offline (yesterday's evening fetch holds today).
import { LOE_URL, parseLoe, mergeDays, dayKey } from '../lib/power.js';

const FRESH = 15 * 60000;

/** -> { days: { "2026-11-21": { updated, groups } }, at } (may be empty when offline with no cache). */
export async function getPower() {
  const { powerCache: c } = await chrome.storage.local.get('powerCache');
  const now = Date.now();
  const today = dayKey(new Date());
  if (c && now - c.at < FRESH) return { days: mergeDays(c.days, null, today), at: c.at };
  try {
    const res = await fetch(LOE_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const days = mergeDays(c && c.days, parseLoe(await res.json()), today);
    await chrome.storage.local.set({ powerCache: { at: now, days } });
    return { days, at: now };
  } catch {
    return { days: mergeDays(c && c.days, null, today), at: c ? c.at : 0 };
  }
}

/** Slots of `group` for the day of `date`, or null when that day's schedule is not known. */
export function slotsFor(days, group, date) {
  const day = days && days[dayKey(date)];
  if (!day) return null;
  return Array.isArray(day.groups[group]) ? day.groups[group] : null;
}
