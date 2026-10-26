// HTTP layer. Validates requests, session ownership and permitted actions, and returns only
// the state a learner is allowed to see. No future customer lines and no engine signals leave here.

import { randomBytes, timingSafeEqual } from 'node:crypto';
import { CONFIG } from './config.mjs';
import { CASE_ORDER, FACTS, buildRecord, fmtDate } from './cases.mjs';
import { POLICY, STAFF, HISTORY, NOTE_FIELDS } from './static.mjs';
import { createStore, emailKey } from './store.mjs';
import {
  newTrial, startShift, resetTrial, advance, saveDraft, submitReply,
  openNote, saveNote, submitNote, allDone, fillText, factsFor
} from './engine.mjs';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const fail = (status, error, message) => json(status, { error, message });

const normName = (s) => String(s || '').trim().replace(/\s+/g, ' ');
const nameKey = (s) => normName(s).toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

// ---------- views ----------

async function menuFor(store, learner) {
  const trials = [];
  for (const id of learner.trialIds) {
    const t = await store.getTrial(id);
    if (t) trials.push({ trialNo: t.trialNo, status: t.status, startedAt: t.shift ? t.shift.startedAt : null, submittedAt: t.submittedAt });
  }
  trials.sort((a, b) => a.trialNo - b.trialNo);
  const used = trials.filter((t) => t.status === 'submitted').length;
  const open = trials.find((t) => t.status === 'open') || null;
  return {
    learner: { name: learner.name, email: learner.email },
    max: CONFIG.maxTrials,
    used,
    remaining: CONFIG.maxTrials - used,
    trials,
    openTrialNo: open ? open.trialNo : null,
    nextTrialNo: !open && trials.length < CONFIG.maxTrials ? trials.length + 1 : null
  };
}

function viewOf(trial, now) {
  const tz = CONFIG.timezone;
  const cases = [];
  if (trial.started) {
    for (const id of CASE_ORDER) {
      const cs = trial.cases[id];
      if (cs.status === 'not_started' || cs.status === 'scheduled') continue;
      const f = factsFor(trial, id);
      const rec = buildRecord(id, f, trial.shift.startedAt, tz, { evidenceReceived: cs.mem.evidenceReceived });
      const waiting = cs.status === 'open' && !!cs.pending;
      const canReply = cs.status === 'open' && !cs.pending && !!cs.window;
      const lastCustomer = [...cs.messages].reverse().find((m) => m.from === 'customer');
      const subject = cs.messages.find((m) => m.subject)?.subject || null;
      cases.push({
        id,
        channel: cs.channel,
        customer: f.customer,
        subject: cs.channel === 'email' ? (subject || '') : null,
        topic: cs.channel === 'chat' ? ({ A: 'Delayed delivery', C: 'Duplicate charge' }[id] || '') : null,
        status: cs.status === 'closed' ? 'closed' : waiting ? 'waiting' : 'open',
        outcome: cs.outcome,
        messages: cs.messages.map((m) => ({ id: m.id, from: m.from, at: m.at, text: m.text, subject: m.subject })),
        lastCustomerId: lastCustomer ? lastCustomer.id : null,
        draft: cs.draft.text,
        deadline: canReply ? cs.window.deadline : null,
        canReply,
        lastActivity: cs.messages.length ? cs.messages[cs.messages.length - 1].at : cs.startedAt,
        record: { title: rec.title, rows: rec.rows.map(([k, v]) => [k, fillText(v)]), notes: rec.notes }
      });
    }
  }
  const notes = {};
  for (const id of CASE_ORDER) {
    const n = trial.notes[id];
    notes[id] = {
      status: n.status,
      prefill: n.prefill || null,
      fields: n.fields || {},
      deadline: n.status === 'open' ? n.deadline : null,
      expired: n.expired
    };
  }
  return {
    serverNow: now,
    brand: CONFIG.brandName,
    timezone: tz,
    pollSec: CONFIG.pollSec,
    noteFields: NOTE_FIELDS,
    trial: {
      trialNo: trial.trialNo,
      status: trial.status,
      started: trial.started,
      shift: trial.shift ? { startedAt: trial.shift.startedAt, dateText: trial.shift.dateText, timeText: trial.shift.timeText } : null,
      resetAvailable: trial.started && trial.status === 'open' && trial.resetCount < CONFIG.maxResetsPerTrial,
      allDone: trial.started && allDone(trial),
      todayText: fmtDate(now, tz)
    },
    cases,
    notes
  };
}

function referenceOf(trial, now) {
  const base = trial && trial.shift ? trial.shift.startedAt : now;
  const day = 86400000;
  return {
    policy: POLICY.map((p) => ({ title: p.title, text: fillText(p.text) })),
    staff: STAFF,
    history: HISTORY.map((h) => ({
      id: h.id, subject: h.subject, channel: h.channel, customer: h.customer, closure: h.closure,
      when: `${fmtDate(base + h.dayOffset * day, CONFIG.timezone)}, ${h.time}`,
      messages: h.messages.map(([from, text]) => ({ from, text }))
    }))
  };
}

// ---------- handler ----------

export function createHandler({ getStore, now = () => Date.now() }) {
  let storePromise = null;
  const store = () => (storePromise ||= getStore());

  async function authed(req, fn) {
    const st = await store();
    const header = req.headers.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const [key, secret] = token.split('.');
    if (!key || !secret) return fail(401, 'no_session', 'Please sign in.');
    return st.lock(`L:${key}`, async () => {
      const learner = await st.getLearner(key);
      if (!learner || !learner.session) return fail(401, 'no_session', 'Please sign in.');
      if (!safeEqual(learner.session.secret, secret)) {
        return fail(409, 'session_moved', 'Session moved. This trial is open on another device.');
      }
      return fn({ st, key, learner });
    });
  }

  async function loadTrial(st, learner) {
    if (!learner.currentTrialId) return null;
    return st.getTrial(learner.currentTrialId);
  }

  async function body(req) {
    try { return await req.json(); } catch { return {}; }
  }

  return async function handle(req) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/(?:\.netlify\/functions\/api|api)/, '') || '/';
    const method = req.method;
    const t = now();
    try {
      // ---- sign in ----
      if (method === 'POST' && path === '/login') {
        const st = await store();
        const b = await body(req);
        const name = normName(b.name);
        const email = String(b.email || '').trim().toLowerCase();
        if (name.length < 2 || name.length > 80) return fail(400, 'bad_name', 'Enter your full name.');
        if (!EMAIL_RE.test(email) || email.length > 120) return fail(400, 'bad_email', 'Enter a valid email address.');
        const key = emailKey(email);
        return st.lock(`L:${key}`, async () => {
          let learner = await st.getLearner(key);
          if (learner && learner.nameKey !== nameKey(name)) {
            return fail(403, 'name_mismatch', 'This email address is already registered under a different name. Use the same name you used before.');
          }
          if (!learner) {
            learner = { email, name, nameKey: nameKey(name), trialIds: [], currentTrialId: null, createdAt: t };
          }
          const secret = randomBytes(24).toString('hex');
          learner.session = { secret, since: t };
          await st.putLearner(key, learner);
          return json(200, { token: `${key}.${secret}`, menu: await menuFor(st, learner), brand: CONFIG.brandName });
        });
      }

      if (method === 'GET' && path === '/ping') return json(200, { ok: true });

      // ---- everything else needs a session ----
      return await authed(req, async ({ st, key, learner }) => {
        // sign out
        if (method === 'POST' && path === '/logout') {
          learner.session = null;
          await st.putLearner(key, learner);
          return json(200, { ok: true });
        }

        if (method === 'GET' && path === '/menu') {
          return json(200, { menu: await menuFor(st, learner), brand: CONFIG.brandName });
        }

        // open or create the trial this learner works on
        if (method === 'POST' && path === '/trial/open') {
          let trial = await loadTrial(st, learner);
          if (trial && trial.status !== 'open') { learner.currentTrialId = null; trial = null; }
          if (!trial) {
            const menu = await menuFor(st, learner);
            if (menu.used >= CONFIG.maxTrials || learner.trialIds.length >= CONFIG.maxTrials) {
              return fail(403, 'no_trials_left', 'You have used all three trials.');
            }
            const trialNo = learner.trialIds.length + 1;
            const id = `${key.slice(0, 12)}-t${trialNo}-${randomBytes(3).toString('hex')}`;
            trial = newTrial({ id, learner, trialNo, now: t });
            await st.putTrial(trial);
            learner.trialIds.push(id);
            learner.currentTrialId = id;
            await st.putLearner(key, learner);
          } else {
            // resuming on this device
            const before = JSON.stringify(trial);
            advance(trial, t);
            trial.lastSeenAt = t;
            if (JSON.stringify(trial) !== before) await st.putTrial(trial);
          }
          return json(200, { view: viewOf(trial, t) });
        }

        // everything below works on the open trial
        const trial = await loadTrial(st, learner);
        if (!trial || trial.status !== 'open') {
          if (method === 'GET' && path === '/state') return json(200, { view: null, menu: await menuFor(st, learner) });
          return fail(404, 'no_open_trial', 'There is no open trial.');
        }

        if (method === 'GET' && path === '/state') {
          const before = JSON.stringify(trial);
          const prevSeen = trial.lastSeenAt;
          advance(trial, t);
          const changed = JSON.stringify(trial) !== before;
          trial.lastSeenAt = t;
          if (changed || t - prevSeen >= 10000) await st.putTrial(trial);
          return json(200, { view: viewOf(trial, t) });
        }

        if (method === 'GET' && path === '/reference') return json(200, referenceOf(trial, t));

        // ---- mutations: tick first, mutate, save ----
        const b = await body(req);
        advance(trial, t);
        const save = async () => { trial.lastSeenAt = t; await st.putTrial(trial); };
        const ok = async () => { await save(); return json(200, { ok: true, view: viewOf(trial, t) }); };

        if (method === 'POST' && path === '/shift/start') {
          if (trial.started) return json(200, { ok: true, view: viewOf(trial, t) });
          startShift(trial, t);
          return ok();
        }

        if (!trial.started) return fail(409, 'not_started', 'Start the shift first.');

        if (method === 'POST' && path === '/draft') {
          const r = saveDraft(trial, String(b.caseId), b.text, Number(b.seq) || null, t);
          if (!r.ok) return fail(409, r.code, 'This conversation is not ready for a reply.');
          await save();
          return json(200, { ok: true, saved: true, at: t });
        }

        if (method === 'POST' && path === '/send') {
          const caseId = String(b.caseId);
          const cs = trial.cases[caseId];
          const text = String(b.text || '');
          if (!cs) return fail(400, 'bad_case', 'Unknown conversation.');
          const rid = String(b.requestId || '');
          if (rid && trial.processed.includes(rid)) return json(200, { ok: true, duplicate: true, view: viewOf(trial, t) });
          if (cs.status !== 'open') return fail(409, 'case_closed', 'This conversation is closed.');
          if (cs.pending || !cs.window) return fail(409, 'not_ready', 'The customer has not written back yet.');
          if (!text.trim()) return fail(400, 'empty', 'Type a reply first.');
          if (text.length > CONFIG.maxMessageChars) return fail(400, 'too_long', 'That reply is too long.');
          const stale = b.lastCustomerId && cs.messages.length && [...cs.messages].reverse().find((m) => m.from === 'customer')?.id !== b.lastCustomerId;
          submitReply(trial, caseId, text, t, { subject: cs.channel === 'email' ? String(b.subject || '').slice(0, 200) : null, staleView: !!stale });
          if (rid) { trial.processed.push(rid); if (trial.processed.length > 40) trial.processed.shift(); }
          return ok();
        }

        if (method === 'POST' && path === '/note/open') {
          const r = openNote(trial, String(b.caseId), t);
          if (!r.ok) return fail(409, r.code, 'Close the conversation before writing the note.');
          return ok();
        }
        if (method === 'POST' && path === '/note/save') {
          const r = saveNote(trial, String(b.caseId), b.fields, Number(b.seq) || null, t);
          if (!r.ok) return fail(409, r.code, 'This note is not open.');
          await save();
          return json(200, { ok: true, saved: true, at: t });
        }
        if (method === 'POST' && path === '/note/submit') {
          const id = String(b.caseId);
          if (b.fields) saveNote(trial, id, b.fields, Number(b.seq) || null, t);
          const r = submitNote(trial, id, t);
          if (!r.ok) return fail(409, r.code, 'This note is not open.');
          return ok();
        }

        if (method === 'POST' && path === '/reset') {
          if (!b.confirm) return fail(400, 'confirm_required', 'Confirm the reset first.');
          if (trial.resetCount >= CONFIG.maxResetsPerTrial) return fail(403, 'reset_used', 'The reset for this trial has been used.');
          resetTrial(trial, t);
          return ok();
        }

        if (method === 'POST' && path === '/submit') {
          if (!allDone(trial)) return fail(409, 'not_finished', 'Finish all four cases and notes first.');
          trial.status = 'submitted';
          trial.submittedAt = t;
          await save();
          learner.currentTrialId = null;
          await st.putLearner(key, learner);
          return json(200, { ok: true, menu: await menuFor(st, learner) });
        }

        return fail(404, 'not_found', 'Unknown request.');
      });
    } catch (err) {
      console.error('api error', err);
      return fail(500, 'server_error', 'Something went wrong on the server. Try again.');
    }
  };
}

// ---------- Netlify entry ----------

let handler = null;
export default async (req) => {
  handler ||= createHandler({ getStore: () => createStore() });
  return handler(req);
};

export const config = { path: '/api/*' };
