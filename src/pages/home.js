import { loadConfig } from '../lib/storage.js';
import { nextStartToday } from '../lib/schedule.js';
import { formatTime, formatDateUk } from '../lib/datetime.js';
import { enableNav, el } from './nav.js';
import { getWeather } from './weather-data.js';
import { shortLine } from '../lib/weather.js';
import { feastNotice, feastLine, fastOn } from '../lib/church.js';

const tiles = document.getElementById('tiles');
const topics = document.getElementById('topics');
let cfg = null;

function tick() {
  const now = new Date();
  document.getElementById('clock').textContent = formatTime(now);
  document.getElementById('date').textContent = formatDateUk(now);
  const feast = document.getElementById('feast');
  // a feast (today / within 3 days) first, else today's fast
  const fast = cfg && fastOn(now, cfg.church);
  const line = cfg ? feastLine(feastNotice(now, cfg.church)) : '';
  feast.textContent = line || (fast ? `Сьогодні: ${fast}` : '');
  feast.classList.toggle('is-fast', !line && Boolean(fast));
  feast.hidden = !feast.textContent;
  const next = cfg ? nextStartToday(cfg.schedule, now) : null;
  document.getElementById('next').textContent = next
    ? `Наступна: ${next.entry.name} о ${formatTime(next.time)}`
    : cfg ? 'Сьогодні за розкладом більше нічого немає' : '';
}

function tile(icon, text, href, extra = '') {
  return el('a', { class: `big ${extra}`.trim(), href, 'data-nav': true },
    el('span', { class: 'icon', text: icon }), el('span', { text }));
}

async function render() {
  cfg = await loadConfig();
  tiles.replaceChildren();
  for (const t of cfg.tiles) tiles.append(tile(t.icon, t.name, t.url, `tile-${t.id}`));
  tiles.append(tile('🙏', 'Програми', 'programs.html', 'tile-programs'));
  tiles.append(tile('🎤', 'Пошукати голосом', 'voice.html', 'tile-voice'));
  tiles.append(tile('📰', 'Читати новини', 'news.html', 'tile-news'));
  if (cfg.weather.enabled) tiles.append(tile('🌤️', 'Погода на тиждень', 'weather.html', 'tile-weather'));
  tiles.append(tile('⭐', 'Мої відео і сайти', 'saved.html', 'tile-saved'));
  tiles.append(tile('📅', 'Календар', 'calendar.html', 'tile-calendar'));
  topics.replaceChildren(...cfg.topics.map((t) => tile(t.icon, t.title, `topic.html?id=${encodeURIComponent(t.id)}`, `muted topic-${t.id}`)));
  tick();
  showWeather();
  const first = tiles.querySelector('[data-nav]');
  if (first && !document.activeElement.closest?.('[data-nav]')) first.focus();
}

async function showWeather() {
  const box = document.getElementById('weather');
  if (!cfg.weather.enabled) { box.hidden = true; return; }
  const w = await getWeather(cfg.weather).catch(() => null);
  box.textContent = w ? `${shortLine(w)} · ${cfg.weather.city}` : '';
  box.hidden = !w;
  // the tile shows today's sky: "☁️ Погода на тиждень"
  const icon = tiles.querySelector('.tile-weather .icon');
  if (icon && w) icon.textContent = w.now.icon;
}

// Paused by the grandson: show Chrome's own new tab page (or a short note if that fails).
async function handlePaused() {
  const { paused } = await chrome.storage.session.get('paused').catch(() => ({}));
  if (!paused) return false;
  const r = await chrome.runtime.sendMessage({ type: 'open-default-newtab' }).catch(() => null);
  if (!r || !r.ok) {
    document.body.replaceChildren(
      el('h1', { text: 'Помічник вимкнено до перезапуску Chrome' }),
      el('div', { class: 'row' }, el('button', {
        class: 'big accent',
        onclick: async () => { await chrome.runtime.sendMessage({ type: 'set-paused', paused: false }); location.reload(); },
      }, '▶ Увімкнути помічника')));
  }
  return true;
}

function start() {
  enableNav({ escapeGoesHome: false });
  chrome.runtime.sendMessage({ type: 'exit-fullscreen' }).catch(() => {});
  render();
  // Chrome sometimes leaves the address bar focused on start/new tab: re-navigate once
  // (extension-initiated navigation gives the page focus). f=1 prevents loops.
  setTimeout(() => {
    if (document.visibilityState === 'visible' && !document.hasFocus() && !new URLSearchParams(location.search).has('f')) {
      chrome.runtime.sendMessage({ type: 'refocus' }).catch(() => {});
    }
  }, 400);
  setInterval(tick, 1000);
  setInterval(showWeather, 15 * 60000);
  chrome.storage.onChanged.addListener(() => render());
}

handlePaused().then((paused) => { if (!paused) start(); });
