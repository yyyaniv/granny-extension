import { listSaved, removeVideo } from '../lib/saved.js';
import { resumeSeconds, resumeUrl, formatPosition } from '../lib/history.js';
import { enableNav, el, focusFirst, goHome } from './nav.js';

const $ = (id) => document.getElementById(id);
const MAX_HISTORY = 8;
let data = { categories: [], uncategorized: [] };
let filter = 'all'; // 'all' | 'none' | category id

const thumb = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

function card(id, title, href, sub) {
  return el('a', { class: 'vcard', href, 'data-nav': true },
    el('img', { src: thumb(id), alt: '', loading: 'lazy' }),
    el('span', { class: 't', text: title }),
    ...(sub ? [el('span', { class: 'sub', text: sub })] : []));
}

function renderHistory(history) {
  const items = history.slice(0, MAX_HISTORY);
  $('continue').hidden = !items.length;
  $('history').replaceChildren(...items.map((h) => {
    const s = resumeSeconds(h);
    return card(h.id, h.title, resumeUrl(h), s > 0 ? `зупинились на ${formatPosition(s)}` : h.live ? 'пряма трансляція' : '');
  }));
}

function visibleItems() {
  const { categories, uncategorized } = data;
  if (filter === 'none') return uncategorized;
  const cat = categories.find((c) => c.id === filter);
  if (cat) return cat.items;
  return [...uncategorized, ...categories.flatMap((c) => c.items)].sort((a, b) => b.dateAdded - a.dateAdded);
}

function renderSaved(history, focusAfter) {
  const { categories, uncategorized } = data;
  if (filter !== 'all' && filter !== 'none' && !categories.some((c) => c.id === filter)) filter = 'all';
  const cats = $('cats');
  cats.replaceChildren();
  if (categories.length) {
    const btn = (key, label) => el('button', {
      class: `big small ${filter === key ? 'accent' : 'muted'}`,
      'data-nav': true,
      'data-key': key,
      onclick: () => { filter = key; renderSaved(history, key); },
    }, filter === key ? `✓ ${label}` : label);
    cats.append(btn('all', 'Усі'), ...categories.map((c) => btn(c.id, c.title)));
    if (uncategorized.length) cats.append(btn('none', 'Без категорії'));
  }
  const list = $('list');
  const shown = visibleItems();
  list.replaceChildren(...shown.map((v) => el('div', { class: 'item' },
    card(v.id, v.title, resumeUrl(history.find((h) => h.id === v.id) || { id: v.id })),
    el('button', { class: 'big muted small', 'data-nav': true, onclick: () => ask(v, history) }, '🗑 Прибрати'))));
  $('empty').hidden = uncategorized.length > 0 || categories.some((c) => c.items.length);
  if (focusAfter) {
    const b = cats.querySelector(`[data-key="${CSS.escape(focusAfter)}"]`);
    if (b) b.focus();
  }
}

// ---------- confirm ----------
let pending = null;
function setConfirm(open) {
  $('main').hidden = open;
  $('footer').hidden = open;
  $('confirm').hidden = !open;
}
function ask(video, history) {
  pending = { video, history };
  $('confirm-title').textContent = video.title;
  setConfirm(true);
  $('confirm-no').focus();
}
function cancel() {
  pending = null;
  setConfirm(false);
  focusFirst();
}
$('confirm-no').addEventListener('click', cancel);
$('confirm-yes').addEventListener('click', async () => {
  const p = pending;
  pending = null;
  if (p) await removeVideo(p.video.id).catch(() => {});
  setConfirm(false);
  await load();
  focusFirst();
});

async function load() {
  const [saved, h] = await Promise.all([
    listSaved().catch(() => ({ categories: [], uncategorized: [] })),
    chrome.storage.local.get('watchHistory'),
  ]);
  data = saved;
  const history = h.watchHistory || [];
  renderHistory(history);
  renderSaved(history);
}

enableNav({ onEscape: () => (pending ? cancel() : goHome()) });
load().then(() => focusFirst());
