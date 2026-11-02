// Every website: big "◀ Назад до помічника" (back to the home page) and "⭐ Зберегти" (bookmark this page
// into «Мої відео і сайти») buttons in the bottom-left corner. On YouTube youtube.js puts its own
// "⭐ Зберегти" (watch pages only) into the <slot>. Shadow DOM keeps the site's styles out.
// Hidden in fullscreen and while the helper is paused.
(() => {
  if (window.top !== window || document.getElementById('granny-home-nav')) return;
  let paused = false;
  const host = document.createElement('div');
  host.id = 'granny-home-nav';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
    <style>
      :host { all: initial; position: fixed; left: 16px; bottom: 16px; z-index: 2147483000; }
      .box { display: flex; gap: 12px; }
      button { font: 700 26px "Segoe UI", Arial, sans-serif; line-height: 1.2; color: #1b1b1b; border: 4px solid #1b1b1b; border-radius: 20px; padding: 12px 20px; cursor: pointer; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35); }
      .home { background: #8fd3c7; }
      .save { background: #f6a98e; }
      button:hover { filter: brightness(0.93); }
      button:focus { outline: 8px solid #0047d4; outline-offset: 4px; }
    </style>
    <div class="box">
      <button type="button" class="home">◀ Назад до помічника</button>
      <button type="button" class="save" hidden>⭐ Зберегти</button>
      <slot></slot>
    </div>`;
  const goHome = () => { try { chrome.runtime.sendMessage({ type: 'go-home' }); } catch { /* extension reloaded */ } };
  root.querySelector('.home').addEventListener('click', goHome);

  // "⭐ Зберегти" for any site except YouTube (see above). Re-checked when a single-page site changes the URL.
  const save = root.querySelector('.save');
  const ask = (msg) => { try { return chrome.runtime.sendMessage(msg).catch(() => null); } catch { return Promise.resolve(null); } };
  let checkedUrl = null;
  let saved = false;
  const paint = (text) => { save.textContent = text || (saved ? '✓ Збережено' : '⭐ Зберегти'); };
  const refresh = async () => {
    if (location.href === checkedUrl) return;
    const url = checkedUrl = location.href;
    saved = false;
    paint();
    const r = await ask({ type: 'is-page-saved', url });
    if (url === checkedUrl && r && r.saved) { saved = true; paint(); }
  };
  if (!/(^|\.)youtube\.com$/.test(location.hostname)) {
    save.hidden = false;
    save.addEventListener('click', async () => {
      if (saved) return;
      const url = location.href;
      const r = await ask({ type: 'save-page', url, title: document.title });
      if (r && (r.status === 'saved' || r.status === 'exists')) { if (url === location.href) { saved = true; paint(); } }
      else { paint('Не вдалося'); setTimeout(() => paint(), 2500); }
    });
    refresh();
    setInterval(refresh, 2000);
  }
  const sync = () => { host.hidden = paused || Boolean(document.fullscreenElement); host.style.display = host.hidden ? 'none' : ''; };
  document.addEventListener('fullscreenchange', sync);
  document.documentElement.append(host);
  try {
    chrome.storage.session.get('paused').then((s) => { paused = Boolean(s.paused); sync(); }, () => {});
    chrome.storage.onChanged.addListener((c, area) => { if (area === 'session' && c.paused) { paused = Boolean(c.paused.newValue); sync(); } });
  } catch { /* extension reloaded */ }
})();
