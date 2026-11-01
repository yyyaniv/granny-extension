// Facebook: (1) always, big "previous / next post" buttons that scroll at constant speed;
// (2) best-effort: when this tab was opened by the schedule, find the live video and open it.
(async () => {
  const GS = window.GrannyScroll;
  const BAR = 56; // Facebook's fixed top bar
  let paused = false;
  let box = null;
  let lastClick = 0;

  // ---------- post buttons ----------
  // Top-level posts only: articles nested in another article are comments.
  function postTops() {
    return [...document.querySelectorAll('[role="article"]')]
      .filter((a) => !(a.parentElement && a.parentElement.closest('[role="article"]')) && a.getBoundingClientRect().height > 80)
      .map((a) => a.getBoundingClientRect().top + window.scrollY);
  }
  function step(dir) {
    const now = performance.now();
    if (!GS.allowStep(true, now, lastClick)) return; // click throttle
    lastClick = now;
    const tops = postTops();
    const i = GS.pickIndex(tops, window.scrollY, dir, BAR);
    if (i >= 0) GS.animateTo(tops[i] - BAR);
    else GS.animateTo(window.scrollY + dir * window.innerHeight * 0.8); // no posts found: page-sized step
  }
  function makeButtons() {
    const style = document.createElement('style');
    style.textContent = `
      #granny-fb-nav { position: fixed; right: 16px; top: 50%; transform: translateY(-50%); z-index: 2147483000; display: flex; flex-direction: column; gap: 16px; }
      #granny-fb-nav[hidden] { display: none !important; }
      #granny-fb-nav button { width: 190px; font: 700 26px "Segoe UI", Arial, sans-serif; line-height: 1.2; color: #1b1b1b; background: #ffcf33; border: 4px solid #1b1b1b; border-radius: 22px; padding: 16px 12px; cursor: pointer; }
      #granny-fb-nav button:hover { filter: brightness(0.93); }
      #granny-fb-nav button:focus { outline: 10px solid #0047d4; outline-offset: 6px; filter: brightness(0.93); }`;
    box = document.createElement('div');
    box.id = 'granny-fb-nav';
    for (const [label, dir] of [['▲ Попередній допис', -1], ['▼ Наступний допис', 1]]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', () => step(dir));
      box.append(b);
    }
    box.hidden = paused;
    document.documentElement.append(style, box);
  }
  const syncButtons = () => { if (box) box.hidden = paused || Boolean(document.fullscreenElement); };
  document.addEventListener('fullscreenchange', syncButtons);
  makeButtons();
  try {
    chrome.storage.session.get('paused').then((s) => { paused = Boolean(s.paused); syncButtons(); }, () => {});
    chrome.storage.onChanged.addListener((c, area) => { if (area === 'session' && c.paused) { paused = Boolean(c.paused.newValue); syncButtons(); } });
  } catch { /* extension reloaded */ }

  // ---------- scheduled live ----------
  let scheduled = false;
  try { scheduled = (await chrome.runtime.sendMessage({ type: 'fb-check' })).scheduled; } catch { return; }
  if (!scheduled) return;

  const LIVE_RE = /(наживо|в\s*ефірі|прямий\s*ефір|\blive\b)/i;
  const LINK_RE = /\/(videos\/\d+|watch\/live|live\/|live_videos|reel\/)/i;
  let overlay = null;

  function findLive() {
    const articles = [...document.querySelectorAll('[role="article"], [data-pagelet*="Feed"], [role="main"] > div')];
    for (const art of articles) {
      const txt = (art.innerText || '').slice(0, 600);
      if (!LIVE_RE.test(txt)) continue;
      const a = [...art.querySelectorAll('a[href]')].find((x) => /\/videos\/|\/watch\/|\/live/i.test(x.href));
      if (a) return a.href;
    }
    const direct = [...document.querySelectorAll('a[href]')].find((a) => LINK_RE.test(a.href) && LIVE_RE.test(a.innerText || a.getAttribute('aria-label') || ''));
    return direct ? direct.href : null;
  }

  function showOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:2147483647;background:#fbf6ee;color:#1b1b1b;font:700 36px "Segoe UI",Arial,sans-serif;padding:24px;text-align:center;border-bottom:4px solid #1b1b1b;';
    const t = document.createElement('div');
    t.textContent = 'Трансляція має бути вгорі сторінки. Натисніть на неї.';
    const b = document.createElement('button');
    b.textContent = '🏠 На головну';
    b.style.cssText = 'margin-top:16px;font:700 34px "Segoe UI",Arial,sans-serif;padding:14px 40px;border-radius:20px;border:4px solid #1b1b1b;background:#ffcf33;color:#1b1b1b;cursor:pointer;outline:10px solid #0047d4;outline-offset:6px;';
    b.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'go-home' }));
    overlay.append(t, b);
    document.body.append(overlay);
    b.focus();
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay) { e.preventDefault(); chrome.runtime.sendMessage({ type: 'go-home' }); }
  }, true);

  let tries = 0;
  const timer = setInterval(() => {
    tries++;
    const href = findLive();
    if (href) { clearInterval(timer); location.href = href; return; }
    if (tries === 8) showOverlay();
    if (tries > 40) clearInterval(timer);
  }, 2000);
})();
