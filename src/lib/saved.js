// Saved videos live in a Chrome bookmarks folder «Бабусині відео»; subfolders are categories.
// Pure helpers come first; chrome.bookmarks code is below (call only from extension contexts).

export const FOLDER_TITLE = 'Бабусині відео';
const ID_RE = /^[\w-]{11}$/;
const YT_HOSTS = /^(?:www\.|m\.|music\.)?youtube\.com$/;

/** Video id from any YouTube URL (watch, youtu.be, shorts, live, embed) or null. */
export function videoIdFromUrl(url) {
  let u;
  try { u = new URL(String(url)); } catch { return null; }
  let id = null;
  if (u.hostname === 'youtu.be') {
    id = u.pathname.split('/')[1];
  } else if (YT_HOSTS.test(u.hostname)) {
    const m = /^\/(?:shorts|live|embed|v)\/([^/?#]+)/.exec(u.pathname);
    id = m ? m[1] : u.pathname === '/watch' ? u.searchParams.get('v') : null;
  }
  return id && ID_RE.test(id) ? id : null;
}

export const watchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;

/** Canonical watch URL without extra params, or null. */
export function normalizeVideoUrl(url) {
  const id = videoIdFromUrl(url);
  return id ? watchUrl(id) : null;
}

/** "Назва - YouTube" -> "Назва" (also drops the "(3) " notification counter). */
export function cleanTabTitle(title) {
  return String(title || '').replace(/^\(\d+\)\s*/, '').replace(/\s+-\s+YouTube$/, '').trim() || 'Відео';
}

/** Which root child is "Other bookmarks": id '2', else the second child, else any non-bar folder. */
export function pickOtherBookmarksId(rootChildren) {
  const kids = (rootChildren || []).filter((k) => k && !k.url);
  const hit = kids.find((k) => k.id === '2') || kids[1] || kids.find((k) => k.id !== '1');
  return hit ? hit.id : null;
}

const toItem = (b) => ({ bookmarkId: b.id, id: videoIdFromUrl(b.url), title: b.title || 'Відео', dateAdded: b.dateAdded || 0 });
const newestFirst = (a, b) => b.dateAdded - a.dateAdded;

function collect(node, out = []) {
  for (const c of node.children || []) {
    if (c.url) { const it = toItem(c); if (it.id) out.push(it); } else collect(c, out);
  }
  return out;
}

/** Folder subtree -> {categories:[{id,title,items}], uncategorized:[items]}, newest first. */
export function groupSaved(folder) {
  const categories = [];
  const uncategorized = [];
  for (const c of (folder && folder.children) || []) {
    if (c.url) { const it = toItem(c); if (it.id) uncategorized.push(it); } else {
      categories.push({ id: c.id, title: c.title, items: collect(c).sort(newestFirst) });
    }
  }
  return { categories, uncategorized: uncategorized.sort(newestFirst) };
}

/** All bookmark nodes in the folder tree that hold this video. */
export function findVideoNodes(folder, id) {
  const out = [];
  const walk = (n) => {
    for (const c of n.children || []) {
      if (c.url) { if (videoIdFromUrl(c.url) === id) out.push(c); } else walk(c);
    }
  };
  if (folder) walk(folder);
  return out;
}

// ---------- chrome.bookmarks ----------
async function otherBookmarksId() {
  const [root] = await chrome.bookmarks.getTree();
  return pickOtherBookmarksId(root.children);
}

/** Folder id (cache re-validated), or null if it does not exist and create is false. */
export async function getFolderId(create = false) {
  const cached = (await chrome.storage.local.get('savedFolderId')).savedFolderId;
  if (cached) {
    try {
      const [n] = await chrome.bookmarks.get(cached);
      if (n && !n.url && n.title === FOLDER_TITLE) return n.id;
    } catch { /* deleted */ }
  }
  const parentId = await otherBookmarksId();
  if (!parentId) throw new Error('Не знайдено теку закладок');
  let found = (await chrome.bookmarks.getChildren(parentId)).find((n) => !n.url && n.title === FOLDER_TITLE);
  if (!found && create) found = await chrome.bookmarks.create({ parentId, title: FOLDER_TITLE });
  if (!found) { await chrome.storage.local.remove('savedFolderId'); return null; }
  await chrome.storage.local.set({ savedFolderId: found.id });
  return found.id;
}

async function folderTree() {
  const id = await getFolderId(false);
  if (!id) return null;
  const [tree] = await chrome.bookmarks.getSubTree(id);
  return tree;
}

/** {folderId, categories, uncategorized}; empty when nothing is saved yet. */
export async function listSaved() {
  const tree = await folderTree();
  if (!tree) return { folderId: null, categories: [], uncategorized: [] };
  return { folderId: tree.id, ...groupSaved(tree) };
}

export async function isSaved(id) {
  return findVideoNodes(await folderTree(), id).length > 0;
}

/** -> {status:'saved'|'exists'} */
export async function saveVideo({ id, title, categoryId }) {
  if (!ID_RE.test(String(id))) throw new Error('Невірне відео');
  if (await isSaved(id)) return { status: 'exists' };
  const folderId = await getFolderId(true);
  let parentId = folderId;
  if (categoryId) {
    try {
      const [c] = await chrome.bookmarks.get(categoryId);
      if (c && !c.url) parentId = c.id;
    } catch { /* fall back to root */ }
  }
  await chrome.bookmarks.create({ parentId, title: String(title || 'Відео'), url: watchUrl(id) });
  return { status: 'saved' };
}

export async function removeVideo(id) {
  const nodes = findVideoNodes(await folderTree(), id);
  for (const n of nodes) await chrome.bookmarks.remove(n.id);
  return { removed: nodes.length };
}

/** categoryId null/'' -> back to the folder root. */
export async function moveVideo(id, categoryId) {
  const nodes = findVideoNodes(await folderTree(), id);
  if (!nodes.length) return { moved: 0 };
  const parentId = categoryId || (await getFolderId(false));
  for (const n of nodes) await chrome.bookmarks.move(n.id, { parentId });
  return { moved: nodes.length };
}

export async function createCategory(name) {
  const title = String(name || '').trim();
  if (!title) throw new Error('Вкажіть назву');
  const parentId = await getFolderId(true);
  const exists = (await chrome.bookmarks.getChildren(parentId)).find((n) => !n.url && n.title === title);
  return exists || chrome.bookmarks.create({ parentId, title });
}

/** Deletes a category; non-empty ones only with force. Returns {deleted, count}. */
export async function deleteCategory(categoryId, force = false) {
  const [node] = await chrome.bookmarks.getSubTree(categoryId);
  const count = collect(node).length;
  if (count && !force) return { deleted: false, count };
  await chrome.bookmarks.removeTree(categoryId);
  return { deleted: true, count };
}
