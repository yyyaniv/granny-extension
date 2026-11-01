import { loadConfig } from '../lib/storage.js';
import { nextStartToday } from '../lib/schedule.js';
import { formatTime, formatDateUk } from '../lib/datetime.js';
import { enableNav, el } from './nav.js';

const tiles = document.getElementById('tiles');
let cfg = null;

function tick() {
  const now = new Date();
  document.getElementById('clock').textContent = formatTime(now);
  document.getElementById('date').textContent = formatDateUk(now);
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
  tiles.append(tile('⭐', 'Мої відео', 'saved.html', 'wide tile-saved'));
  const topics = el('div', { class: 'topics' });
  for (const t of cfg.topics) topics.append(tile(t.icon, t.title, `topic.html?id=${encodeURIComponent(t.id)}`, `muted topic-${t.id}`));
  tiles.append(topics);
  tick();
  const first = tiles.querySelector('[data-nav]');
  if (first && !document.activeElement.closest?.('[data-nav]')) first.focus();
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
  chrome.storage.onChanged.addListener(() => render());
}

handlePaused().then((paused) => { if (!paused) start(); });
