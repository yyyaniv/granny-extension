// News feeds for news.html: fetched directly (host permissions), cached in storage.local for 10 minutes.
import { parseRss, mergeNews } from '../lib/feeds.js';

const FRESH = 10 * 60000;
const PER_FEED = 30;

async function fetchFeed(src) {
  const res = await fetch(src.url, { cache: 'no-store', credentials: 'omit' });
  if (!res.ok) throw new Error(String(res.status));
  const items = parseRss(await res.text(), src.id).slice(0, PER_FEED);
  if (!items.length) throw new Error('empty');
  return items;
}

/** -> { items (newest first, all sources), failed: [source names] } */
export async function loadNews(sources) {
  const { newsCache = {} } = await chrome.storage.local.get('newsCache');
  const now = Date.now();
  const failed = [];
  const cache = {};
  const lists = await Promise.all(sources.map(async (src) => {
    const c = newsCache[src.url];
    if (c && now - c.at < FRESH) { cache[src.url] = c; return c.items; }
    try {
      const items = await fetchFeed(src);
      cache[src.url] = { at: now, items };
      return items;
    } catch {
      failed.push(src.name);
      if (c) cache[src.url] = c; // offline: an older copy is better than nothing
      return c ? c.items : [];
    }
  }));
  await chrome.storage.local.set({ newsCache: cache }).catch(() => {});
  return { items: mergeNews(lists, 200), failed };
}
