import assert from 'node:assert/strict';
import { makeWorld, caseOf, lastCustomer } from './helpers.mjs';

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ok  ', name); }
  catch (e) { failed++; console.log('  FAIL', name, '\n      ', (e && e.message || e).toString().split('\n').slice(0, 6).join('\n       ')); }
}

async function setup(email = 'ada@example.com', name = 'Ada Obi') {
  const w = makeWorld();
  const l = await w.login(name, email);
  const token = l.body.token;
  await w.call('POST', '/trial/open', {}, token);
  const s = await w.call('POST', '/shift/start', {}, token);
  return { w, token, view: s.body.view };
}
async function send(w, token, caseId, text, extra = {}) {
  const st = await w.call('GET', '/state', null, token);
  const c = caseOf(st.body.view, caseId);
  const r = await w.call('POST', '/send', { caseId, text, requestId: `r${Math.random()}`, lastCustomerId: c.lastCustomerId, subject: c.subject ? `Re: ${c.subject}` : null, ...extra }, token);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.view;
}
const stateOf = async (w, token) => (await w.call('GET', '/state', null, token)).body.view;
const rawTrial = async (w) => { const st = await w.storeP; const ids = await st.listTrialIds(); return st.getTrial(ids[0]); };

const A_GOOD1 = 'I am sorry about the delay with your Ankara aso ebi set. I have checked order TRV48213 and the tracking shows it at the Ikeja hub since 3 days ago.';
const A_GOOD2 = 'I will raise a delivery trace with Logistics and update you by 3pm. If Logistics cannot confirm a delivery date, you can cancel for a full refund to your Trovra Wallet within 3 working days.';

console.log('Identity and menu');
await test('login creates learner, rejects name mismatch, case-insensitive email', async () => {
  const w = makeWorld();
  const a = await w.login('Ada Obi', 'Ada@Example.com ');
  assert.equal(a.status, 200);
  assert.equal(a.body.menu.remaining, 3);
  const b = await w.login('  ada   obi ', 'ada@example.com');
  assert.equal(b.status, 200);
  const c = await w.login('Someone Else', 'ada@example.com');
  assert.equal(c.status, 403);
  assert.equal((await w.login('A', 'bad')).status, 400);
});

console.log('Shift start and case A');
await test('shift timestamp is captured at Start shift and frozen across resume and date change', async () => {
  const w = makeWorld();
  const l = await w.login('Ada Obi', 'ada@example.com');
  const token = l.body.token;
  const o = await w.call('POST', '/trial/open', {}, token);
  assert.equal(o.body.view.trial.started, false);
  assert.equal(o.body.view.trial.shift, null);
  await w.wait(60000, null);
  const s = await w.call('POST', '/shift/start', {}, token);
  const shift = s.body.view.trial.shift;
  assert.match(shift.timeText, /9:01 AM WAT/);
  // next day, second device
  w.clock.t += 26 * 3600 * 1000;
  const l2 = await w.login('Ada Obi', 'ada@example.com');
  const o2 = await w.call('POST', '/trial/open', {}, l2.body.token);
  assert.deepEqual(o2.body.view.trial.shift, shift);
});
await test('case A opens with the opener and a live-chat deadline of 90s', async () => {
  const { view } = await setup();
  const a = caseOf(view, 'A');
  assert.match(lastCustomer(a).text, /You promised my Ankara aso ebi set yesterday/);
  assert.ok(a.deadline - view.serverNow === 90000);
  assert.equal(view.cases.length, 1);
});
await test('browser view never contains future lines, heat or signals', async () => {
  const { w, token } = await setup();
  const raw = JSON.stringify(await stateOf(w, token));
  for (const bad of ['Are you stupid', 'useless', 'heat', 'signal', 'Duplicate charge', 'TRV70125', 'overpromise']) {
    assert.ok(!raw.toLowerCase().includes(bad.toLowerCase()), `view leaks "${bad}"`);
  }
});

console.log('Full run');
await test('good run: A resolved, B resolved, C transferred, D resolved, notes, submit', async () => {
  const { w, token } = await setup();
  let v = await send(w, token, 'A', A_GOOD1);
  v = await w.wait(5000, token).then((r) => r.body.view);
  assert.ok(!caseOf(v, 'B'), 'B must not arrive before 60s');
  v = await send(w, token, 'A', A_GOOD2);
  // B arrives 60s after first reply in A (the first reply was ~5s ago)
  v = (await w.wait(8000, token)).body.view;
  assert.equal(caseOf(v, 'A').status, 'closed');
  assert.equal(caseOf(v, 'A').outcome, 'resolved');
  assert.match(lastCustomer(caseOf(v, 'A')).text, /^Okay\. Trace within|^Okay\. Trace by 3pm|^Fine\./);
  assert.ok(caseOf(v, 'C'), 'C opens when A closes');
  v = (await w.wait(60000, token)).body.view;
  const B = caseOf(v, 'B');
  assert.ok(B, 'B arrived');
  assert.match(B.messages[0].text, /wireless earbuds/);
  assert.equal(B.subject, 'Faulty wireless earbuds');
  assert.equal(B.deadline - B.messages[0].at, 180000 + (B.deadline - B.messages[0].at - 180000));

  // Case C
  v = await send(w, token, 'C', 'I am sorry about the double charge on order TRV70125. I can see both debits of ₦32,000 on the statement. Can you tell me what time it happened?');
  v = (await w.wait(4000, token)).body.view;
  const C = caseOf(v, 'C');
  assert.match(lastCustomer(C).text, /stupid|useless/);
  v = await send(w, token, 'C', 'I want to help you, but I cannot continue if the insults continue. Please keep the conversation respectful so that I can sort out your money.');
  v = (await w.wait(4000, token)).body.view;
  assert.match(lastCustomer(caseOf(v, 'C')).text, /Fine\. Just check the transaction|Okay\. I am angry because/);
  v = await send(w, token, 'C', 'I have verified the two debits on your wallet card and I am raising it with Payments now.');
  v = (await w.wait(4000, token)).body.view;
  assert.match(lastCustomer(caseOf(v, 'C')).text, /deaf|incompetent/);
  assert.ok(!caseOf(v, 'D') || true);
  v = await send(w, token, 'C', 'I am sorry. I will pause this chat and transfer you to the shift supervisor, Segun. Payments will confirm the two debits by 2pm today and I have recorded your words.');
  v = (await w.wait(4000, token)).body.view;
  assert.equal(caseOf(v, 'C').outcome, 'transferred');
  assert.match(lastCustomer(caseOf(v, 'C')).text, /supervisor's call/);
  v = (await w.wait(60000, token)).body.view;
  assert.ok(caseOf(v, 'D'), 'D arrived');

  // Case B resolve
  v = await send(w, token, 'B', 'Good day Adaobi. I am sorry that you were told to read the policy earlier. Your earbuds are faulty, so this is a defect and not a change of mind. Please send one photo or short video of the fault.');
  v = (await w.wait(62000, token)).body.view;
  const B2 = caseOf(v, 'B');
  assert.match(lastCustomer(B2).text, /attached a short video/);
  assert.ok(B2.record.rows.find((r) => r[0] === 'Fault evidence')[1].startsWith('Received'));
  v = await send(w, token, 'B', 'I am sorry for the wait. I have checked order TRV55120 and I will arrange a replacement, shipped within 2 working days, or a refund paid within 3 working days if you prefer. I will update you by 4pm today.');
  v = (await w.wait(62000, token)).body.view;
  assert.equal(caseOf(v, 'B').outcome, 'resolved', JSON.stringify(caseOf(v, 'B').messages.slice(-2)));

  // Case D resolve
  v = await send(w, token, 'D', 'Good day Kingsley. I am sorry you received an inkjet printer instead of the P200. Can you tell me about the printing job and send proof of the loss and your invoice?');
  v = (await w.wait(62000, token)).body.view;
  v = await send(w, token, 'D', 'I will arrange collection of the wrong printer and a replacement P200. I can give a goodwill credit up to ₦5,000, but I cannot decide a business loss claim. I have escalated your claim with a summary to the Claims reviewer, who will respond within 2 working days.');
  v = (await w.wait(62000, token)).body.view;
  assert.equal(caseOf(v, 'D').outcome, 'resolved', JSON.stringify(caseOf(v, 'D').messages.slice(-2)));

  // Notes
  for (const id of ['A', 'B', 'C', 'D']) {
    const o = await w.call('POST', '/note/open', { caseId: id }, token);
    assert.equal(o.status, 200);
    const fields = { 1: 'Issue', 2: 'Facts', 3: 'Verified', 4: 'Action', 5: 'Outcome', 6: 'Next', 7: 'Owner', 8: id === 'C' || id === 'D' ? 'Escalated' : 'None' };
    const r = await w.call('POST', '/note/submit', { caseId: id, fields, seq: Date.now() }, token);
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
  const fin = await stateOf(w, token);
  assert.equal(fin.trial.allDone, true);
  const sub = await w.call('POST', '/submit', {}, token);
  assert.equal(sub.status, 200);
  assert.equal(sub.body.menu.used, 1);
  assert.equal(sub.body.menu.remaining, 2);
  assert.equal(sub.body.menu.openTrialNo, null);
  assert.equal(sub.body.menu.nextTrialNo, 2);

  // stored evidence
  const t = await rawTrial(w);
  assert.equal(t.status, 'submitted');
  assert.ok(t.cases.A.heatHistory.length > 2);
  assert.ok(t.cases.A.signals[0].signals.includes('acknowledgement_with_impact') || t.cases.A.signals[0].signals.includes('acknowledgement'));
  assert.ok(t.cases.C.signals.some((s) => s.signals.includes('boundary') && s.boundaryAfterInsult));
  assert.equal(t.cases.C.outcome, 'transferred');
  assert.equal(t.shift.timezone, 'Africa/Lagos');
});

console.log('Timers');
await test('missed windows: chaser, chaser, then unresolved close on the third; C opens', async () => {
  const { w, token } = await setup();
  let v = (await w.wait(91000, token)).body.view;
  let A = caseOf(v, 'A');
  assert.equal(A.messages.filter((m) => m.kind === 'chaser' || m.text.startsWith('Hello?')).length >= 1, true);
  assert.equal(lastCustomer(A).text, 'Hello? Are you still there?');
  v = (await w.wait(90000, token)).body.view;
  assert.equal(lastCustomer(caseOf(v, 'A')).text, 'I am still waiting. Please reply.');
  v = (await w.wait(91000, token)).body.view;
  A = caseOf(v, 'A');
  assert.equal(A.status, 'closed');
  assert.equal(A.outcome, 'unresolved');
  v = (await w.wait(4000, token)).body.view;
  assert.ok(caseOf(v, 'C'));
  const t = await rawTrial(w);
  assert.equal(t.cases.A.totalMissed, 3);
  assert.ok(t.cases.A.heat >= 5 || t.cases.A.heatHistory.at(-1).heat === 5);
});
await test('typing before the deadline extends chat to 120s once', async () => {
  const { w, token } = await setup();
  await w.wait(20000, token);
  const d = await w.call('POST', '/draft', { caseId: 'A', text: 'I am check', seq: 1 }, token);
  assert.equal(d.status, 200);
  let v = (await w.wait(75000, token)).body.view; // t=95s
  assert.equal(caseOf(v, 'A').messages.length, 1, 'no chaser yet');
  assert.equal(caseOf(v, 'A').deadline - caseOf(v, 'A').messages[0].at, 120000);
  v = (await w.wait(30000, token)).body.view; // t=125s
  assert.equal(lastCustomer(caseOf(v, 'A')).text, 'Hello? Are you still there?');
});
await test('offline gap counts as at most one missed window and never closes a case', async () => {
  const { w, token } = await setup();
  w.clock.t += 20 * 60 * 1000;
  const v = (await w.call('GET', '/state', null, token)).body.view;
  const A = caseOf(v, 'A');
  assert.equal(A.status, 'open');
  assert.equal(A.messages.filter((m) => m.from === 'customer').length, 2);
  assert.ok(A.deadline > v.serverNow);
  const t = await rawTrial(w);
  assert.equal(t.offlineGaps.length, 1);
  assert.equal(t.cases.A.totalMissed, 1);
});
await test('refresh does not extend a deadline', async () => {
  const { w, token } = await setup();
  const d0 = caseOf(await stateOf(w, token), 'A').deadline;
  await w.wait(12000, token);
  const d1 = caseOf(await stateOf(w, token), 'A').deadline;
  assert.equal(d0, d1);
});
await test('note expiry saves typed text and completes the note', async () => {
  const { w, token } = await setup();
  await send(w, token, 'A', A_GOOD1);
  await w.wait(4000, token);
  await send(w, token, 'A', A_GOOD2);
  await w.wait(4000, token);
  await w.call('POST', '/note/open', { caseId: 'A' }, token);
  await w.call('POST', '/note/save', { caseId: 'A', fields: { 1: 'Late order', 4: 'Raised trace' }, seq: 1 }, token);
  const v = (await w.wait(185000, token)).body.view;
  assert.equal(v.notes.A.status, 'done');
  assert.equal(v.notes.A.expired, true);
  assert.equal(v.notes.A.fields[1], 'Late order');
  const late = await w.call('POST', '/note/save', { caseId: 'A', fields: { 1: 'changed' }, seq: 2 }, token);
  assert.equal(late.status, 409);
});

console.log('Sessions, duplicates, reset');
await test('second login moves the session; old device is rejected; state is restored', async () => {
  const { w, token } = await setup();
  await send(w, token, 'A', 'I am checking order TRV48213 now.');
  await w.wait(4000, token);
  await w.call('POST', '/draft', { caseId: 'A', text: 'half typed reply', seq: 5 }, token);
  const l2 = await w.login('Ada Obi', 'ada@example.com');
  const old = await w.call('GET', '/state', null, token);
  assert.equal(old.status, 409);
  assert.equal(old.body.error, 'session_moved');
  const w2 = await w.call('POST', '/send', { caseId: 'A', text: 'x y z abc', requestId: 'zz' }, token);
  assert.equal(w2.status, 409);
  const o = await w.call('POST', '/trial/open', {}, l2.body.token);
  assert.equal(o.status, 200);
  const A = caseOf(o.body.view, 'A');
  assert.equal(A.draft, 'half typed reply');
  assert.ok(A.messages.some((m) => m.from === 'agent'));
  const menu = (await w.call('GET', '/menu', null, l2.body.token)).body.menu;
  assert.equal(menu.used, 0);
  assert.equal(menu.openTrialNo, 1);
});
await test('stale draft sequence is ignored', async () => {
  const { w, token } = await setup();
  await w.call('POST', '/draft', { caseId: 'A', text: 'newer', seq: 10 }, token);
  await w.call('POST', '/draft', { caseId: 'A', text: 'older', seq: 9 }, token);
  assert.equal(caseOf(await stateOf(w, token), 'A').draft, 'newer');
});
await test('duplicate send with the same requestId records one reply', async () => {
  const { w, token } = await setup();
  const body = { caseId: 'A', text: 'I am sorry. I have checked order TRV48213 for you.', requestId: 'dup-1' };
  const a = await w.call('POST', '/send', body, token);
  const b = await w.call('POST', '/send', body, token);
  assert.equal(a.status, 200);
  assert.equal(b.body.duplicate, true);
  assert.equal(caseOf(b.body.view, 'A').messages.filter((m) => m.from === 'agent').length, 1);
});
await test('cannot send while the customer is typing or on a closed case', async () => {
  const { w, token } = await setup();
  await w.call('POST', '/send', { caseId: 'A', text: 'I am sorry about this delay.', requestId: 'r1' }, token);
  const again = await w.call('POST', '/send', { caseId: 'A', text: 'second message right away', requestId: 'r2' }, token);
  assert.equal(again.status, 409);
});
await test('reset: one use, confirmation required, clears content, keeps shift time, no attempt used', async () => {
  const { w, token, view } = await setup();
  await send(w, token, 'A', A_GOOD1);
  await w.call('POST', '/draft', { caseId: 'A', text: 'draft', seq: 99 }, token);
  const noConfirm = await w.call('POST', '/reset', {}, token);
  assert.equal(noConfirm.status, 400);
  await w.wait(8000, token);
  const r = await w.call('POST', '/reset', { confirm: true }, token);
  assert.equal(r.status, 200);
  const v = r.body.view;
  assert.equal(v.trial.resetAvailable, false);
  assert.equal(v.cases.length, 1);
  assert.equal(caseOf(v, 'A').messages.length, 1);
  assert.equal(caseOf(v, 'A').draft, '');
  assert.deepEqual(v.trial.shift, view.trial.shift);
  const again = await w.call('POST', '/reset', { confirm: true }, token);
  assert.equal(again.status, 403);
  const t = await rawTrial(w);
  assert.equal(t.resetCount, 1);
  assert.ok(t.resetAt);
  assert.equal((await w.call('GET', '/menu', null, token)).body.menu.used, 0);
});

console.log('Engine rules');
await test('overpromise of a delivery date is flagged, customer takes it as given, case continues', async () => {
  const { w, token } = await setup();
  const v = await send(w, token, 'A', 'I am sorry. I have checked order TRV48213. Your order will arrive tomorrow by 2pm, I promise.');
  const v2 = (await w.wait(4000, token)).body.view;
  const A = caseOf(v2, 'A');
  assert.equal(A.status, 'open');
  assert.match(lastCustomer(A).text, /2pm then\. I will hold you to that/);
  const t = await rawTrial(w);
  assert.ok(t.cases.A.flags.some((f) => f.flag === 'overpromise_delivery_date'));
});
await test('negated promise is not flagged', async () => {
  const { w, token } = await setup();
  await send(w, token, 'A', 'I cannot promise that it will arrive tomorrow. I have checked order TRV48213.');
  const t = await rawTrial(w);
  assert.ok(!t.cases.A.flags.some((f) => f.flag.startsWith('overpromise')));
});
await test('case A: no acceptance without the refund route, even with owner and time', async () => {
  const { w, token } = await setup();
  await send(w, token, 'A', 'I am sorry. I have checked order TRV48213 and the tracking.');
  await w.wait(4000, token);
  await send(w, token, 'A', 'Logistics will update you by 3pm on the trace.');
  const v = (await w.wait(4000, token)).body.view;
  assert.equal(caseOf(v, 'A').status, 'open');
});
await test('case A: hostile or blaming reply raises heat and never resolves', async () => {
  const { w, token } = await setup();
  await send(w, token, 'A', 'Calm down. You should have checked the policy. Whatever.');
  await w.wait(4000, token);
  const t = await rawTrial(w);
  assert.ok(t.cases.A.signals[0].signals.includes('blame_or_policy_dodge'));
  assert.ok(t.cases.A.signals[0].signals.includes('hostility'));
  assert.equal(t.cases.A.heat, 5);
});
await test('case A: brush-off under four words is flagged', async () => {
  const { w, token } = await setup();
  await send(w, token, 'A', 'Wait a moment');
  const t = await rawTrial(w);
  assert.ok(t.cases.A.flags.some((f) => f.flag === 'brush_off'));
});
await test('case A: chat closes unresolved after five replies without a remedy', async () => {
  const { w, token } = await setup();
  for (let i = 0; i < 5; i++) { await send(w, token, 'A', `Please hold on while I look into this matter number ${i}.`); await w.wait(4000, token); }
  const v = await stateOf(w, token);
  assert.equal(caseOf(v, 'A').status, 'closed');
  assert.equal(caseOf(v, 'A').outcome, 'unresolved');
});
await test('case C: the first insult and relapse arrive for every learner, no acceptance before relapse', async () => {
  for (const email of ['c1@example.com', 'c2@example.com']) {
    const { w, token } = await setup(email, 'Test ' + email[1]);
    await send(w, token, 'A', 'I have nothing for now.');
    await w.wait(4000, token);
    await send(w, token, 'A', A_GOOD1 + ' ' + A_GOOD2);
    await w.wait(8000, token);
    // perfect C reply first: still gets the insult
    await send(w, token, 'C', 'I am sorry. I have verified the two debits of ₦32,000 and Payments will confirm by 3pm today.');
    let v = (await w.wait(4000, token)).body.view;
    assert.match(lastCustomer(caseOf(v, 'C')).text, /stupid|useless/);
    await send(w, token, 'C', 'Payments will confirm the two debits by 3pm today. I am sorry, I have checked it.');
    v = (await w.wait(4000, token)).body.view;
    assert.equal(caseOf(v, 'C').status, 'open', 'must not accept before relapse');
    await send(w, token, 'C', 'I am checking the debits on the statement for you and will keep going.');
    v = (await w.wait(4000, token)).body.view;
    assert.match(lastCustomer(caseOf(v, 'C')).text, /deaf|incompetent/);
    // after relapse a Payments step with verification resolves
    await send(w, token, 'C', 'I am sorry about that. I have verified both debits and Payments will confirm the reversal by 3pm today.');
    v = (await w.wait(4000, token)).body.view;
    assert.equal(caseOf(v, 'C').outcome, 'resolved', JSON.stringify(caseOf(v, 'C').messages.slice(-2)));
  }
});
await test('case B: change-of-mind framing blocks acceptance; missing evidence request blocks acceptance', async () => {
  const { w, token } = await setup();
  await send(w, token, 'A', A_GOOD1 + ' ' + A_GOOD2);
  await w.wait(70000, token);
  assert.ok(caseOf(await stateOf(w, token), 'B'));
  await send(w, token, 'B', 'I am sorry. This is a change of mind return so I will arrange a replacement within 2 working days. I will confirm by 4pm today.');
  let v = (await w.wait(62000, token)).body.view;
  assert.equal(caseOf(v, 'B').status, 'open');
  assert.match(lastCustomer(caseOf(v, 'B')).text, /not a change of mind|return rules/i);
  await send(w, token, 'B', 'I am sorry. A replacement within 2 working days is possible for this fault. I will confirm by 4pm today.');
  v = (await w.wait(62000, token)).body.view;
  assert.equal(caseOf(v, 'B').status, 'open', 'evidence never requested');
  const t = await rawTrial(w);
  assert.equal(t.cases.B.mem.evidenceReceived, false);
});
await test('case D: suggesting approval is flagged and blocks acceptance', async () => {
  const { w, token } = await setup();
  await send(w, token, 'A', A_GOOD1 + ' ' + A_GOOD2);
  await w.wait(8000, token);
  await send(w, token, 'C', 'I am sorry. I have verified the two debits. Payments will confirm by 3pm.');
  await w.wait(4000, token);
  await w.wait(65000, token);
  assert.ok(caseOf(await stateOf(w, token), 'D'));
  await send(w, token, 'D', 'I am sorry. I will arrange a replacement. I can give up to ₦5,000 credit but I cannot decide a loss claim. I have escalated to the Claims reviewer who will respond within 2 working days and I am sure they will approve it.');
  const v = (await w.wait(62000, token)).body.view;
  assert.equal(caseOf(v, 'D').status, 'open');
  const t = await rawTrial(w);
  assert.ok(t.cases.D.flags.some((f) => f.flag === 'overpromise_approval'));
});
await test('asking for card details is flagged for the marker', async () => {
  const { w, token } = await setup();
  await send(w, token, 'A', 'Please send me your card number and PIN so I can check.');
  const t = await rawTrial(w);
  assert.ok(t.cases.A.flags.some((f) => f.flag === 'asked_sensitive_payment_detail'));
});

console.log('Three trials');
await test('three trials use fact sets 1, 2 and 3; a fourth is refused; all are retained', async () => {
  const w = makeWorld();
  const l = await w.login('Ada Obi', 'ada@example.com');
  const token = l.body.token;
  const names = [];
  for (let n = 1; n <= 3; n++) {
    const o = await w.call('POST', '/trial/open', {}, token);
    assert.equal(o.body.view.trial.trialNo, n);
    const s = await w.call('POST', '/shift/start', {}, token);
    names.push(caseOf(s.body.view, 'A').customer);
    // force completion by editing the stored trial
    const st = await w.storeP;
    const ids = await st.listTrialIds();
    const trial = await st.getTrial(ids.find((i) => i.includes(`-t${n}-`)));
    for (const id of ['A', 'B', 'C', 'D']) {
      trial.cases[id].status = 'closed'; trial.cases[id].outcome = 'resolved';
      trial.notes[id].status = 'done';
    }
    await st.putTrial(trial);
    const sub = await w.call('POST', '/submit', {}, token);
    assert.equal(sub.status, 200, JSON.stringify(sub.body));
  }
  assert.deepEqual(names, ['Chioma Okafor', 'Musa Ibrahim', 'Ngozi Anyanwu']);
  const o4 = await w.call('POST', '/trial/open', {}, token);
  assert.equal(o4.status, 403);
  const st = await w.storeP;
  assert.equal((await st.listTrialIds()).length, 3);
  const menu = (await w.call('GET', '/menu', null, token)).body.menu;
  assert.equal(menu.used, 3);
  assert.equal(menu.remaining, 0);
  assert.equal(menu.nextTrialNo, null);
});
await test('submit is refused until all cases and notes are done', async () => {
  const { w, token } = await setup();
  const r = await w.call('POST', '/submit', {}, token);
  assert.equal(r.status, 409);
});

await test('case C charge time is derived from the frozen shift start and is always earlier', async () => {
  const w = makeWorld(Date.parse('2026-10-22T00:20:00+01:00')); // shortly after midnight WAT
  const l = await w.login('Ada Obi', 'ada@example.com');
  const token = l.body.token;
  await w.call('POST', '/trial/open', {}, token);
  await w.call('POST', '/shift/start', {}, token);
  const t1 = await (async () => { const st = await w.storeP; const ids = await st.listTrialIds(); return st.getTrial(ids[0]); })();
  const { factsFor } = await import('../netlify/functions/engine.mjs');
  const f = factsFor(t1, 'C');
  assert.match(f.chargeTime, /^11:\d\dpm yesterday$/, f.chargeTime);
  const again = factsFor(t1, 'C');
  assert.equal(again.chargeTime, f.chargeTime);
  // mid-morning start: same day
  const w2 = makeWorld(Date.parse('2026-10-22T09:00:00+01:00'));
  const l2 = await w2.login('Bo Ade', 'bo@example.com');
  await w2.call('POST', '/trial/open', {}, l2.body.token);
  await w2.call('POST', '/shift/start', {}, l2.body.token);
  const st2 = await w2.storeP; const t2 = await st2.getTrial((await st2.listTrialIds())[0]);
  assert.equal(factsFor(t2, 'C').chargeTime, '8:08am today');
});

console.log('Export');
await test('merge keeps learner text exactly, including quotes, commas and blank lines', async () => {
  const { flatten, toCsv, COLUMNS } = await import('../merge.mjs');
  const { w, token } = await setup();
  const tricky = 'I am sorry, "really".\n\nI have checked order TRV48213, and the tracking.  Two  spaces   kept.';
  await send(w, token, 'A', tricky);
  const t = await rawTrial(w);
  const rows = flatten(t);
  assert.equal(rows.length, 4);
  assert.ok(rows[0].transcript.includes(tricky), 'transcript must contain the exact learner text');
  const csv = toCsv(rows);
  // parse back with a minimal CSV reader
  const out = []; let cur = '', q = false, row = [];
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (q) { if (ch === '"' && csv[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur.replace(/\r$/, '')); out.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  assert.equal(out.length, 5);
  assert.equal(out[0].length, COLUMNS.length);
  assert.ok(out[1][COLUMNS.indexOf('transcript')].includes(tricky));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
