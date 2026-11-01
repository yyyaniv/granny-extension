import { loadConfig } from '../lib/storage.js';
import { enableNav } from './nav.js';

const entryId = new URLSearchParams(location.search).get('entry');
const title = document.getElementById('title');
const status = document.getElementById('status');
const RETRY_MS = 60000;
const MAX_MINUTES = 15;
let timer = null;

function open(url, facebook = false) {
  title.textContent = 'Відкриваю…';
  status.textContent = '';
  chrome.runtime.sendMessage({ type: 'open-stream', url, facebook }).catch(() => { location.href = url; });
}

async function attempt(entry, n) {
  title.textContent = `${entry.name}`;
  status.textContent = 'Шукаю трансляцію…';
  const r = await chrome.runtime.sendMessage({ type: 'resolve', entryId: entry.id }).catch(() => null);
  if (r && r.status === 'found') {
    return open(`https://www.youtube.com/watch?v=${r.item.videoId}`);
  }
  if (n >= MAX_MINUTES) {
    title.textContent = 'Сьогодні трансляції немає';
    status.textContent = '';
    document.getElementById('home').focus();
    return;
  }
  title.textContent = 'Трансляція ще не почалася, зачекайте…';
  status.textContent = `${entry.name}. Перевіряю кожну хвилину.`;
  timer = setTimeout(() => attempt(entry, n + 1), RETRY_MS);
}

async function init() {
  const cfg = await loadConfig();
  const entry = cfg.schedule.find((e) => e.id === entryId);
  if (!entry) {
    title.textContent = 'Сьогодні трансляції немає';
    return;
  }
  title.textContent = entry.name;
  if (entry.type === 'youtube-video') open(entry.url);
  else if (entry.type === 'facebook-profile') open(entry.url, true);
  else attempt(entry, 0);
}

enableNav();
init();
