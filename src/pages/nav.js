// Shared keyboard navigation for the big-button pages.
// Elements with [data-nav] are navigable; [data-autofocus] gets initial focus.

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

function center(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function move(key, list, cur) {
  const n = list.length;
  if (key === 'ArrowRight') return list[(cur + 1) % n];
  if (key === 'ArrowLeft') return list[(cur - 1 + n) % n];
  const down = key === 'ArrowDown';
  const c = center(list[cur]);
  let best = null;
  let bestScore = Infinity;
  list.forEach((el, i) => {
    if (i === cur) return;
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
    const cur = list.indexOf(document.activeElement);
    const next = cur < 0 ? (list.find((x) => x.hasAttribute('data-autofocus')) || list[0]) : move(e.key, list, cur);
    next.focus();
    next.scrollIntoView({ block: 'nearest' });
  });
  window.addEventListener('load', () => { window.focus(); focusFirst(); });
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
