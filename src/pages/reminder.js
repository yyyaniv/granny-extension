import { loadConfig, getAnnounceAudio } from '../lib/storage.js';
import { playAnnouncement } from '../lib/announce.js';
import { formatTime } from '../lib/datetime.js';
import { enableNav, goHome } from './nav.js';

const params = new URLSearchParams(location.search);
const entryId = params.get('entry');
const startTime = Number(params.get('start'));
let entry = null;
let audio = null;
let finished = false;

async function done() {
  finished = true;
  await chrome.runtime.sendMessage({ type: 'reminder-done', entryId, startTime }).catch(() => {});
}

async function watch() {
  await done();
  location.href = `stream.html?entry=${encodeURIComponent(entryId)}`;
}

async function later() {
  await done();
  goHome();
}

function countdown() {
  const left = Math.max(0, Math.round((startTime - Date.now()) / 1000));
  const m = Math.floor(left / 60);
  const s = left % 60;
  document.getElementById('count').textContent = left > 0
    ? `Початок о ${formatTime(startTime)}. Залишилось: ${m} хв ${s} с`
    : 'Починаємо…';
}

function announce() {
  if (!finished && entry) playAnnouncement(audio, entry.name);
}

async function init() {
  const cfg = await loadConfig();
  entry = cfg.schedule.find((e) => e.id === entryId);
  if (!entry) { goHome(); return; }
  document.getElementById('title').textContent = `Скоро ${entry.name}`;
  audio = await getAnnounceAudio();
  countdown();
  setInterval(countdown, 1000);
  announce();
  setInterval(announce, 30000);
  // Browsers block sound until the first key press / click: replay once then.
  window.addEventListener('keydown', () => { if (!window.__played) { window.__played = true; announce(); } }, { once: true });
}

document.getElementById('watch').addEventListener('click', watch);
document.getElementById('later').addEventListener('click', later);
enableNav({ onEscape: later });
init();
