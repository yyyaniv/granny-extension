import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const fail = (m) => errors.push(m);
const exists = (p) => existsSync(join(root, p));

let manifest;
try {
  manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
} catch (e) {
  console.error('manifest.json is not valid JSON:', e.message);
  process.exit(1);
}

if (manifest.manifest_version !== 3) fail('manifest_version must be 3');
for (const k of ['name', 'version', 'description']) if (!manifest[k]) fail(`manifest.${k} missing`);

const refs = [];
const add = (p, where) => { if (typeof p === 'string') refs.push([p, where]); };
for (const [k, v] of Object.entries(manifest.chrome_url_overrides || {})) add(v, `chrome_url_overrides.${k}`);
add(manifest.options_ui && manifest.options_ui.page, 'options_ui.page');
add(manifest.side_panel && manifest.side_panel.default_path, 'side_panel.default_path');
add(manifest.background && manifest.background.service_worker, 'background.service_worker');
for (const [i, cs] of (manifest.content_scripts || []).entries()) {
  for (const f of [...(cs.js || []), ...(cs.css || [])]) add(f, `content_scripts[${i}]`);
  if (!cs.matches || !cs.matches.length) fail(`content_scripts[${i}] has no matches`);
}
const icons = { ...(manifest.icons || {}), ...((manifest.action && manifest.action.default_icon) || {}) };
for (const v of Object.values(icons)) add(v, 'icons');
for (const w of manifest.web_accessible_resources || []) for (const r of w.resources || []) add(r, 'web_accessible_resources');
for (const [p, where] of refs) if (!exists(p)) fail(`${where}: file not found: ${p}`);

if (manifest.background && manifest.background.service_worker && manifest.background.type !== 'module') {
  fail('background.type should be "module"');
}

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === 'tests' || n.startsWith('.')) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

const files = walk(root);
for (const f of files.filter((x) => x.endsWith('.html'))) {
  const rel = relative(root, f);
  const html = readFileSync(f, 'utf8');
  if (!/<html[^>]*\blang="uk"/.test(html)) fail(`${rel}: <html> must have lang="uk"`);
  const re = /<(?:script[^>]*\bsrc|link[^>]*\bhref)="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    if (/^(https?:|data:)/.test(m[1])) { fail(`${rel}: external resource ${m[1]}`); continue; }
    const target = m[1].startsWith('/') ? join(root, m[1]) : join(dirname(f), m[1]);
    if (!existsSync(target.split(/[?#]/)[0])) fail(`${rel}: missing ${m[1]}`);
  }
  const hrefRe = /<a[^>]*\bhref="([^"#?]+\.html)/g;
  while ((m = hrefRe.exec(html))) if (!existsSync(join(dirname(f), m[1]))) fail(`${rel}: link to missing page ${m[1]}`);
}

// relative imports in extension JS files must exist
for (const f of files.filter((x) => x.endsWith('.js') && relative(root, x).startsWith('src'))) {
  const src = readFileSync(f, 'utf8');
  const re = /(?:from\s+|import\s*\()\s*['"](\.[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) if (!existsSync(join(dirname(f), m[1]))) fail(`${relative(root, f)}: missing import ${m[1]}`);
}

// html pages referenced from JS (stream.html etc.) exist
for (const f of files.filter((x) => x.endsWith('.js') && relative(root, x).startsWith('src'))) {
  const src = readFileSync(f, 'utf8');
  const re = /['"`](?:src\/pages\/)?([a-z-]+\.html)(?=['"`?#])/g;
  let m;
  while ((m = re.exec(src))) {
    const candidates = [join(root, 'src/pages', m[1]), join(dirname(f), m[1])];
    if (!candidates.some(existsSync)) fail(`${relative(root, f)}: refers to missing page ${m[1]}`);
  }
}

if (errors.length) {
  console.error('Manifest check FAILED:\n - ' + errors.join('\n - '));
  process.exit(1);
}
console.log(`Manifest check OK (${refs.length} manifest references, ${files.filter((x) => x.endsWith('.html')).length} html files).`);
