// Every website: big "🏠 Помічник" (back to the home page) and "◀ Назад" buttons in the bottom-left corner.
// Shadow DOM keeps the site's styles out. Hidden in fullscreen and while the helper is paused.
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
      .home { background: #ffcf33; }
      .back { background: #e8dcc4; }
      button:hover { filter: brightness(0.93); }
      button:focus { outline: 8px solid #0047d4; outline-offset: 4px; }
    </style>
    <div class="box">
      <button type="button" class="home">🏠 Помічник</button>
      <button type="button" class="back">◀ Назад</button>
    </div>`;
  const goHome = () => { try { chrome.runtime.sendMessage({ type: 'go-home' }); } catch { /* extension reloaded */ } };
  root.querySelector('.home').addEventListener('click', goHome);
  root.querySelector('.back').addEventListener('click', () => {
    if (history.length > 1) history.back(); else goHome();
  });
  const sync = () => { host.hidden = paused || Boolean(document.fullscreenElement); host.style.display = host.hidden ? 'none' : ''; };
  document.addEventListener('fullscreenchange', sync);
  document.documentElement.append(host);
  try {
    chrome.storage.session.get('paused').then((s) => { paused = Boolean(s.paused); sync(); }, () => {});
    chrome.storage.onChanged.addListener((c, area) => { if (area === 'session' && c.paused) { paused = Boolean(c.paused.newValue); sync(); } });
  } catch { /* extension reloaded */ }
})();
