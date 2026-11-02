import { loadConfig } from '../lib/storage.js';
import { isReadable, formatWhen } from '../lib/feeds.js';
import { loadNews } from './news-data.js';
import { enableNav, enableScrollButtons, el, focusItem, animateScrollTo, goHome } from './nav.js';

const $ = (id) => document.getElementById(id);
let sources = [];
let items = [];
let filter = 'all';
let listY = 0;
let opener = null;

const sourceName = (id) => (sources.find((s) => s.id === id) || {}).name || '';
const reading = () => !$('article').hidden;

function card(item) {
  const readable = isReadable(item);
  const sub = [sourceName(item.source), formatWhen(item.date), readable ? '' : '🌐 на сайті'].filter(Boolean).join(' · ');
  return el('a', {
    class: 'vcard news', href: item.link, 'data-nav': true,
    onclick: (e) => {
      // coming back from the site ("◀ Назад"): focus this card again
      sessionStorage.setItem('newsLast', JSON.stringify({ link: item.link, filter }));
      if (readable) { e.preventDefault(); openArticle(item, e.currentTarget); }
    },
  },
  ...(item.image ? [el('img', { src: item.image, alt: '', loading: 'lazy' })] : []),
  el('span', {}, el('span', { class: 't', text: item.title }), el('span', { class: 'sub', text: sub })));
}

function renderSide() {
  const btn = (key, label) => el('button', {
    class: `big small ${filter === key ? 'accent' : 'muted'}`, 'data-nav': true, 'data-key': key,
    onclick: () => { filter = key; renderList(); renderSide(); focusFirstCard(); },
  }, filter === key ? `✓ ${label}` : label);
  $('side').replaceChildren(
    btn('all', '📰 Усі новини'),
    ...sources.map((s) => btn(s.id, `${s.icon} ${s.name}`)),
    el('a', { class: 'big small muted', href: 'home.html', 'data-nav': true }, '🏠 На головну'));
}

function renderList() {
  const shown = (filter === 'all' ? items : items.filter((i) => i.source === filter)).slice(0, 60);
  $('list-title').textContent = filter === 'all' ? 'Усі новини' : sourceName(filter);
  $('list').replaceChildren(...shown.map(card));
}

function focusLastOpened() {
  let last = null;
  try { last = JSON.parse(sessionStorage.getItem('newsLast')); } catch { /* none */ }
  if (!last) return false;
  if (last.filter === 'all' || sources.some((s) => s.id === last.filter)) { filter = last.filter; renderSide(); renderList(); }
  const c = [...$('list').querySelectorAll('.vcard')].find((x) => x.href === last.link);
  if (!c) return false;
  focusItem(c, 'center');
  return true;
}

function focusFirstCard() {
  const first = $('list').querySelector('.vcard') || $('side').querySelector('[data-nav]');
  window.scrollTo(0, 0);
  if (first) first.focus({ preventScroll: true });
}

// ---------- reader: while open it is the only thing on the page ----------
function openArticle(item, from) {
  opener = from;
  listY = window.scrollY;
  $('a-title').textContent = item.title;
  $('a-sub').textContent = [sourceName(item.source), formatWhen(item.date)].filter(Boolean).join(' · ');
  $('a-img').hidden = !item.image;
  if (item.image) $('a-img').src = item.image; else $('a-img').removeAttribute('src');
  $('a-body').replaceChildren(...item.paras.map((p) => el('p', { tabindex: '0', 'data-nav': true, text: p })));
  $('a-site').href = item.link;
  $('page').hidden = true;
  $('article').hidden = false;
  window.scrollTo(0, 0);
  $('a-back').focus({ preventScroll: true });
  history.pushState({ article: true }, '');
}

function closeArticle() {
  if (!reading()) return;
  $('article').hidden = true;
  $('page').hidden = false;
  window.scrollTo(0, listY);
  if (opener && opener.isConnected) opener.focus({ preventScroll: true });
}

const back = () => { if (reading() && history.state && history.state.article) history.back(); else closeArticle(); };
$('a-back').addEventListener('click', back);
$('a-back2').addEventListener('click', back);
window.addEventListener('popstate', closeArticle);

async function init() {
  if (history.state && history.state.article) history.replaceState(null, ''); // reloaded while reading
  const cfg = await loadConfig();
  sources = cfg.news;
  renderSide();
  if (!sources.length) { $('msg').textContent = 'Джерела новин не налаштовані.'; return; }
  const r = await loadNews(sources);
  items = r.items;
  $('msg').textContent = !items.length
    ? 'Не вдалося завантажити новини. Перевірте інтернет і спробуйте пізніше.'
    : r.failed.length ? `Зараз не відповідає: ${r.failed.join(', ')}` : '';
  $('msg').hidden = !$('msg').textContent;
  renderList();
  if (!focusLastOpened()) focusFirstCard();
}

enableNav({ onEscape: () => (reading() ? back() : goHome()) });
init().then(() => enableScrollButtons(() => (reading()
  ? [...document.querySelectorAll('#a-body p')]
  : [...document.querySelectorAll('#list .vcard')])));
