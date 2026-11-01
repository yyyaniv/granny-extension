import { saveVideo, videoIdFromUrl, cleanTabTitle } from '../lib/saved.js';
import { resumeSeconds, resumeUrl, formatPosition } from '../lib/history.js';
import { enableNav, el } from './nav.js';

const $ = (id) => document.getElementById(id);
const msg = (text, error = false) => { $('msg').textContent = text; $('msg').className = `msg${error ? ' error' : ''}`; };

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function refreshState() {
  const tab = await activeTab();
  const id = tab && videoIdFromUrl(tab.url);
  $('save').disabled = !id;
  msg(id ? '' : 'Відкрийте відео на YouTube');
}

$('save').addEventListener('click', async () => {
  const tab = await activeTab();
  const id = tab && videoIdFromUrl(tab.url);
  if (!id) return msg('Відкрийте відео на YouTube');
  try {
    const r = await saveVideo({ id, title: cleanTabTitle(tab.title) });
    msg(r.status === 'exists' ? 'Вже збережено ✓' : 'Збережено ✓');
  } catch {
    msg('Не вдалося зберегти', true);
  }
});

$('mine').addEventListener('click', async () => {
  const tab = await activeTab();
  const url = chrome.runtime.getURL('src/pages/saved.html');
  if (tab) await chrome.tabs.update(tab.id, { url, active: true });
  else await chrome.tabs.create({ url });
});

$('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());

async function renderHistory() {
  const { watchHistory = [] } = await chrome.storage.local.get('watchHistory');
  const items = watchHistory.slice(0, 5);
  $('hist-title').hidden = !items.length;
  $('history').replaceChildren(...items.map((h) => {
    const s = resumeSeconds(h);
    return el('button', {
      class: 'big hitem',
      'data-nav': true,
      onclick: async () => {
        const tab = await activeTab();
        if (tab) await chrome.tabs.update(tab.id, { url: resumeUrl(h), active: true });
        else await chrome.tabs.create({ url: resumeUrl(h) });
      },
    }, el('span', { class: 't', text: h.title }), ...(s > 0 ? [el('span', { class: 'sub', text: `зупинились на ${formatPosition(s)}` })] : []));
  }));
}

enableNav({ escapeGoesHome: false });
refreshState();
renderHistory();
chrome.tabs.onActivated.addListener(refreshState);
chrome.tabs.onUpdated.addListener((_id, info) => { if (info.url || info.title || info.status) refreshState(); });
chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && c.watchHistory) renderHistory(); });
