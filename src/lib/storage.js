import { normalizeConfig, migrateConfig, CONFIG_VERSION } from './config.js';

const KEYS = ['cfg_tiles', 'cfg_schedule', 'cfg_topics', 'cfg_flags', 'cfg_version'];

/** Upgrades stored topics once (cfg_version < 2). Returns the (possibly updated) raw storage object. */
export async function ensureMigrated(s) {
  const stored = s || (await chrome.storage.sync.get(KEYS));
  const from = Number(stored.cfg_version) || 1;
  if (from >= CONFIG_VERSION) return stored;
  const { config, changed } = migrateConfig({ topics: stored.cfg_topics }, from);
  const out = { ...stored, cfg_version: CONFIG_VERSION };
  const write = { cfg_version: CONFIG_VERSION };
  if (changed) { out.cfg_topics = config.topics; write.cfg_topics = config.topics; }
  try { await chrome.storage.sync.set(write); } catch { /* quota/offline: still use migrated data */ }
  return out;
}

export async function loadConfig() {
  const s = await ensureMigrated(await chrome.storage.sync.get(KEYS));
  const flags = s.cfg_flags || {};
  return normalizeConfig({
    tiles: s.cfg_tiles,
    schedule: s.cfg_schedule,
    topics: s.cfg_topics,
    hideShortsComments: flags.hideShortsComments,
    fullscreenOnStream: flags.fullscreenOnStream,
  });
}

/** Throws on quota errors (message is Ukrainian-friendly for the caller to show). */
export async function saveConfig(cfg) {
  const c = normalizeConfig(cfg);
  await chrome.storage.sync.set({
    cfg_tiles: c.tiles,
    cfg_schedule: c.schedule,
    cfg_topics: c.topics,
    cfg_version: CONFIG_VERSION,
    cfg_flags: { hideShortsComments: c.hideShortsComments, fullscreenOnStream: c.fullscreenOnStream },
  });
  return c;
}

export async function getAnnounceAudio() {
  const s = await chrome.storage.local.get('announceAudio');
  return s.announceAudio || null;
}

export async function setAnnounceAudio(dataUrl) {
  if (dataUrl) await chrome.storage.local.set({ announceAudio: dataUrl });
  else await chrome.storage.local.remove('announceAudio');
}
