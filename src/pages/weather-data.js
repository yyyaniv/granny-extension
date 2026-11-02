// Weather for the pages: Open-Meteo, cached in storage.local (fresh 30 min; stale copy used offline up to 6 h).
import { forecastUrl, summarize } from '../lib/weather.js';

const FRESH = 30 * 60000;
const STALE = 6 * 3600000;

export async function getWeather({ lat, lon }) {
  const key = `${lat},${lon},7`; // ,7 = a week (older caches held 4 days)
  const { weatherCache: c } = await chrome.storage.local.get('weatherCache');
  const now = Date.now();
  if (c && c.key === key && now - c.at < FRESH) return c.data;
  try {
    const res = await fetch(forecastUrl(lat, lon, 7), { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const data = summarize(await res.json());
    if (!data) throw new Error('bad data');
    await chrome.storage.local.set({ weatherCache: { key, at: now, data } });
    return data;
  } catch {
    return c && c.key === key && now - c.at < STALE ? c.data : null;
  }
}
