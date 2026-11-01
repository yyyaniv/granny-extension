// Shared keyboard navigation for the big-button pages.
// Elements with [data-nav] are navigable; [data-autofocus] gets initial focus.
// [data-nav-zone="side"] (a sidebar) is its own column: Up/Down stay inside a zone, Left/Right cross over.

import { STEP_MS, linearPos, allowStep, pickIndex, scrollTargetFor } from '../lib/scroll.js';

const HOME_PAGE = 'home.html';

export function goHome() {
  location.href = HOME_PAGE;
}

function isTyping(el) {
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

export function navItems() {
  return [...document.querySelectorAll('[data-nav]')].filter((el) => {
    if (el.disabled) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

export function focusFirst() {
  const list = navItems();
  const el = list.find((x) => x.hasAttribute('data-autofocus')) || list[0];
  if (el) el.focus();
  return el;
}

// ---------- constant-speed scrolling (fixed ~300 ms, linear; no acceleration) ----------
let raf = 0;
export function animateScrollTo(y, ms = STEP_MS) {
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

const margin = (el, prop, min) => Math.max(min, parseFloat(getComputedStyle(el)[prop]) || 0);
/** Scrolls so `el` is fully visible (respects CSS scroll-margin, e.g. under a sticky bar). */
export function scrollItemIntoView(el, block = 'nearest') {
  const r = el.getBoundingClientRect();
  let y = scrollTargetFor({
    top: r.top, bottom: r.bottom, viewport: window.innerHeight, scrollY: window.scrollY,
    marginTop: margin(el, 'scrollMarginTop', 28), marginBottom: margin(el, 'scrollMarginBottom', 28), block,
  });
  if (y != null && y < window.scrollY && y < 160) y = 0; // going up near the top: show the heading too
  if (y != null) animateScrollTo(y);
}
/** Focus without the browser's jump, then scroll at constant speed. */
export function focusItem(el, block = 'nearest') {
  el.focus({ preventScroll: true });
  scrollItemIntoView(el, block);
}

let lastStep = 0;
const stepOk = (e) => {
  const now = performance.now();
  if (!allowStep(e.repeat, now, lastStep)) return false; // held key: one item per ~300 ms
  lastStep = now;
  return true;
};

const zoneOf = (el) => (el.closest('[data-nav-zone="side"]') ? 'side' : 'main');

function center(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function move(key, all, cur) {
  const here = all[cur];
  const zone = zoneOf(here);
  const side = all.filter((x) => zoneOf(x) === 'side');
  const c0 = center(here);
  if (side.length && key === 'ArrowLeft' && zone === 'main') {
    // first item of its row -> jump to the sidebar button level with it
    const r0 = here.getBoundingClientRect();
    const hasLeft = all.some((x) => x !== here && zoneOf(x) === 'main' && Math.abs(center(x).y - c0.y) < r0.height / 2 && center(x).x < c0.x);
    if (!hasLeft) return side.reduce((a, b) => (Math.abs(center(b).y - c0.y) < Math.abs(center(a).y - c0.y) ? b : a));
  }
  if (side.length && key === 'ArrowRight' && zone === 'side') {
    const main = all.filter((x) => zoneOf(x) === 'main' && x.getBoundingClientRect().bottom > 0);
    if (main.length) return main.reduce((a, b) => (b.getBoundingClientRect().top < a.getBoundingClientRect().top ? b : a));
  }
  const list = all.filter((x) => zoneOf(x) === zone);
  const i = list.indexOf(here);
  const n = list.length;
  if (key === 'ArrowRight') return list[(i + 1) % n];
  if (key === 'ArrowLeft') return list[(i - 1 + n) % n];
  const down = key === 'ArrowDown';
  cur = i;
  const c = center(list[cur]);
  let best = null;
  let bestScore = Infinity;
  list.forEach((el, j) => {
    if (j === cur) return;
    const p = center(el);
    const dy = down ? p.y - c.y : c.y - p.y;
    if (dy < 8) return;
    const score = dy + 2 * Math.abs(p.x - c.x);
    if (score < bestScore) { bestScore = score; best = el; }
  });
  return best || list[(cur + (down ? 1 : -1) + n) % n];
}

/** @param {{onEscape?: () => void, escapeGoesHome?: boolean}} opts */
export function enableNav(opts = {}) {
  const { onEscape, escapeGoesHome = true } = opts;
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (isTyping(e.target)) return;
    if (e.key === 'Escape') {
      if (onEscape) { e.preventDefault(); onEscape(); }
      else if (escapeGoesHome) { e.preventDefault(); goHome(); }
      return;
    }
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      if (e.key === ' ' && e.target && e.target.tagName === 'A') { e.preventDefault(); e.target.click(); }
      return;
    }
    const list = navItems();
    if (!list.length) return;
    e.preventDefault();
    if (!stepOk(e)) return;
    const cur = list.indexOf(document.activeElement);
    const next = cur < 0 ? (list.find((x) => x.hasAttribute('data-autofocus')) || list[0]) : move(e.key, list, cur);
    focusItem(next);
  });
  window.addEventListener('load', () => { window.focus(); focusFirst(); });
}

/**
 * Big floating "▲ Вгору" / "▼ Вниз" buttons on long pages. Each click moves one target
 * (getTargets() -> elements) at constant speed. Shown only when the page is taller than the window.
 */
export function enableScrollButtons(getTargets) {
  let clickAt = 0;
  const step = (dir) => {
    const now = performance.now();
    if (!allowStep(true, now, clickAt)) return; // click throttle
    clickAt = now;
    const els = getTargets().filter((x) => x.getBoundingClientRect().height > 0);
    const gap = (x) => parseFloat(getComputedStyle(x).scrollMarginTop) || 28;
    const tops = els.map((x) => x.getBoundingClientRect().top + window.scrollY - gap(x));
    const i = pickIndex(tops, window.scrollY, dir);
    if (i < 0) { animateScrollTo(window.scrollY + dir * window.innerHeight * 0.8); return; }
    if (els[i].hasAttribute('data-nav')) els[i].focus({ preventScroll: true });
    animateScrollTo(tops[i]);
  };
  const btn = (label, dir) => el('button', { class: 'big accent', type: 'button', onclick: () => step(dir) }, label);
  const box = el('div', { class: 'scrollbtns' }, btn('▲ Вгору', -1), btn('▼ Вниз', 1));
  document.body.append(box);
  const refresh = () => {
    const long = document.documentElement.scrollHeight > window.innerHeight + 40;
    box.hidden = !long;
    document.body.classList.toggle('has-scrollbtns', long);
  };
  window.addEventListener('resize', refresh);
  new ResizeObserver(refresh).observe(document.body);
  refresh();
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

export function homeButton(label = '🏠 На головну') {
  return el('a', { class: 'big muted small', href: HOME_PAGE, 'data-nav': true }, label);
}
