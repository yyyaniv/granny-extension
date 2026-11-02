import { loadConfig, ensureMigrated } from './lib/storage.js';
import * as saved from './lib/saved.js';
import { updateHistory, updatePositions, positionFor, resumeSeconds } from './lib/history.js';
import { shouldReloadNow } from './lib/update.js';
import { nextOccurrences, currentWindows } from './lib/schedule.js';
import { resolveChannel } from './lib/resolve-channel.js';
import { localDateKey } from './lib/resolver.js';

const HOME = 'src/pages/home.html';
const REMINDER = 'src/pages/reminder.html';
const STREAM = 'src/pages/stream.html';
const ext = (p) => chrome.runtime.getURL(p);

// ---------- fired / dismissed marks (survive service worker restarts) ----------
async function getMarks() {
  return (await chrome.storage.local.get('marks')).marks || {};
}
async function mark(key) {
  const marks = await getMarks();
  const now = Date.now();
  for (const k of Object.keys(marks)) if (now - marks[k] > 2 * 86400000) delete marks[k];
  marks[key] = now;
  await chrome.storage.local.set({ marks });
}
async function isMarked(key) {
  return Boolean((await getMarks())[key]);
}

// ---------- alarms ----------
// Alarm handlers and rebuilds run one at a time, so a warn alarm and the
// minute tick firing together cannot open two reminder tabs.
let queue = Promise.resolve();
function serial(fn) {
  queue = queue.then(fn, fn).catch(() => {});
  return queue;
}

function rebuildAlarms() {
  return serial(rebuildAlarmsNow);
}

async function rebuildAlarmsNow() {
  const cfg = await loadConfig();
  const now = Date.now();
  const wanted = new Map();
  for (const ev of nextOccurrences(cfg.schedule, now)) {
    wanted.set(`${ev.kind}|${ev.entryId}|${ev.startTime}`, ev.time);
  }
  const existing = await chrome.alarms.getAll();
  for (const a of existing) {
    if (a.name !== 'tick' && !wanted.has(a.name)) await chrome.alarms.clear(a.name);
  }
  const have = new Set(existing.map((a) => a.name));
  for (const [name, when] of wanted) if (!have.has(name)) chrome.alarms.create(name, { when });
  if (!have.has('tick')) chrome.alarms.create('tick', { periodInMinutes: 1 });
  // We may have woken up inside a warning window (e.g. Chrome just started).
  for (const w of currentWindows(cfg.schedule, now)) await fireWarn(cfg, w.entryId, w.startTime);
}

// ---------- auto-update (a new version appears on disk; windows/update.ps1 copies it) ----------
const CHECK_EVERY = 5 * 60000;
const RELOAD_GAP = 10 * 60000;

async function checkForUpdate(cfg) {
  const now = Date.now();
  const st = await chrome.storage.local.get(['lastUpdateCheck', 'lastReloadAt']);
  if (now - (st.lastUpdateCheck || 0) < CHECK_EVERY) return;
  await chrome.storage.local.set({ lastUpdateCheck: now });
  if (now - (st.lastReloadAt || 0) < RELOAD_GAP) return;
  let diskVersion;
  try {
    const res = await fetch(chrome.runtime.getURL('manifest.json'), { cache: 'no-store' });
    diskVersion = (await res.json()).version;
  } catch { return; } // half-copied or unreadable: try again later
  const runningVersion = chrome.runtime.getManifest().version;
  if (!shouldReloadNow({ diskVersion, runningVersion, now, schedule: cfg.schedule })) return;
  // Not while something is playing: open YouTube tabs would lose the save button/history until reloaded.
  if ((await chrome.tabs.query({ audible: true })).length) return;
  const own = await chrome.tabs.query({ url: `chrome-extension://${chrome.runtime.id}/*` });
  // The new-tab override reports chrome://newtab/ as its url.
  const newTabs = (await chrome.tabs.query({})).filter((t) => /^chrome:\/\/new-?tab/.test(t.url || ''));
  const reloadTabs = [
    ...own.map((t) => ({ tabId: t.id, url: t.url, active: t.active, windowId: t.windowId })),
    ...newTabs.map((t) => ({ tabId: t.id, url: ext(HOME), active: t.active, windowId: t.windowId })),
  ];
  await chrome.storage.local.set({ reloadTabs, lastReloadAt: now });
  chrome.runtime.reload();
}

// After a reload our own pages are dead: bring them back.
async function restoreTabs() {
  const { reloadTabs } = await chrome.storage.local.get('reloadTabs');
  if (!reloadTabs) return;
  await chrome.storage.local.remove('reloadTabs');
  for (const t of reloadTabs) {
    try {
      let existing = null;
      try { existing = await chrome.tabs.get(t.tabId); } catch { /* closed */ }
      if (existing) {
        if (existing.url !== t.url) await chrome.tabs.update(existing.id, { url: t.url });
      } else {
        await chrome.tabs.create({ url: t.url, active: t.active, windowId: t.windowId });
      }
    } catch { /* window gone: skip */ }
  }
}

async function focusTab(tab) {
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true, drawAttention: true });
}

// ---------- pause (until Chrome restarts: storage.session is cleared then) ----------
async function isPaused() {
  return Boolean((await chrome.storage.session.get('paused')).paused);
}

async function fireWarn(cfg, entryId, startTime) {
  if (await isPaused()) return;
  const entry = cfg.schedule.find((e) => e.id === entryId);
  if (!entry || !entry.enabled) return;
  const key = `warned|${entryId}|${startTime}`;
  if (await isMarked(key)) return;
  await mark(key);
  const base = ext(REMINDER);
  const url = `${base}?entry=${encodeURIComponent(entryId)}&start=${startTime}`;
  const tabs = await chrome.tabs.query({ url: `${base}*` });
  const same = tabs.find((t) => t.url === url);
  if (same) return focusTab(same);
  for (const t of tabs) chrome.tabs.remove(t.id);
  const tab = await chrome.tabs.create({ url, active: true });
  await chrome.windows.update(tab.windowId, { focused: true, drawAttention: true });
}

async function fireStart(cfg, entryId, startTime) {
  if (await isPaused()) return;
  const entry = cfg.schedule.find((e) => e.id === entryId);
  if (!entry || !entry.enabled) return;
  if (await isMarked(`done|${entryId}|${startTime}`)) return;
  await mark(`done|${entryId}|${startTime}`);
  const target = `${ext(STREAM)}?entry=${encodeURIComponent(entryId)}`;
  const tabs = await chrome.tabs.query({ url: `${ext(REMINDER)}*` });
  if (tabs.length) {
    await chrome.tabs.update(tabs[0].id, { url: target, active: true });
    await chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    const tab = await chrome.tabs.create({ url: target, active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  }
}

chrome.alarms.onAlarm.addListener((alarm) => serial(async () => {
  if (alarm.name !== 'tick') {
    const [kind, entryId, start] = alarm.name.split('|');
    const cfg = await loadConfig();
    if (kind === 'warn') await fireWarn(cfg, entryId, Number(start));
    else if (kind === 'start') await fireStart(cfg, entryId, Number(start));
  }
  await rebuildAlarmsNow();
  if (alarm.name === 'tick') await checkForUpdate(await loadConfig()).catch(() => {});
}));

// The toolbar icon opens the side panel (no action.onClicked: they conflict).
const setupPanel = () => chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
setupPanel();
// Content scripts read the pause flag from storage.session.
chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }).catch(() => {});

const HOME_FOCUS = `${HOME}?f=1`;
async function refocusStartTabs() {
  const urls = new Set(['chrome://newtab/', 'chrome://new-tab-page/', ext(HOME)]);
  const tabs = await chrome.tabs.query({ active: true });
  for (const t of tabs) {
    if (urls.has(t.url) || urls.has(t.pendingUrl)) chrome.tabs.update(t.id, { url: ext(HOME_FOCUS) }).catch(() => {});
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  setupPanel();
  serial(async () => {
    await ensureMigrated().catch(() => {});
    if (details.reason === 'update') await restoreTabs();
  });
  rebuildAlarms();
});
chrome.runtime.onStartup.addListener(() => {
  setupPanel();
  serial(() => ensureMigrated().catch(() => {}));
  rebuildAlarms();
  refocusStartTabs().catch(() => {});
  loadConfig().then(checkForUpdate).catch(() => {});
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && (changes.cfg_schedule || changes.cfg_flags)) rebuildAlarms();
});

// Navigating to the extension page directly gives it keyboard focus
// (otherwise Chrome may leave focus in the address bar on a new tab).
chrome.tabs.onCreated.addListener(async (tab) => {
  const u = tab.pendingUrl || tab.url || '';
  if ((u === 'chrome://newtab/' || u === 'chrome://new-tab-page/') && !(await isPaused())) {
    chrome.tabs.update(tab.id, { url: ext(HOME) }).catch(() => {});
  }
});

// ---------- facebook marker ----------
async function setFbMarker(tabId) {
  const s = (await chrome.storage.session.get('fb')).fb || {};
  s[tabId] = Date.now();
  await chrome.storage.session.set({ fb: s });
}
async function fbScheduled(tabId) {
  const s = (await chrome.storage.session.get('fb')).fb || {};
  return Boolean(s[tabId] && Date.now() - s[tabId] < 5 * 60000);
}

// ---------- messages ----------
async function exitFullscreen(windowId) {
  try {
    const w = await chrome.windows.get(windowId);
    if (w.state === 'fullscreen') await chrome.windows.update(windowId, { state: 'maximized' });
  } catch { /* ignore */ }
}

// Watch history writes are serialised (read-modify-write on storage.local).
let historyQueue = Promise.resolve();
function recordHistory(entry) {
  historyQueue = historyQueue.then(async () => {
    const { watchHistory, positions } = await chrome.storage.local.get(['watchHistory', 'positions']);
    const now = Date.now();
    await chrome.storage.local.set({
      watchHistory: updateHistory(watchHistory, entry, now),
      positions: updatePositions(positions, entry, now),
    });
  }).catch(() => {});
  return historyQueue;
}

async function handle(msg, sender) {
  const tab = sender.tab;
  switch (msg && msg.type) {
    case 'reminder-done':
      await mark(`done|${msg.entryId}|${msg.startTime}`);
      return { ok: true };
    case 'resolve': {
      const cfg = await loadConfig();
      const entry = msg.entry || cfg.schedule.find((e) => e.id === msg.entryId);
      if (!entry) return { status: 'error', message: 'Запис не знайдено' };
      return resolveChannel(entry.url, entry.keywords, localDateKey(new Date()));
    }
    case 'open-stream': {
      if (!tab) return { ok: false };
      const cfg = await loadConfig();
      if (msg.facebook) await setFbMarker(tab.id);
      await chrome.tabs.update(tab.id, { url: msg.url });
      if (cfg.fullscreenOnStream) await chrome.windows.update(tab.windowId, { state: 'fullscreen' }).catch(() => {});
      return { ok: true };
    }
    case 'go-home':
      if (!tab) return { ok: false };
      await exitFullscreen(tab.windowId);
      await chrome.tabs.update(tab.id, { url: ext(HOME) });
      return { ok: true };
    case 'exit-fullscreen':
      if (tab) await exitFullscreen(tab.windowId);
      return { ok: true };
    case 'set-paused':
      if (msg.paused) await chrome.storage.session.set({ paused: true });
      else { await chrome.storage.session.remove('paused'); rebuildAlarms(); }
      return { ok: true };
    case 'open-default-newtab':
      // While paused the new tab shows Chrome's own page instead of ours.
      if (!tab) return { ok: false };
      await chrome.tabs.update(tab.id, { url: 'chrome://new-tab-page/' });
      return { ok: true };
    case 'refocus':
      // Extension-initiated navigation gives the page keyboard focus (not the address bar).
      if (tab && !(await isPaused())) await chrome.tabs.update(tab.id, { url: ext(HOME_FOCUS) });
      return { ok: true };
    case 'save-video':
      return saved.saveVideo({ id: msg.id, title: msg.title, categoryId: msg.categoryId });
    case 'save-page':
      return saved.savePage({ url: msg.url, title: msg.title });
    case 'is-page-saved': {
      const key = saved.pageKey(msg.url);
      return { saved: Boolean(key) && (await saved.isSaved(key)) };
    }
    case 'remove-video':
      return saved.removeVideo(msg.id);
    case 'list-saved':
      return saved.listSaved();
    case 'is-saved':
      return { saved: await saved.isSaved(msg.id) };
    case 'move-video':
      return saved.moveVideo(msg.id, msg.categoryId);
    case 'record-history':
      await recordHistory(msg.entry);
      return { ok: true };
    case 'get-resume': {
      await historyQueue;
      const { watchHistory, positions } = await chrome.storage.local.get(['watchHistory', 'positions']);
      return { seconds: resumeSeconds(positionFor(msg.id, watchHistory, positions)) };
    }
    case 'fb-check':
      return { scheduled: tab ? await fbScheduled(tab.id) : false };
    default:
      return undefined;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handle(msg, sender).then(sendResponse, (e) => sendResponse({ status: 'error', message: String(e && e.message) }));
  return true;
});
