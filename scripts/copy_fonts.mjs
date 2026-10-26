// Copies the licensed font files from the npm packages into public/fonts at build time.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'fonts');
mkdirSync(out, { recursive: true });
const wanted = [
  ['@fontsource/inter', ['inter-latin-400-normal.woff2', 'inter-latin-600-normal.woff2', 'inter-latin-700-normal.woff2']],
  ['@fontsource/plus-jakarta-sans', ['plus-jakarta-sans-latin-600-normal.woff2', 'plus-jakarta-sans-latin-700-normal.woff2', 'plus-jakarta-sans-latin-800-normal.woff2']]
];
for (const [pkg, files] of wanted) {
  for (const f of files) {
    const src = join(root, 'node_modules', pkg, 'files', f);
    if (!existsSync(src)) { console.error(`Missing ${src}. Run npm install first.`); process.exit(1); }
    copyFileSync(src, join(out, f));
  }
}
console.log('Fonts copied to public/fonts');
