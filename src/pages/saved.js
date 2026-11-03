import { listSaved, removeVideo, siteName } from '../lib/saved.js';
import { resumeSeconds, resumeUrl, formatPosition, positionFor } from '../lib/history.js';
import { enableNav, enableScrollButtons, el, focusItem, animateScrollTo, goHome, backButton, BACK_LABEL } from './nav.js';

const $ = (id) => document.getElementById(id);
const MAX_HISTORY = 8;
let data = { categories: [], uncategorized: [] };
let filter = 'all'; // 'all' | 'none' | category id
let positions = {};

const thumb = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

function card(id, title, href, sub) {
  return el('a', { class: 'vcard', href, 'data-nav': true },
    el('img', { src: thumb(id), alt: '', loading: 'lazy' }),
    el('span', { class: 't', text: title }),
    ...(sub ? [el('span', { class: 'sub', text: sub })] : []));
}

// Saved website (not a YouTube video): a big globe instead of a thumbnail, the site's name under the title.
function siteCard(v) {
  return el('a', { class: 'vcard site', href: v.url, 'data-nav': true },
    el('span', { class: 'globe', text: '🌐' }),
    el('span', { class: 't', text: v.title }),
    el('span', { class: 'sub', text: siteName(v.url) }));
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

const sideBtn = (key, label, onclick) => el('button', {
  class: `big small ${filter === key ? 'accent' : 'muted'}`, 'data-nav': true, 'data-key': key, onclick,
}, filter === key ? `✓ ${label}` : label);

// Sidebar / top bar: jump to a section or apply a category filter, then focus its first card.
function renderSide(history) {
  const { categories, uncategorized } = data;
  const go = (key) => { filter = key; renderSaved(history); focusSection('saved'); };
  const btns = [backButton()];
  if (history.length) {
    btns.push(el('button', { class: 'big small muted', 'data-nav': true, 'data-key': 'continue', onclick: () => focusSection('continue') }, '▶ Продовжити'));
  }
  btns.push(sideBtn('all', '⭐ Усі збережені', () => go('all')));
  for (const c of categories) btns.push(sideBtn(c.id, c.title, () => go(c.id)));
  if (uncategorized.length && categories.length) btns.push(sideBtn('none', 'Без категорії', () => go('none')));
  $('side').replaceChildren(...btns);
  setBarHeight();
}

function focusSection(id) {
  const sec = $(id);
  const first = sec.querySelector('.vcard');
  animateScrollTo(sec.getBoundingClientRect().top + window.scrollY - (parseFloat(getComputedStyle(sec).scrollMarginTop) || 16));
  if (first) first.focus({ preventScroll: true });
  else $('side').querySelector(`[data-key="${CSS.escape(id === 'saved' ? filter : id)}"]`)?.focus({ preventScroll: true });
}

// Narrow screens: the sidebar becomes a sticky top bar; sections must scroll to just below it.
function setBarHeight() {
  const bar = $('side');
  const narrow = getComputedStyle(bar).flexDirection === 'row';
  document.documentElement.style.setProperty('--bar-h', narrow ? `${bar.offsetHeight}px` : '0px');
}
window.addEventListener('resize', setBarHeight);

function renderSaved(history) {
  const { categories, uncategorized } = data;
  if (filter !== 'all' && filter !== 'none' && !categories.some((c) => c.id === filter)) filter = 'all';
  const cur = categories.find((c) => c.id === filter);
  $('saved-title').textContent = cur ? `⭐ ${cur.title}` : filter === 'none' ? '⭐ Без категорії' : '⭐ Усі збережені';
  const list = $('list');
  const shown = visibleItems();
  list.replaceChildren(...shown.map((v) => {
    let c;
    if (v.id) {
      const pos = positionFor(v.id, history, positions);
      const s = resumeSeconds(pos);
      c = card(v.id, v.title, resumeUrl(pos), s > 0 ? `зупинились на ${formatPosition(s)}` : '');
    } else c = siteCard(v);
    return el('div', { class: 'item' }, c,
      el('button', { class: 'big muted small', 'data-nav': true, onclick: (e) => ask(v, e.currentTarget) }, '🗑 Прибрати'));
  }));
  $('empty').hidden = uncategorized.length > 0 || categories.some((c) => c.items.length);
  renderSide(history);
}

// ---------- confirm: while open it is the only thing on the page ----------
let pending = null;
let corner = null;
function setConfirm(open) {
  $('page').hidden = open;
  $('confirm').hidden = !open;
  if (corner) corner.refresh();
}
function ask(video, opener) {
  pending = { video, opener, y: window.scrollY, index: [...$('list').querySelectorAll('.item')].findIndex((i) => i.contains(opener)) };
  $('confirm-title').textContent = video.title;
  setConfirm(true);
  window.scrollTo(0, 0);
  $('confirm-no').focus();
}
function cancel() {
  const p = pending;
  pending = null;
  setConfirm(false);
  window.scrollTo(0, p ? p.y : 0); // the hidden page collapsed the scroll position
  if (p && p.opener.isConnected) p.opener.focus({ preventScroll: true });
  else focusInitial();
}
$('confirm-no').addEventListener('click', cancel);
$('confirm-yes').addEventListener('click', async () => {
  const p = pending;
  pending = null;
  if (p) await removeVideo(p.video.key).catch(() => {});
  setConfirm(false);
  window.scrollTo(0, p ? p.y : 0);
  await load();
  const cards = [...$('list').querySelectorAll('.vcard')];
  const next = p && cards[Math.min(Math.max(p.index, 0), cards.length - 1)];
  if (next) focusItem(next); else focusInitial();
});

// First meaningful item: first history card, else first saved card, else first sidebar button.
function focusInitial() {
  const el0 = $('history').querySelector('.vcard') || $('list').querySelector('.vcard') || $('side').querySelector('[data-nav]');
  document.querySelectorAll('[data-autofocus]').forEach((x) => { if (x.id !== 'confirm-no') x.removeAttribute('data-autofocus'); });
  if (el0) { el0.setAttribute('data-autofocus', ''); el0.focus({ preventScroll: true }); }
  window.scrollTo(0, 0);
}

async function load() {
  const [saved, h] = await Promise.all([
    listSaved().catch(() => ({ categories: [], uncategorized: [] })),
    chrome.storage.local.get(['watchHistory', 'positions']),
  ]);
  data = saved;
  positions = h.positions || {};
  const history = h.watchHistory || [];
  renderHistory(history);
  renderSaved(history);
}

enableNav({ onEscape: () => (pending ? cancel() : goHome()) });
load().then(() => {
  focusInitial();
  corner = enableScrollButtons(() => [...document.querySelectorAll('#main section, #main .vcard')], {
    back: () => (pending ? cancel() : goHome()),
    backLabel: () => (pending ? '◀ Ні, назад' : BACK_LABEL),
  });
});
