import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const common = read('src/pages/common.css');

test('[hidden] beats display:flex/grid of .stack/.row/.grid (confirm dialogs must start closed)', () => {
  assert.match(common, /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
  assert.match(common, /\.stack\s*\{[^}]*display:\s*flex/); // the reason the rule is needed
});

test('every button shares one border and one focus ring', () => {
  assert.match(common, /--bd:\s*4px solid #1b1b1b/);
  assert.match(common, /\.big\s*\{[^}]*border:\s*var\(--bd\)/);
  assert.match(read('src/pages/saved.css'), /\.vcard\s*\{[^}]*border:\s*var\(--bd\)/);
  assert.match(common, /\.big:focus,\s*\.vcard:focus\s*\{\s*outline:\s*10px solid var\(--ring\)/);
});

const lum = (h) => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('all button colour pairs meet WCAG AA (4.5:1)', () => {
  const ink = /--ink:\s*(#[0-9a-f]{6})/i.exec(common)[1];
  const page = /--page:\s*(#[0-9a-f]{6})/i.exec(common)[1];
  assert.ok(ratio(ink, page) >= 4.5);
  assert.ok(ratio('#4a4a4a', page) >= 4.5 && ratio('#b3261e', page) >= 4.5 && ratio('#8a3b00', page) >= 4.5);
  let n = 0;
  for (const m of common.matchAll(/\.big[.\w-]*\s*\{\s*--bg:\s*(#[0-9a-f]{6});(?:\s*--fg:\s*(#[0-9a-f]{6});)?/gi)) {
    n++;
    assert.ok(ratio(m[2] || ink, m[1]) >= 4.5, `${m[0]}: ${ratio(m[2] || ink, m[1]).toFixed(2)}`);
  }
  assert.ok(n >= 11, `only ${n} colour rules found`);
  assert.ok(ratio('#0047d4', page) >= 3); // focus ring is visible on the page
});
