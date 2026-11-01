// Random choice helpers (pure; rng is injectable for tests).

/**
 * Up to `n` distinct items in random order. Items from `exclude` are used only
 * when the rest of the pool is too small to fill `n`.
 */
export function pickRandom(items, n, rng = Math.random, exclude = []) {
  const pool = [...new Set(Array.isArray(items) ? items : [])];
  const skip = new Set(exclude || []);
  const fresh = shuffle(pool.filter((x) => !skip.has(x)), rng);
  if (fresh.length >= n) return fresh.slice(0, n);
  return fresh.concat(shuffle(pool.filter((x) => skip.has(x)), rng)).slice(0, n);
}

function shuffle(list, rng) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
