// Local preview: serves public/ and runs the API against an in-memory store.
// TROVRA_FAST=1 shortens every timer so a full shift can be walked through in a few minutes.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../netlify/functions/config.mjs';
import { createHandler } from '../netlify/functions/api.mjs';
import { createStore } from '../netlify/functions/store.mjs';

if (process.env.TROVRA_FAST) {
  CONFIG.chat.replySec = 30; CONFIG.chat.extendedSec = 40;
  CONFIG.email.replySec = 60; CONFIG.email.extendSec = 10;
  CONFIG.noteSec = 90; CONFIG.nextEmailDelaySec = 8;
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const handler = createHandler({ getStore: () => createStore('memory') });
const port = Number(process.env.PORT || 8888);

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname.startsWith('/api/')) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const r = await handler(new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }));
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
    return;
  }
  const file = url.pathname === '/' ? '/index.html' : url.pathname;
  try {
    const data = await readFile(join(root, file));
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, () => console.log(`Trovra preview on http://localhost:${port}${process.env.TROVRA_FAST ? ' (fast timers)' : ''}`));
