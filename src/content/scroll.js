// Classic-script copy of src/lib/scroll.js (maths) plus the DOM animator, for content scripts.
// Keep the maths identical: tests/unit/scroll.test.js compares both.
window.GrannyScroll = (() => {
  const STEP_MS = 300;
  function linearPos(from, to, elapsed, duration) {
    if (!(duration > 0) || elapsed >= duration) return to;
    if (elapsed <= 0) return from;
    return from + ((to - from) * elapsed) / duration;
  }
  function allowStep(repeat, now, last, interval = STEP_MS) {
    if (!repeat) return true;
    return last == null || now - last >= interval;
  }
  function pickIndex(tops, scrollY, dir, offset = 0, eps = 4) {
    let best = -1;
    tops.forEach((t, i) => {
      const y = t - offset;
      if (dir > 0 ? y > scrollY + eps && (best < 0 || y < tops[best] - offset) : y < scrollY - eps && (best < 0 || y > tops[best] - offset)) best = i;
    });
    return best;
  }
  function scrollTargetFor({ top, bottom, viewport, scrollY, marginTop = 0, marginBottom = 0, block = 'nearest' }) {
    let y = null;
    if (block === 'center') y = scrollY + (top + bottom) / 2 - viewport / 2;
    else if (top < marginTop) y = scrollY + top - marginTop;
    else if (bottom > viewport - marginBottom) y = scrollY + bottom - viewport + marginBottom;
    return y == null ? null : Math.max(0, y);
  }

  let raf = 0;
  function animateTo(y, ms = STEP_MS) {
    cancelAnimationFrame(raf);
    const from = window.scrollY;
    const to = Math.max(0, Math.min(y, document.documentElement.scrollHeight - window.innerHeight));
    if (Math.abs(to - from) < 1) return;
    const t0 = performance.now();
    const frame = (now) => {
      const t = now - t0;
      window.scrollTo({ top: linearPos(from, to, t, ms), behavior: 'instant' });
      if (t < ms) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }
  function intoView(el, block = 'nearest') {
    const r = el.getBoundingClientRect();
    const y = scrollTargetFor({ top: r.top, bottom: r.bottom, viewport: window.innerHeight, scrollY: window.scrollY, marginTop: 90, marginBottom: 30, block });
    if (y != null) animateTo(y);
  }
  return { STEP_MS, linearPos, allowStep, pickIndex, scrollTargetFor, animateTo, intoView };
})();
