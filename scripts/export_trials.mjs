// Downloads every trial record from Netlify Blobs into a local folder, using the instructor's own Netlify credentials.
// Usage:  NETLIFY_SITE_ID=... NETLIFY_AUTH_TOKEN=... node scripts/export_trials.mjs [outDir]
// The token is a personal access token from your Netlify user settings. It is never stored in this project.
import { getStore } from '@netlify/blobs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const siteID = process.env.NETLIFY_SITE_ID;
const token = process.env.NETLIFY_AUTH_TOKEN;
if (!siteID || !token) {
  console.error('Set NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN first. See README.md, "Exporting records".');
  process.exit(1);
}
const out = process.argv[2] || 'exports';
mkdirSync(out, { recursive: true });
const store = getStore({ name: 'trovra', siteID, token, consistency: 'strong' });

let n = 0;
for await (const page of store.list({ prefix: 'trial/', paginate: true })) {
  for (const b of page.blobs) {
    const rec = await store.get(b.key, { type: 'json' });
    if (!rec) continue;
    writeFileSync(join(out, `${b.key.slice('trial/'.length)}.json`), JSON.stringify(rec, null, 2));
    n++;
  }
}
console.log(`Exported ${n} trial record(s) to ${out}/`);
