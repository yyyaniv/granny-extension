// Best-effort: when this tab was opened by the schedule, find the live video and open it.
(async () => {
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
    overlay.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:2147483647;background:#0d1b2a;color:#fff;font:700 36px "Segoe UI",Arial,sans-serif;padding:24px;text-align:center;border-bottom:10px solid #ffd400;';
    const t = document.createElement('div');
    t.textContent = 'Трансляція має бути вгорі сторінки. Натисніть на неї.';
    const b = document.createElement('button');
    b.textContent = '🏠 На головну';
    b.style.cssText = 'margin-top:16px;font:700 34px "Segoe UI",Arial,sans-serif;padding:14px 40px;border-radius:20px;border:6px solid #ffd400;background:#ffd400;color:#000;cursor:pointer;';
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
