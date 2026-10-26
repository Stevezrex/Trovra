import { createHandler } from '../netlify/functions/api.mjs';
import { createStore } from '../netlify/functions/store.mjs';

export function makeWorld(start = Date.parse('2026-10-22T09:00:00+01:00')) {
  const clock = { t: start };
  const store = createStore('memory');
  const storeP = store;
  const handle = createHandler({ getStore: () => storeP, now: () => clock.t });
  async function call(method, path, body, token) {
    const req = new Request(`http://x/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: method === 'GET' ? undefined : JSON.stringify(body || {})
    });
    const res = await handle(req);
    return { status: res.status, body: await res.json() };
  }
  // advance the clock in poll-sized steps so no offline gap is triggered
  async function wait(ms, token, step = 4000) {
    let left = ms;
    let last = null;
    while (left > 0) {
      const d = Math.min(step, left);
      clock.t += d; left -= d;
      if (token) last = await call('GET', '/state', null, token);
    }
    return last;
  }
  async function login(name, email) {
    const r = await call('POST', '/login', { name, email });
    return r;
  }
  return { clock, call, wait, login, storeP };
}

export function caseOf(view, id) { return view.cases.find((c) => c.id === id); }
export function lastCustomer(c) { return [...c.messages].reverse().find((m) => m.from === 'customer'); }
