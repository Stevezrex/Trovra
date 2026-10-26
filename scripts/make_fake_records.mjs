// Generates FAKE trial records by playing scripted learners through the real server code.
// Nothing here is real learner data. Output goes to fake_records/ (JSON), ready for merge.mjs.
// Usage: node scripts/make_fake_records.mjs [outDir]
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { makeWorld, caseOf } from '../tests/helpers.mjs';
import { FACTS } from '../netlify/functions/cases.mjs';

const out = process.argv[2] || 'sample/fake_records';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const world = makeWorld(Date.parse('2026-10-26T09:00:00+01:00'));
const { clock, call } = world;
const state = async (token) => (await call('GET', '/state', null, token)).body.view;

async function tick(token, ms = 4000) { clock.t += ms; return state(token); }

// Plays a trial: replies is { A: [fn|string...], B: [...], C: [...], D: [...] }, notes is { A: fields... }
async function playTrial(token, { replies, notes, think = 25000, submit = true, stopAfter = null }) {
  await call('POST', '/trial/open', {}, token);
  let v = (await call('POST', '/shift/start', {}, token)).body.view;
  const set = v.trial.trialNo;
  const F = (c) => FACTS[c][set - 1];
  const idx = { A: 0, B: 0, C: 0, D: 0 };
  let guard = 0;
  while (guard++ < 4000) {
    v = await state(token);
    if (v.cases.length === 4 && v.cases.every((c) => c.status === 'closed')) break;
    if (stopAfter && v.cases.length && idx.A >= stopAfter) break;
    let acted = false;
    for (const c of v.cases) {
      if (!c.canReply) continue;
      const list = replies[c.id] || [];
      if (idx[c.id] >= list.length) continue;
      const item = list[idx[c.id]];
      const text = typeof item === 'function' ? item(F(c.id)) : item;
      for (let left = think; left > 0; left -= 4000) await tick(token, Math.min(4000, left));
      const r = await call('POST', '/send', { caseId: c.id, text, requestId: `${c.id}-${idx[c.id]}`, lastCustomerId: c.lastCustomerId, subject: c.subject ? `Re: ${c.subject}` : null }, token);
      if (r.status !== 200) throw new Error(`send failed ${JSON.stringify(r.body)}`);
      idx[c.id]++;
      acted = true;
      break;
    }
    if (!acted) await tick(token, 4000);
  }
  if (stopAfter) return v;
  // notes. The page keeps polling while a learner writes, so wait in poll-sized steps.
  const waitPolling = async (ms) => { for (let left = ms; left > 0; left -= 4000) await tick(token, Math.min(4000, left)); };
  for (const id of ['A', 'B', 'C', 'D']) {
    const n = notes[id];
    await call('POST', '/note/open', { caseId: id }, token);
    if (n === 'ignore') { await waitPolling(185000); continue; }
    await waitPolling(90000);
    await call('POST', '/note/save', { caseId: id, fields: n, seq: Date.now() + clock.t }, token);
    if (n._expire) { await waitPolling(120000); }
    else await call('POST', '/note/submit', { caseId: id, fields: n, seq: Date.now() + clock.t + 1 }, token);
  }
  if (submit) await call('POST', '/submit', {}, token);
  return v;
}

const N = (o) => o;

// ---------- Reply scripts ----------
const strong = {
  A: [
    (f) => `I am sorry about the delay, and I understand you need the ${f.item} for ${f.event.replace(/^my /, 'your ')}. I have checked order ${f.orderNo} and the tracking shows ${f.lastScan}. There is no proof of delivery.`,
    (f) => `I will raise a delivery trace with Logistics now and I will update you by 3pm today. Logistics responds within 24 hours. If Logistics cannot confirm a delivery date, you can cancel for a full refund of ${f.amount} to your Trovra Wallet within 3 working days. I cannot promise a delivery date.`
  ],
  B: [
    (f) => `Good day ${f.customer.split(' ')[0]}. I am sorry that you were told to read the policy earlier and that you had to write twice. Your ${f.item} ${f.fault}, so I am treating this as a fault and not a change of mind. Please send one photo or a short video showing the fault.`,
    (f) => `Thank you for the video. I am sorry again for the wait. I have checked order ${f.orderNo}: it was delivered ${f.delivered}, inside the 7 day window. I will arrange a replacement, which ships within 2 working days of approval, or a refund paid within 3 working days if you prefer. I will email you by 4pm today with your choice confirmed.`
  ],
  C: [
    (f) => `I am sorry about the double charge on order ${f.orderNo}. I can see both debits of ${f.amount} on the statement. Can you confirm what time it happened?`,
    () => `I want to help you, but I cannot continue if the insults continue. Please keep the conversation respectful so that I can sort out your money.`,
    (f) => `I am checking both debits of ${f.amount} now and I will keep working on it for you.`,
    (f) => `I am sorry. I will pause this chat and transfer you to the shift supervisor, Segun. I have recorded your words. Payments will confirm the two debits of ${f.amount} within 1 working day, and the supervisor will call you by 2pm today.`
  ],
  D: [
    (f) => `Good day ${f.customer.split(' ')[0]}. I am sorry that you received ${f.itemDelivered} instead of the ${f.item}. Can you tell me about the job and send proof of the loss, such as the client's message and your invoice? I note you are asking for ${f.demand}.`,
    (f) => `I will arrange collection of the wrong item and send the correct ${f.item}. I can give a goodwill credit up to ₦5,000, but I cannot decide a business loss claim. I have escalated your claim with a summary of the job, proof and amount to the Claims reviewer, who responds within 2 working days.`
  ]
};
const strongNotes = {
  A: N({ 1: 'Customer reports order delayed past promised date and wants a refund.', 2: 'Promised yesterday, tracking At hub, last scan 3 days ago, no proof of delivery.', 3: 'Checked order and tracking. Delivery date unconfirmed.', 4: 'Raised delivery trace with Logistics, explained refund route. Agent decision.', 5: 'Customer agreed to wait until 3pm.', 6: 'Update customer on trace.', 7: 'Agent, 3pm today.', 8: 'None' }),
  B: N({ 1: 'Faulty item after earlier policy-only reply. Customer wants fix.', 2: 'Delivered inside 7 days, fault reported, video supplied.', 3: 'Checked order and delivery date. Fault confirmed by video.', 4: 'Offered replacement or refund within policy timelines.', 5: 'Customer accepted and will wait.', 6: 'Confirm choice by email.', 7: 'Agent, 4pm today.', 8: 'None' }),
  C: N({ 1: 'Duplicate charge on one order.', 2: 'Two completed debits, same amount and time, wallet card.', 3: 'Verified both debits on the record.', 4: 'Boundary stated, then transferred to supervisor with Payments step.', 5: 'Customer accepted supervisor call.', 6: 'Supervisor to call; Payments to confirm.', 7: 'Segun, 2pm today. Payments, 1 working day.', 8: 'Customer said "Are you stupid" and later relapsed. I stated a boundary naming the insults and conditions, then transferred.' }),
  D: N({ 1: 'Wrong item delivered, customer claims lost job income.', 2: 'Ordered item differs from delivered. Claim above agent limit.', 3: 'Order checked. Loss and amount unverified until proof arrives.', 4: 'Arranged correction. Escalated to Claims reviewer. Agent cannot decide business loss.', 5: 'Customer will send proof and wait for review.', 6: 'Claims reviewer to review claim.', 7: 'Claims reviewer, 2 working days.', 8: 'Escalated to Claims reviewer (Titilayo Ogunleye) with summary of job, proof and amount.' })
};

const weak = {
  A: [
    () => 'Please check the policy.',
    () => 'Calm down. You should have waited. Whatever.',
    () => 'There is nothing I can do.',
    () => 'Wait.',
    () => 'Okay bye.'
  ],
  B: [
    () => 'Read the returns policy. This is a change of mind case so it is not eligible after delivery.',
    () => 'I already told you to read the policy.',
    () => 'Nothing I can do.'
  ],
  C: [
    () => 'Stop shouting. What is your problem?',
    () => 'You are rude. Whatever.',
    () => 'Calm down.',
    () => 'Wait.',
    () => 'Bye.'
  ],
  D: [
    () => 'No, we cannot pay that.',
    () => 'The policy says no.'
  ]
};
const weakNotes = {
  A: N({ 1: 'Late', 2: 'Late order', 8: 'None' }),
  B: N({ 1: 'Faulty', 4: 'Told to read policy', 8: 'None' }),
  C: N({ 1: 'Charged twice', 5: 'Customer angry', 8: 'None' }),
  D: N({ 1: 'Wants money', 8: 'None', _expire: true })
};

const over = {
  A: [
    (f) => `I am sorry about the delay. I have checked order ${f.orderNo}. Your order will arrive tomorrow by 2pm, I promise.`,
    () => 'I will refund you today and Logistics will update you by 5pm.',
    (f) => `I have checked tracking on ${f.orderNo}. Logistics will trace it and update you by 5pm today. If they cannot confirm a date you can cancel for a refund to your wallet within 3 working days.`
  ],
  B: [
    (f) => `I am sorry about the earlier reply. The ${f.item} is faulty, so this is a defect. Please send a photo or short video.`,
    (f) => `I am sorry. A replacement ships within 2 working days, or a refund is paid within 3 working days. I will update you by 5pm today.`
  ],
  C: [
    (f) => `I am sorry about the double charge on ${f.orderNo}. I have verified both debits of ${f.amount}.`,
    () => 'Please do not call me stupid. If you keep insulting me I will have to transfer you to my supervisor.',
    () => 'I am raising it with Payments now.',
    (f) => `I am sorry. Payments will confirm the two debits by 3pm today and I will transfer this to the shift supervisor.`
  ],
  D: [
    () => 'I am sorry about this. Tell me the job and proof please.',
    (f) => `I will arrange the correct item. I can only give up to ₦5,000 credit, but I have escalated to the Claims reviewer who responds within 2 working days and I am sure they will approve your ${f.demand}.`,
    (f) => `I have escalated your claim to the Claims reviewer who responds within 2 working days. I cannot decide it myself.`
  ]
};
const overNotes = {
  A: N({ 1: 'Delay. Customer wants refund.', 2: 'Order delayed.', 4: 'Promised delivery tomorrow 2pm.', 5: 'Customer happy.', 6: 'Deliver tomorrow.', 7: 'Logistics, tomorrow', 8: 'None' }),
  B: N({ 1: 'Faulty item', 2: 'Delivered, fault', 3: 'Asked for video', 4: 'Offered replacement or refund', 5: 'Accepted', 6: 'Update', 7: 'Agent 5pm', 8: 'None' }),
  C: N({ 1: 'Duplicate charge', 2: 'Two debits', 3: 'Verified', 4: 'Boundary, Payments step, supervisor transfer', 5: 'Accepted', 6: 'Supervisor call', 7: 'Supervisor 3pm', 8: 'Customer insulted me. I set a boundary.' }),
  D: N({ 1: 'Wrong item, loss claim', 2: 'Ordered item not delivered', 3: 'Not verified', 4: 'Escalated to Claims', 5: 'Customer waiting', 6: 'Claims decision', 7: 'Claims reviewer 2 days', 8: 'Escalated.' })
};

const slow = {
  A: [],
  B: strong.B,
  C: strong.C,
  D: strong.D
};

// ---------- Learners ----------
async function learner(name, email) {
  const l = await world.login(name, email);
  return l.body.token;
}

// 1. Chidi Eze: trial 1 weak, trial 2 strong (shows trial selection)
let tok = await learner('Chidi Eze', 'chidi.eze@example.test');
await playTrial(tok, { replies: weak, notes: weakNotes });
clock.t += 3600e3;
await playTrial(tok, { replies: strong, notes: strongNotes });

// 2. Funmi Bello: one weak trial
clock.t += 1800e3;
tok = await learner('Funmi Bello', 'funmi.bello@example.test');
await playTrial(tok, { replies: weak, notes: weakNotes });

// 3. Garba Musa: overpromises
clock.t += 1800e3;
tok = await learner('Garba Musa', 'garba.musa@example.test');
await playTrial(tok, { replies: over, notes: overNotes });

// 4. Halima Yusuf: never answers Case A (three missed windows), offline gap, then solid work
clock.t += 1800e3;
tok = await learner('Halima Yusuf', 'halima.yusuf@example.test');
await call('POST', '/trial/open', {}, tok);
await call('POST', '/shift/start', {}, tok);
clock.t += 20 * 60 * 1000; // phone goes offline for 20 minutes
await call('GET', '/state', null, tok);
await playTrial(tok, { replies: slow, notes: strongNotes });

// 5. Ifeanyi Obi: open trial, not submitted
clock.t += 1800e3;
tok = await learner('Ifeanyi Obi', 'ifeanyi.obi@example.test');
await call('POST', '/trial/open', {}, tok);
await call('POST', '/shift/start', {}, tok);
{
  const v = await state(tok);
  const c = caseOf(v, 'A');
  await call('POST', '/send', { caseId: 'A', text: 'I am sorry about this. I am checking the order for you now.', requestId: 'o1', lastCustomerId: c.lastCustomerId }, tok);
  await tick(tok, 6000);
}

// ---------- Dump ----------
const st = await world.storeP;
const ids = await st.listTrialIds();
for (const id of ids) writeFileSync(join(out, `${id}.json`), JSON.stringify(await st.getTrial(id), null, 2));
console.log(`Wrote ${ids.length} FAKE trial records to ${out}/`);
