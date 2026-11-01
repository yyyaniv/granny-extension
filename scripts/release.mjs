// Builds dist/BabusynPomichnyk.zip (manifest.json + src/ [+ icons/]) and prints the `gh release create` command.
// Usage: npm run release            (build only)
//        npm run release -- --publish   (also runs gh release create)
import { readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publish = process.argv.includes('--publish');
const ZIP = 'dist/BabusynPomichnyk.zip';

const die = (m) => { console.error(`\nПомилка: ${m}`); process.exit(1); };
const run = (cmd, args, label) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' });
  if (r.error) die(`${label}: ${r.error.message}`);
  if (r.status !== 0) die(`${label} завершилась з помилкою (код ${r.status}).`);
};

console.log('1/4 Тести…');
run(process.execPath, ['--test'], 'node --test');
console.log('2/4 Перевірка маніфесту…');
run(process.execPath, ['scripts/check-manifest.mjs'], 'check-manifest');

const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
if (!/^\d+(\.\d+){1,3}$/.test(manifest.version)) die(`Некоректна версія в manifest.json: ${manifest.version}`);
if (manifest.version !== pkg.version) {
  die(`Версії різні: manifest.json = ${manifest.version}, package.json = ${pkg.version}. Вирівняйте їх.`);
}

console.log('3/4 Архів…');
mkdirSync(join(root, 'dist'), { recursive: true });
rmSync(join(root, ZIP), { force: true });
const inputs = ['manifest.json', 'src', ...(existsSync(join(root, 'icons')) ? ['icons'] : [])];
run('zip', ['-r', '-X', ZIP, ...inputs, '-x', '*.DS_Store', '-x', '*/.DS_Store'], 'zip');
run('unzip', ['-l', ZIP], 'unzip -l');

const tag = `v${manifest.version}`;
const notes = `Версія ${manifest.version}`;
const ghArgs = ['release', 'create', tag, ZIP, '--title', `Бабусин помічник ${manifest.version}`, '--notes', notes];
const quoted = ghArgs.map((a) => (/[\s"']/.test(a) ? JSON.stringify(a) : a)).join(' ');
console.log(`\nВерсія: ${manifest.version}\nАрхів: ${ZIP}`);
if (!publish) {
  console.log(`\nЩоб опублікувати, виконайте:\n  gh ${quoted}\nабо: npm run release -- --publish`);
} else {
  console.log(`4/4 Публікація: gh ${quoted}`);
  run('gh', ghArgs, 'gh release create');
  console.log('Готово. Ноутбук бабусі оновиться сам протягом години.');
}
