// Pure helpers: extract ytInitialData from a YouTube HTML page and list videos.

const MARKERS = ['var ytInitialData = ', 'window["ytInitialData"] = ', 'ytInitialData = '];

/** Find the end index (exclusive) of the JSON object starting at `start` (a "{"). */
function findJsonEnd(s, start) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

export function extractInitialData(html) {
  if (typeof html !== 'string') return null;
  for (const marker of MARKERS) {
    let idx = html.indexOf(marker);
    while (idx !== -1) {
      let start = idx + marker.length;
      while (start < html.length && /\s/.test(html[start])) start++;
      if (html[start] === '{') {
        const end = findJsonEnd(html, start);
        if (end > 0) {
          try { return JSON.parse(html.slice(start, end)); } catch { /* try fallback */ }
        }
        const alt = html.indexOf(';</script>', start);
        if (alt > 0) {
          try { return JSON.parse(html.slice(start, alt)); } catch { /* next */ }
        }
      }
      idx = html.indexOf(marker, idx + marker.length);
    }
  }
  return null;
}

function textOf(t) {
  if (!t) return '';
  if (typeof t === 'string') return t;
  if (typeof t.simpleText === 'string') return t.simpleText;
  if (typeof t.content === 'string') return t.content;
  if (Array.isArray(t.runs)) return t.runs.map((r) => (r && r.text) || '').join('');
  return '';
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const n of node) walk(n, visit); return; }
  if (visit(node) === false) return;
  for (const k of Object.keys(node)) walk(node[k], visit);
}

function hasLiveBadge(node) {
  let live = false;
  walk(node, (o) => {
    if (live) return false;
    if (o.badgeStyle === 'THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE') live = true;
    else if (o.thumbnailOverlayTimeStatusRenderer && o.thumbnailOverlayTimeStatusRenderer.style === 'LIVE') live = true;
    else if (o.style === 'BADGE_STYLE_TYPE_LIVE_NOW') live = true;
    return !live;
  });
  return live;
}

function hasUpcoming(node) {
  let up = false;
  walk(node, (o) => {
    if (up) return false;
    if (o.upcomingEventData) up = true;
    else if (o.thumbnailOverlayTimeStatusRenderer && o.thumbnailOverlayTimeStatusRenderer.style === 'UPCOMING') up = true;
    else if (o.badgeStyle === 'THUMBNAIL_OVERLAY_BADGE_STYLE_UPCOMING') up = true;
    return !up;
  });
  return up;
}

/** @returns {{videoId:string,title:string,isLive:boolean,isUpcoming:boolean}[]} */
export function parseStreamItems(data) {
  const out = [];
  const seen = new Set();
  const push = (videoId, title, node) => {
    if (!videoId || seen.has(videoId)) return;
    seen.add(videoId);
    const isUpcoming = hasUpcoming(node);
    out.push({ videoId, title, isLive: !isUpcoming && hasLiveBadge(node), isUpcoming });
  };
  walk(data, (o) => {
    const l = o.lockupViewModel;
    if (l && typeof l === 'object' && typeof l.contentId === 'string') {
      const type = l.contentType;
      if (!type || type === 'LOCKUP_CONTENT_TYPE_VIDEO') {
        const title = textOf(l.metadata && l.metadata.lockupMetadataViewModel && l.metadata.lockupMetadataViewModel.title);
        push(l.contentId, title, l);
      }
      return false;
    }
    for (const key of ['videoRenderer', 'gridVideoRenderer']) {
      const r = o[key];
      if (r && typeof r === 'object' && typeof r.videoId === 'string') {
        push(r.videoId, textOf(r.title), r);
        return false;
      }
    }
    return true;
  });
  return out;
}

export function parseStreamsHtml(html) {
  const data = extractInitialData(html);
  return data ? parseStreamItems(data) : [];
}
