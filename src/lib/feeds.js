// RSS news (pure: parsing with regular expressions so it runs in Node tests and any page).

const MONTHS = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
// Articles shorter than this (only a lead, e.g. Suspilne) open on the site instead of the reader.
export const READABLE_MIN = 400;

export function decodeEntities(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const unCdata = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
const esc = (t) => t.replace(/[:]/g, '\\:');

/** Raw inner text of the first <tag> (CDATA unwrapped, entities NOT decoded yet). */
function tagValue(xml, tag) {
  const m = new RegExp(`<${esc(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)</${esc(tag)}>`, 'i').exec(xml);
  return m ? unCdata(m[1]) : '';
}
function tagAttr(xml, tag, attr) {
  const m = new RegExp(`<${esc(tag)}\\s[^>]*\\b${attr}="([^"]*)"`, 'i').exec(xml);
  return m ? decodeEntities(m[1]) : '';
}

const clean = (s) => s.replace(/\s+/g, ' ').trim();

/**
 * Article HTML (or plain text) -> list of plain-text paragraphs.
 * Plain text glued without breaks ("...формули?Не думаю", "...полоненогоІнформацію") is split after sentence ends
 * and where a lowercase letter runs straight into a capitalised word.
 */
export function htmlToParagraphs(html) {
  let s = unCdata(html);
  s = s.replace(/<(script|style|figure|figcaption|iframe)[\s\S]*?<\/\1>/gi, ' ');
  const hasBlocks = /<(p|br|li|div|h\d)[\s>/]/i.test(s);
  s = s.replace(/<\/?(p|br|li|div|h\d|ul|ol|blockquote)[^>]*>/gi, '\n').replace(/<[^>]+>/g, '');
  let parts = decodeEntities(s).split(/\n+/).map(clean).filter(Boolean);
  // also a subheading glued to the next paragraph: "...військовополоненогоІнформацію про..."
  if (!hasBlocks) parts = parts.flatMap((p) => p.split(/(?<=[.!?…][»"”)]?)(?=[А-ЯІЇЄҐA-Z«"„])|(?<=[а-яіїєґ])(?=[А-ЯІЇЄҐ][а-яіїєґʼ'])/u).map(clean).filter(Boolean));
  return parts.filter((p) => !/^Читайте також/i.test(p));
}

const isPlaceholder = (u) => !u || /\/default\.(jpe?g|png)$/i.test(u);

/** RSS 2.0 xml -> [{ id, source, title, link, date, image, paras }] (newest first, as in the feed). */
export function parseRss(xml, source = '') {
  const items = [];
  for (const m of String(xml || '').matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const it = m[1];
    const title = clean(decodeEntities(unCdata(tagValue(it, 'title')).replace(/<[^>]+>/g, '')));
    const link = clean(decodeEntities(tagValue(it, 'link'))) || clean(decodeEntities(tagValue(it, 'guid')));
    if (!title || !/^https?:\/\//i.test(link)) continue;
    const body = tagValue(it, 'content:encoded') || tagValue(it, 'description');
    const t = Date.parse(clean(tagValue(it, 'pubDate')));
    const image = tagAttr(it, 'enclosure', 'url') || tagAttr(it, 'media:content', 'url');
    items.push({
      id: link, source, title, link, date: Number.isFinite(t) ? t : 0,
      image: isPlaceholder(image) || !/^https:\/\//i.test(image) ? '' : image,
      paras: htmlToParagraphs(body),
    });
  }
  return items;
}

export function isReadable(item) {
  return Boolean(item && item.paras && item.paras.join(' ').length >= READABLE_MIN);
}

/** Several feeds -> one list, newest first, no duplicate links. */
export function mergeNews(lists, max = 60) {
  const seen = new Set();
  return lists.flat().filter((x) => x && !seen.has(x.link) && seen.add(x.link))
    .sort((a, b) => b.date - a.date).slice(0, max);
}

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** "сьогодні о 14:30" / "вчора о 09:05" / "1 листопада о 18:00". */
export function formatWhen(ms, now = Date.now()) {
  if (!ms) return '';
  const d = new Date(ms);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const today = new Date(now);
  const yesterday = new Date(now);
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(d) === dayKey(today)) return `сьогодні о ${time}`;
  if (dayKey(d) === dayKey(yesterday)) return `вчора о ${time}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} о ${time}`;
}
