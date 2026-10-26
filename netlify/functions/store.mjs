// Trial and learner storage. Netlify Blobs in production, an in-memory Map for local tests.
// Blobs has no conditional writes, so writes for one trial are serialised inside this process
// and each record carries a version number that increases on every save.

import { createHash } from 'node:crypto';

const locks = new Map();

async function withLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  let release;
  const gate = new Promise((r) => (release = r));
  const chain = prev.then(() => gate);
  locks.set(key, chain);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === chain) locks.delete(key);
  }
}

export function emailKey(email) {
  return createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex').slice(0, 40);
}

function memoryBackend() {
  const m = new Map();
  return {
    async get(key) { const v = m.get(key); return v === undefined ? null : JSON.parse(v); },
    async set(key, value) { m.set(key, JSON.stringify(value)); },
    async list(prefix) { return [...m.keys()].filter((k) => k.startsWith(prefix)); },
    async del(key) { m.delete(key); }
  };
}

async function blobsBackend() {
  const { getStore } = await import('@netlify/blobs');
  const store = getStore({ name: 'trovra', consistency: 'strong' });
  return {
    async get(key) { return (await store.get(key, { type: 'json' })) ?? null; },
    async set(key, value) { await store.setJSON(key, value); },
    async list(prefix) {
      const out = [];
      const res = await store.list({ prefix, paginate: true });
      for await (const page of res) for (const b of page.blobs) out.push(b.key);
      return out;
    },
    async del(key) { await store.delete(key); }
  };
}

export async function createStore(kind = process.env.TROVRA_STORE === 'memory' ? 'memory' : 'blobs') {
  const backend = kind === 'memory' ? memoryBackend() : await blobsBackend();
  return {
    kind,
    getLearner: (key) => backend.get(`learner/${key}`),
    putLearner: (key, rec) => backend.set(`learner/${key}`, rec),
    getTrial: (id) => backend.get(`trial/${id}`),
    putTrial: async (trial) => {
      trial.version = (trial.version || 0) + 1;
      await backend.set(`trial/${trial.id}`, trial);
    },
    listTrialIds: async () => (await backend.list('trial/')).map((k) => k.slice('trial/'.length)),
    deleteTrial: (id) => backend.del(`trial/${id}`),
    deleteLearner: (key) => backend.del(`learner/${key}`),
    lock: withLock
  };
}
