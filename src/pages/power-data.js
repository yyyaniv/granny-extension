// Outage schedule for the pages: the chosen provider (power-providers.js), cached in storage.local (fresh 15 min).
// Days are kept by date, so a stale copy is still right offline (yesterday's evening fetch holds today).
// The cache belongs to one provider: switching oblenergo in the settings never shows the old region's hours.
import { mergeDays, dayKey } from '../lib/power.js';
import { providerFor } from '../lib/power-providers.js';

const FRESH = 15 * 60000;

/** -> { provider, days: { "2026-11-21": { updated, groups, image } }, at } (days may be empty when offline with no cache). */
export async function getPower(providerId) {
  const provider = providerFor(providerId);
  const { powerCache } = await chrome.storage.local.get('powerCache');
  // caches from 1.7.0 have no provider field: they were Львівобленерго
  const c = powerCache && (powerCache.provider || 'loe') === provider.id ? powerCache : null;
  const now = Date.now();
  const today = dayKey(new Date());
  if (c && now - c.at < FRESH) return { provider, days: mergeDays(c.days, null, today), at: c.at };
  try {
    const days = mergeDays(c && c.days, await provider.load(fetch.bind(globalThis)), today);
    await chrome.storage.local.set({ powerCache: { provider: provider.id, at: now, days } });
    return { provider, days, at: now };
  } catch {
    return { provider, days: mergeDays(c && c.days, null, today), at: c ? c.at : 0 };
  }
}

/** Slots of `group` for the day of `date`, or null when that day's schedule is not known. */
export function slotsFor(days, group, date) {
  const day = days && days[dayKey(date)];
  if (!day) return null;
  return Array.isArray(day.groups[group]) ? day.groups[group] : null;
}

/** The full official picture for the day of `date`, or "". */
export function imageFor(days, date) {
  const day = days && days[dayKey(date)];
  return (day && day.image) || '';
}
