(() => {
  'use strict';
  const S = window.GrannySelectors;
  let active = null;
  let overlay = null;
  let paused = false;

  // ---------- helpers ----------
  const send = (msg) => {
    try {
      const p = chrome.runtime.sendMessage(msg);
      if (p && p.catch) p.catch(() => {});
    } catch { /* extension reloaded */ }
  };
  const goHome = () => send({ type: 'go-home' });
  // Request/response to the background; resolves null when the extension was reloaded.
  const ask = (msg) => new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(msg, (res) => {
        void chrome.runtime.lastError;
        resolve(res || null);
      });
    } catch { resolve(null); }
  });

  function pageType() {
    const p = location.pathname;
    if (p === '/watch') return 'watch';
    if (p.startsWith('/shorts/')) return 'shorts';
    if (p === '/results') return 'results';
    if (p === '/') return 'home';
    return 'other';
  }
  const isFeedPage = () => !['watch', 'shorts'].includes(pageType());

  function isEditable(target) {
    const t = target && target.nodeType === 1 ? target : document.activeElement;
    if (!t) return false;
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable;
  }

  function videoIdFromHref(href) {
    try { return new URL(href, location.origin).searchParams.get('v'); } catch { return null; }
  }

  // ---------- hide Shorts and comments ----------
  const style = document.createElement('style');
  style.id = 'granny-hide-style';
  style.textContent = `html.granny-hide:not(.granny-paused) :is(${S.hide.join(',')}) { display: none !important; }`;
  document.documentElement.appendChild(style);
  function applyFlags(flags) {
    document.documentElement.classList.toggle('granny-hide', !flags || flags.hideShortsComments !== false);
  }
  try {
    chrome.storage.sync.get('cfg_flags').then((s) => applyFlags(s.cfg_flags));
    chrome.storage.onChanged.addListener((c, area) => { if (area === 'sync' && c.cfg_flags) applyFlags(c.cfg_flags.newValue); });
  } catch { applyFlags(null); }

  // ---------- cards ----------
  function visible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 40 && r.height > 40 && getComputedStyle(el).visibility !== 'hidden';
  }
  function cardHref(card) {
    const a = card.querySelector(S.cardLink);
    return a ? a.href : null;
  }
  function getCards() {
    const all = [...document.querySelectorAll(S.cardSelectors.join(','))].filter((c) => cardHref(c) && visible(c));
    const set = new Set(all);
    const outer = all.filter((c) => {
      for (let p = c.parentElement; p; p = p.parentElement) if (set.has(p)) return false;
      return true;
    });
    return outer.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  }
  function setActive(card, scroll = true, block = 'center') {
    if (active) active.classList.remove('granny-active');
    active = card;
    if (card) {
      card.classList.add('granny-active');
      if (scroll) card.scrollIntoView({ block, behavior: 'smooth' });
    }
  }
  function firstInViewport(cards) {
    return cards.find((c) => c.getBoundingClientRect().top >= 0) || cards[0];
  }
  function ensureActive(retries = 6) {
    if (paused || !isFeedPage() || overlay) return;
    if (active && active.isConnected) return;
    const cards = getCards();
    if (cards.length) setActive(firstInViewport(cards), false);
    else if (retries > 0) setTimeout(() => ensureActive(retries - 1), 1000);
  }
  function moveActive(dir) {
    const cards = getCards();
    if (!cards.length) return;
    const f = document.activeElement;
    if (f && f !== document.body && !f.closest(S.nativeEnterZones)) f.blur();
    let i = active ? cards.indexOf(active) : -1;
    if (i < 0) { setActive(firstInViewport(cards)); return; }
    i = Math.min(cards.length - 1, Math.max(0, i + dir));
    setActive(cards[i]);
  }

  // ---------- watch page: save button, history ----------
  const SAVE_LABEL = '⭐ Зберегти';
  const SAVED_LABEL = '✓ Збережено';
  let saveBtn = null;
  let overlaySave = null;
  const saveState = { id: null, saved: false };

  const currentId = () => new URL(location.href).searchParams.get('v');
  function playerEl() { return document.querySelector(S.player); }
  function videoData() {
    try { const p = playerEl(); return (p && p.getVideoData && p.getVideoData()) || {}; } catch { return {}; }
  }
  function videoTitle() {
    const t = document.querySelector(S.watchTitle);
    return (videoData().title || (t && t.textContent) || document.title.replace(/^\(\d+\)\s*/, '').replace(/\s+-\s+YouTube$/, '') || 'Відео').trim();
  }
  function isLive(video) {
    if (!Number.isFinite(video.duration)) return true;
    const b = document.querySelector(S.liveBadge);
    return Boolean(b && getComputedStyle(b).display !== 'none' && !b.hasAttribute('disabled') && b.offsetParent);
  }

  function paintSave() {
    const label = saveState.saved ? SAVED_LABEL : SAVE_LABEL;
    for (const b of [saveBtn, overlaySave]) if (b) b.textContent = label;
  }
  async function refreshSaved() {
    const id = currentId();
    saveState.id = id;
    saveState.saved = false;
    paintSave();
    if (!id) return;
    const r = await ask({ type: 'is-saved', id });
    if (saveState.id === id && r && r.saved) { saveState.saved = true; paintSave(); }
  }
  async function doSave() {
    const id = currentId();
    if (!id || saveState.saved) return; // already saved: nothing to do
    const r = await ask({ type: 'save-video', id, title: videoTitle() });
    if (r && (r.status === 'saved' || r.status === 'exists')) {
      saveState.saved = true;
      saveState.id = id;
      paintSave();
    } else {
      for (const b of [saveBtn, overlaySave]) if (b) b.textContent = 'Не вдалося';
      setTimeout(paintSave, 2500);
    }
  }
  function syncSaveButton() {
    const show = !paused && pageType() === 'watch' && !document.fullscreenElement;
    if (show && !saveBtn) {
      saveBtn = document.createElement('button');
      saveBtn.id = 'granny-save-btn';
      saveBtn.type = 'button';
      saveBtn.addEventListener('click', doSave);
      document.body.append(saveBtn);
      paintSave();
    }
    if (saveBtn) saveBtn.hidden = !show;
    if (!show && active === saveBtn) setActive(null);
  }

  // Watch history: sent to the background (it uses the tested lib/history.js).
  function recordHistory() {
    if (paused || pageType() !== 'watch') return;
    const video = document.querySelector(S.mainVideo);
    const player = playerEl();
    if (!video || (player && player.matches(S.adShowing))) return;
    const data = videoData();
    const id = currentId();
    if (!id || (data.video_id && data.video_id !== id)) return; // mid-navigation
    if (video.readyState < 1) return;
    const ch = document.querySelector(S.watchChannel);
    const live = isLive(video);
    send({
      type: 'record-history',
      entry: {
        id,
        title: videoTitle(),
        channel: (data.author || (ch && ch.textContent) || '').trim(),
        live,
        time: live ? undefined : Math.floor(video.currentTime),
        duration: live ? undefined : video.duration,
      },
    });
  }
  setInterval(() => {
    const v = document.querySelector(S.mainVideo);
    if (v && !v.paused && !v.ended) recordHistory();
  }, 10000);
  document.addEventListener('pause', (e) => { if (e.target instanceof HTMLVideoElement) recordHistory(); }, true);
  window.addEventListener('pagehide', recordHistory);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') recordHistory(); });
  document.addEventListener('fullscreenchange', syncSaveButton);

  // Keyboard on the watch page: ArrowUp/Down choose [save button, ...related videos].
  function relatedCards() {
    return [...document.querySelectorAll(S.relatedSelectors.join(','))].filter((c) => {
      const href = cardHref(c);
      return href && !/\/shorts\//.test(href) && visible(c);
    });
  }
  function watchList() {
    const list = relatedCards();
    if (saveBtn && !saveBtn.hidden) list.unshift(saveBtn);
    return list;
  }
  function watchKey(e) {
    if (document.fullscreenElement) return;
    const f = document.activeElement;
    if (f && f !== document.body && f.closest(`${S.nativeEnterZones}, ${S.playerMenus}`)) return;
    const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const list = watchList();
      if (!list.length) return;
      stop();
      if (f && f !== document.body) f.blur();
      let i = active ? list.indexOf(active) : -1;
      if (i < 0) i = e.key === 'ArrowDown' ? (list.length > 1 && list[0] === saveBtn ? 1 : 0) : 0;
      else i = Math.min(list.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)));
      setActive(list[i], true, 'nearest');
    } else if (e.key === 'Enter' && active && active.isConnected) {
      if (active === saveBtn) { stop(); doSave(); return; }
      const href = cardHref(active);
      if (href) { stop(); location.href = href; }
    }
  }

  // ---------- end-of-video overlay ----------
  function collectRelated() {
    const current = new URL(location.href).searchParams.get('v');
    const seen = new Set([current]);
    const out = [];
    const add = (id, title) => {
      if (!id || seen.has(id) || out.length >= 4) return;
      seen.add(id);
      out.push({ id, title: (title || '').trim() || 'Відео' });
    };
    for (const card of document.querySelectorAll(S.relatedSelectors.join(','))) {
      const a = card.querySelector(S.cardLink);
      if (!a || /\/shorts\//.test(a.href)) continue;
      let title = '';
      for (const sel of S.titleSelectors) {
        const t = card.querySelector(sel);
        if (t) { title = t.getAttribute('title') || t.textContent; if (title && title.trim()) break; }
      }
      add(videoIdFromHref(a.href), title);
    }
    if (out.length < 4) {
      for (const a of document.querySelectorAll(S.endscreenTiles)) {
        const t = a.querySelector(S.endscreenTitle);
        add(videoIdFromHref(a.href), t && t.textContent);
      }
    }
    return out;
  }

  function hideOverlay() {
    if (overlay) { overlay.remove(); overlay = null; overlaySave = null; }
  }
  function showOverlay() {
    if (overlay) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    const items = collectRelated();
    overlay = document.createElement('div');
    overlay.id = 'granny-end-overlay';
    const h = document.createElement('h1');
    h.textContent = 'Що дивитися далі';
    const grid = document.createElement('div');
    grid.className = 'granny-grid';
    for (const it of items) {
      const b = document.createElement('button');
      b.className = 'granny-card';
      b.dataset.href = `/watch?v=${it.id}`;
      const img = document.createElement('img');
      img.src = `https://i.ytimg.com/vi/${it.id}/mqdefault.jpg`;
      img.alt = '';
      const s = document.createElement('span');
      s.textContent = it.title;
      b.append(img, s);
      b.addEventListener('click', () => { location.href = b.dataset.href; });
      grid.append(b);
    }
    overlaySave = document.createElement('button');
    overlaySave.className = 'granny-save';
    overlaySave.addEventListener('click', doSave);
    paintSave();
    const home = document.createElement('button');
    home.className = 'granny-home';
    home.textContent = '🏠 На головну';
    home.addEventListener('click', goHome);
    const actions = document.createElement('div');
    actions.className = 'granny-actions';
    actions.append(overlaySave, home);
    overlay.append(h, grid, actions);
    document.body.append(overlay);
    (overlay.querySelector('button') || home).focus();
  }
  function overlayKey(e) {
    const btns = [...overlay.querySelectorAll('button')];
    const cur = btns.indexOf(document.activeElement);
    const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    switch (e.key) {
      case 'ArrowDown': case 'ArrowRight': stop(); btns[(cur + 1) % btns.length].focus(); break;
      case 'ArrowUp': case 'ArrowLeft': stop(); btns[(cur - 1 + btns.length) % btns.length].focus(); break;
      case 'Enter': case ' ': stop(); (btns[cur] || btns[0]).click(); break;
      case 'Escape': stop(); goHome(); break;
      default: stop();
    }
  }

  document.addEventListener('ended', (e) => {
    if (paused || !(e.target instanceof HTMLVideoElement)) return;
    if (pageType() !== 'watch') return;
    const player = document.querySelector(S.player);
    if (player && player.matches(S.adShowing)) return;
    setTimeout(showOverlay, 300);
  }, true);
  document.addEventListener('play', (e) => {
    if (overlay && e.target instanceof HTMLVideoElement) hideOverlay();
  }, true);

  // ---------- keys ----------
  window.addEventListener('keydown', (e) => {
    if (paused || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
    if (overlay) { overlayKey(e); return; }
    if (isEditable(e.target) || isEditable(document.activeElement)) return;
    if (e.key === 'Escape') {
      if (document.fullscreenElement) return; // native: leave fullscreen
      e.preventDefault(); e.stopImmediatePropagation();
      goHome();
      return;
    }
    if (pageType() === 'watch') { watchKey(e); return; } // other keys stay native (Space, F, M, J, K, L...)
    if (!isFeedPage()) return;
    const move = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (move) {
      e.preventDefault(); e.stopImmediatePropagation();
      moveActive(move);
    } else if (e.key === 'Enter') {
      const focused = document.activeElement;
      const native = focused && focused !== document.body && focused.closest(S.nativeEnterZones);
      if (!native && active && active.isConnected) {
        const href = cardHref(active);
        if (href) { e.preventDefault(); e.stopImmediatePropagation(); location.href = href; }
      }
    }
  }, true);

  // ---------- SPA navigation ----------
  window.addEventListener('yt-navigate-start', () => {
    recordHistory();
    hideOverlay();
  });
  window.addEventListener('yt-navigate-finish', () => {
    hideOverlay();
    setActive(null);
    syncSaveButton();
    refreshSaved();
    ensureActive();
  });
  // ---------- pause: the grandson can switch everything off until Chrome restarts ----------
  function setPaused(p) {
    paused = Boolean(p);
    document.documentElement.classList.toggle('granny-paused', paused);
    if (paused) { hideOverlay(); setActive(null); }
    syncSaveButton();
    ensureActive();
  }
  try {
    chrome.storage.session.get('paused').then((s) => setPaused(s.paused), () => {});
    chrome.storage.onChanged.addListener((c, area) => { if (area === 'session' && c.paused) setPaused(c.paused.newValue); });
  } catch { /* extension reloaded */ }

  syncSaveButton();
  refreshSaved();
  ensureActive();
})();
