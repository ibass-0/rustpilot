// Build cache housekeeping, used by the Makefile.
//   node scripts/cache.mjs trim      drop the incremental cache, the part that keeps growing
//   node scripts/cache.mjs collect   copy the NSIS installer to installer/, then drop the whole cache
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const target = path.join(root, 'src-tauri', 'target');
const remove = (dir) => fs.rmSync(dir, { recursive: true, force: true });

const mode = process.argv[2];

if (mode === 'trim') {
  for (const profile of ['debug', 'release']) remove(path.join(target, profile, 'incremental'));
  console.log('Removed the incremental build cache.');
} else if (mode === 'collect') {
  const bundle = path.join(target, 'release', 'bundle', 'nsis');
  const installers = fs.existsSync(bundle) ? fs.readdirSync(bundle).filter((f) => f.endsWith('-setup.exe')) : [];
  if (installers.length === 0) {
    console.error('No installer found; the build cache was left in place.');
    process.exit(1);
  }
  const out = path.join(root, 'installer');
  fs.mkdirSync(out, { recursive: true });
  for (const file of installers) {
    fs.copyFileSync(path.join(bundle, file), path.join(out, file));
    console.log(`Installer: ${path.join('installer', file)}`);
  }
  remove(target);
  remove(path.join(root, 'dist'));
  console.log('Removed the build cache.');
} else {
  console.error('Usage: node scripts/cache.mjs <trim|collect>');
  process.exit(1);
}
