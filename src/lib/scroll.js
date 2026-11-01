// Pure maths for constant-speed, one-step-at-a-time scrolling.
// src/content/scroll.js is a classic-script copy for content scripts; tests keep both equal.

export const STEP_MS = 300;

/** Linear (constant speed) position at `elapsed` ms of a `duration` ms move. */
export function linearPos(from, to, elapsed, duration) {
  if (!(duration > 0) || elapsed >= duration) return to;
  if (elapsed <= 0) return from;
  return from + ((to - from) * elapsed) / duration;
}

/** A held key (auto-repeat) may move at most once per `interval`; a fresh press always may. */
export function allowStep(repeat, now, last, interval = STEP_MS) {
  if (!repeat) return true;
  return last == null || now - last >= interval;
}

/** Index of the next (dir > 0) / previous (dir < 0) target, or -1. `tops` are document-absolute. */
export function pickIndex(tops, scrollY, dir, offset = 0, eps = 4) {
  let best = -1;
  tops.forEach((t, i) => {
    const y = t - offset;
    if (dir > 0 ? y > scrollY + eps && (best < 0 || y < tops[best] - offset) : y < scrollY - eps && (best < 0 || y > tops[best] - offset)) best = i;
  });
  return best;
}

/**
 * scrollY that brings an element (client rect top/bottom) into view, or null if nothing to do.
 * block 'nearest' moves the least; 'center' centres it.
 */
export function scrollTargetFor({ top, bottom, viewport, scrollY, marginTop = 0, marginBottom = 0, block = 'nearest' }) {
  let y = null;
  if (block === 'center') y = scrollY + (top + bottom) / 2 - viewport / 2;
  else if (top < marginTop) y = scrollY + top - marginTop;
  else if (bottom > viewport - marginBottom) y = scrollY + bottom - viewport + marginBottom;
  return y == null ? null : Math.max(0, y);
}
