import { parseStreamsHtml } from './youtube-parse.js';
import { pickStream } from './resolver.js';

export function streamsUrl(channelUrl) {
  let u = String(channelUrl || '').trim().split(/[?#]/)[0].replace(/\/+$/, '');
  u = u.replace(/\/(streams|live|videos|featured|shorts|playlists)$/i, '');
  return `${u}/streams?hl=uk`;
}

/**
 * @returns {Promise<{status:'found'|'none'|'error', item?:object, message?:string, total?:number}>}
 */
export async function resolveChannel(channelUrl, keywords, today, fetchFn = fetch) {
  try {
    const res = await fetchFn(streamsUrl(channelUrl), { credentials: 'include' });
    if (!res.ok) return { status: 'error', message: `HTTP ${res.status}` };
    const html = await res.text();
    const items = parseStreamsHtml(html);
    if (!items.length) return { status: 'error', message: 'Не вдалося прочитати сторінку каналу', total: 0 };
    const item = pickStream(items, keywords, today);
    return item ? { status: 'found', item, total: items.length } : { status: 'none', total: items.length };
  } catch (e) {
    return { status: 'error', message: String((e && e.message) || e) };
  }
}
