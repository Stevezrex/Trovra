// Deterministic rule engine. No AI service is called and learner text never leaves the server.
// The engine records evidence and moves each case forward. It does not award marks.

import { CONFIG } from './config.mjs';
import { CASE_ORDER, CASE_META, FACTS, LINES, SUBJECTS, buildRecord, fmtDate, fmtTime, chargeTimeText } from './cases.mjs';
import { NOTE_FIELDS } from './static.mjs';

const SEC = 1000;

// =====================================================================
// Text analysis
// =====================================================================

const norm = (s) => String(s || '').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
const splitSentences = (s) => s.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
const wordCount = (s) => (String(s).match(/[\p{L}\p{N}'₦]+/gu) || []).length;

const NEG = /\b(cannot|can't|can not|unable|not able|won't|will not|do not|don't|not promise|no promise|not sure|am not|isn't|is not|wouldn't|would not|never|not guaranteed|no guarantee)\b/;
const COND = /\b(if|once|when|unless|in case|subject to|provided)\b/;

const ABS_RE = /\b(\d{1,2}:\d{2}\s?(?:am|pm)?|\d{1,2}\s?(?:am|pm)|\d{1,2}\s?o'?clock)\b/;
const NUMW = '(?:\\d+|one|two|three|four|five|six|twelve|twenty[- ]four|forty[- ]eight|an?|half an?)';
const REL_RE = new RegExp(`\\b(?:within|in|after|inside)\\s+(?:the\\s+next\\s+)?${NUMW}\\s*(?:minutes?|mins?|hours?|hrs?|working days?|business days?|days?)\\b(?!\\s+of\\s+(?:delivery|purchase|receiving))`);
const DAY_RE = /\b(today|tomorrow|tonight|end of (?:the )?day|close of business|cob|this afternoon|this evening|this morning|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next working day|next business day)\b/;

export function extractTime(text) {
  const t = norm(text);
  let m = t.match(ABS_RE);
  if (m) return { kind: 'abs', text: m[1].replace(/\s+/g, '') };
  m = t.match(REL_RE);
  if (m) return { kind: 'rel', text: m[0] };
  m = t.match(DAY_RE);
  if (m) return { kind: 'day', text: m[1] };
  return null;
}

const OWNERS = [
  [/claims reviewer|titilayo|claims team|claims department/, 'the Claims reviewer', 'claims'],
  [/\bpayments?\b|amaka/, 'Payments', 'payments'],
  [/logistics|ibrahim/, 'Logistics', 'logistics'],
  [/supervisor|segun/, 'the shift supervisor', 'supervisor']
];
const SELF = /\b(i|i'll|i'm|i've|me|my|we|we'll|our|myself|us)\b/;
const COMMIT = /\b(will|shall|'ll|going to|have (?:raised|escalated|opened|sent|forwarded|started|logged|submitted|checked)|has been (?:raised|escalated|opened|sent|forwarded|logged)|am (?:raising|escalating|checking|sending|forwarding|arranging)|raised|escalated|forwarded|logged|update you|get back|come back|follow up|call you|reach out|confirm|responds?|respond)\b/;
const ACTION_VERB = /\b(let me (?:check|look|verify|confirm|pull|trace)|don (?:check|verify|raise|confirm)|checked|checking|looked|looking|verified|verifying|confirmed|reviewed|reviewing|i can see|i see|i have seen|i've seen|found|raised|raising|opened|traced|tracing|escalated|escalating|pulled up|searched|investigat\w+|logged|i have (?:a|the) record)\b/;
const FACT_REF = /(trv\d+|\b\d[\d,]{3,}\b|tracking|scan|hub|debit|charge|statement|transaction|wallet|delivered|delivery|order|invoice|record|account|payment)/;
const ACK = /\b(sorry|apolog\w+|i understand|i do understand|understand (?:how|that|why)|i know (?:this|how|that|it)|i can see (?:how|why|that this)|frustrat\w+|inconvenien\w+|i hear you|that must|must be (?:difficult|frustrating|stressful)|pardon|regret|disappoint\w+|thank you for your patience|thanks for your patience|sorry o)\b/;
const IMPACT = /(event|ceremony|church|resumption|wasted|waiting|money|job|work|loss|lost|stress|delay|twice|double|charged|business|client|time)/;
const QUESTION = /\?|\b(?:please|kindly)\s+(?:send|share|confirm|tell|provide|attach|let me know|forward|give|upload)\b|\b(?:can|could|would) you\b|\bwhat (?:is|was|are|were|did|time|date|amount|do|would)\b|\bwhen (?:did|was|were)\b|\bhow (?:did|do|much)\b|\bwhich\b|\bwho\b/;
const OPTIONS = /\b(refund\w*|replace\w*|cancel\w*|trace|credit|escalat\w+|review\w*)\b/;
const LIMIT = /\b(cannot|can't|unable|not able|limit\w*|authority|above my|beyond my|only (?:up to|the claims)|up to ₦|policy (?:allows|says|states)|not in my)\b/;

const BLAME = /\b(read (?:the|our|your) (?:returns? )?polic\w+|refer to (?:the|our) (?:returns? )?polic\w+|as (?:stated|per|stipulated) in (?:the|our) polic\w+|check (?:the|our) polic\w+|calm down|you should have|you ought to|you failed to|it is your fault|that's your fault|your fault|not my (?:problem|fault|job)|nothing (?:i|we) can do|nothing can be done|there is nothing|that is the policy|that's the policy|policy is policy|you didn't (?:read|check|follow))\b/;
const HOSTILE = /\b(stupid|useless|idiot\w*|foolish|fool|nonsense|shut up|dumb|rubbish|incompetent|liar|lying|are you deaf|your problem|whatever|if you say so|oh sure|oh really|as if|annoying|ridiculous|waste of time|you are wasting|talk to the hand|how nice|good luck with that)\b/;
const BOUNDARY_BEHAVIOUR = /\b(calling me|called me|call me names|insult\w*|abus\w+|disrespect\w*|name[- ]?calling|language|speak(?:ing)? to me|talk(?:ing)? to me|way you are (?:speaking|talking)|tone|shouting|rude|offensive|those words|words like)\b/;
const BOUNDARY_CONDITION = /\b(if (?:this|the|you|it|we|insults?|abuse|that|there)|so that i can|so i can|i will (?:have to )?(?:pause|end|transfer|stop|hand|need to)|unless|can only continue|continue (?:to )?(?:help|only|once|when|if)|until|otherwise|i am able to continue|i'm able to continue|able to continue)\b/;
const TRANSFER = /\b(transfer\w*|supervisor|segun|hand (?:you|this|the chat) over|pass you (?:on )?to|escalat\w+ (?:this |it )?to (?:my )?(?:supervisor|team lead))\b/;
const SENSITIVE = /\b(card number|cvv|cvc|pin|otp|one[- ]time (?:pass\w*|code)|password|expiry date|card details|bvn)\b/;
const GUARANTEE = /\b(guarantee\w*|i promise|i assure you|100 ?%|for sure|definitely|without fail|surely)\b/;
const OUTCOME_WORDS = /(deliver|arriv|refund|revers|money|compensat|approv|replace|wallet|credit|get your)/;
const UPDATE_WORDS = /\b(update|call|response|feedback|message|email|confirmation|reply|information|notif\w+|hear from)\b/;

function overpromises(caseId, text, facts) {
  const found = [];
  const t = norm(text);
  for (const s of splitSentences(t)) {
    const neg = NEG.test(s);
    const cond = COND.test(s);
    // guarantee words attached to an outcome
    if (!neg && GUARANTEE.test(s) && OUTCOME_WORDS.test(s) && !UPDATE_WORDS.test(s)) found.push('guarantee');
    if (caseId === 'A' && !neg && !cond) {
      const verb = /\b(deliver\w*|arriv\w*|reach\w*|get to you|with you|receiv\w+)\b/.test(s);
      const when = /\b(today|tomorrow|tonight|on (?:mon|tues|wednes|thurs|fri|satur|sun)\w*|by (?:mon|tues|wednes|thurs|fri|satur|sun)\w*|before \w+day|by \d|before the|this (?:evening|afternoon|week)|within (?:a|an|one|two|three|\d+) ?(?:hour|day)s?|in (?:\d+|a|an|two|three) (?:hour|day)s?|next (?:working )?day)\b/.test(s);
      const will = /\b(will|shall|'ll|going to|should|expect\w*|guarantee\w*)\b/.test(s);
      if (verb && when && will && !UPDATE_WORDS.test(s)) found.push('delivery_date');
      if (/\bi(?:'ll| will| shall)\s+(?:now |immediately |go ahead and )?(?:refund|reverse|credit|process (?:your|the) refund)\b|\byour refund will be (?:processed|done|paid|issued)\b|\bwe will refund you\b/.test(s)) found.push('refund');
    }
    if (caseId === 'D' && !neg && !cond) {
      if (/\b(?:will|shall|'ll|should|likely|sure|bound to|confident|expect\w*)\b[^.!?]*\bapprov\w*|\bapprov\w*\b[^.!?]*\b(?:likely|sure|bound|certain|confident)\b|\byou will (?:be (?:compensated|paid)|get|receive) (?:the |full |your |compensation)/.test(s)) found.push('approval');
      const nums = (s.replace(/,/g, '').match(/\d{4,}/g) || []).map(Number).filter((n) => n > 5000);
      if (nums.length && /\b(?:will|shall|'ll)\s+(?:pay|give|credit|refund|compensate|send you)\b/.test(s)) found.push('amount');
    }
  }
  return [...new Set(found)];
}

export function analyse(caseId, text, facts, mem) {
  const t = norm(text);
  const sig = {};
  sig.words = wordCount(t);
  sig.brushOff = sig.words < 4;
  sig.ack = ACK.test(t);
  sig.ackImpact = sig.ack && IMPACT.test(t);
  sig.actionVerb = ACTION_VERB.test(t);
  sig.action = sig.actionVerb && FACT_REF.test(t);
  sig.question = QUESTION.test(t);
  sig.options = OPTIONS.test(t);
  sig.limit = LIMIT.test(t);
  // A learner who apologises for an earlier "read the policy" reply is not dodging.
  sig.blame = splitSentences(t).some((x) => BLAME.test(x) && !/\b(sorry|apolog\w+|regret|was told|were told|told to|you were (?:asked|referred|sent)|earlier|previous|first agent|should not have)\b/.test(x));
  // Quoting the customer's own words while setting a boundary is not hostility.
  sig.hostile = splitSentences(t).some((x) => HOSTILE.test(x) && !/\b(calling me|called me|call me|insult\w*|words like|using words|the word|language|speaking to me)\b/.test(x));
  sig.boundary = BOUNDARY_BEHAVIOUR.test(t) && BOUNDARY_CONDITION.test(t);
  // A conditional warning ("if it continues I will transfer you") is a boundary, not a transfer.
  sig.transfer = splitSentences(t).some((x) => TRANSFER.test(x) && !/\b(if|unless|otherwise|in case)\b|have to|may have|might have|would have to/.test(x));
  sig.sensitive = splitSentences(t).some((s) => SENSITIVE.test(s) && !/\b(never|do not|don't|do not share|not share)\b/.test(s));

  sig.time = extractTime(t);
  const owners = OWNERS.filter(([re]) => re.test(t));
  sig.ownerName = owners.length ? owners[0][1] : '';
  sig.ownerKeys = owners.map((o) => o[2]);
  sig.hasOwner = owners.length > 0 || SELF.test(t);
  sig.commit = COMMIT.test(t);
  sig.nextStep = !!(sig.time && sig.hasOwner && sig.commit);

  sig.overpromise = overpromises(caseId, t, facts);

  // option echoed back by the customer
  const optionFor = {
    A: [[/\btrace|tracing\b/, 'trace'], [/\brefund|cancel\w*/, 'refund']],
    B: [[/\breplac\w+/, 'replacement'], [/\brefund\w*/, 'refund']],
    C: [[/\brevers\w+/, 'reversal'], [/\brefund\w*/, 'refund']],
    D: [[/\breview\w*|\bescalat\w+/, 'review']]
  }[caseId] || [];
  sig.option = { A: 'trace', B: 'replacement', C: 'update', D: 'review' }[caseId] || '';
  for (const [re, name] of optionFor) if (re.test(t)) { sig.option = name; break; }

  // Case-specific evidence (current reply)
  const c = {};
  if (caseId === 'A') {
    c.tracePlus = /\btrace|tracing\b/.test(t) && !!sig.time;
    c.refundRoute = /\b(refund|cancel\w*)\b/.test(t) && (/\bwallet\b/.test(t) || /\b(3|three) working days\b/.test(t) || /\bif\b[^.!?]*\b(cannot|can't|unable|not able|no date|does not|doesn't|not)\b[^.!?]*\b(confirm|date|deliver)/.test(t));
    c.checked = sig.actionVerb && /\b(order|tracking|track|scan|hub|trv\d+|record|system)\b/.test(t);
  }
  if (caseId === 'B') {
    c.evidenceRequested = /\b(photo|photos|picture|pictures|video|videos|image|evidence|proof|clip|footage)\b/.test(t) && (sig.question || /\b(send|share|attach|provide|upload|need|require)\w*\b/.test(t));
    c.remedy = /\b(replac\w+|refund\w*)\b/.test(t) && /\b(2|two|3|three|7|seven) (?:working |business )?days?\b/.test(t);
    c.defect = /\b(fault\w*|defect\w*|stopped (?:working|charging|heating)|not working|damaged|malfunction\w*|does not work|doesn't work|no longer)\b/.test(t);
    c.changeOfMind = splitSentences(t).some((s) => /\b(change of mind|changed your mind|return window|not eligible|outside the (?:return )?policy)\b/.test(s) && !NEG.test(s) && !/\bnot\b/.test(s));
    c.poorContact = /\b(sorry|apolog\w+|regret)\b[^.!?]*\b(polic\w+|earlier|before|first|previous|chat|told|referred|twice|write|wrote|writing)\b|\b(earlier|previous|first)\b[^.!?]*\b(chat|agent|reply|response)\b[^.!?]*\b(sorry|not (?:good|helpful|acceptable)|should not|should have|apolog\w+)/.test(t);
  }
  if (caseId === 'C') {
    c.verified = (sig.actionVerb || /\b(can see|i see)\b/.test(t)) && /\b(debit|debits|charge|charges|transaction|transactions|statement|payment|deduction|twice|two|duplicate|second)\b/.test(t);
    c.paymentsStep = sig.nextStep && /\bpayments?\b|amaka/.test(t);
  }
  if (caseId === 'D') {
    c.clarify = sig.question && /\b(loss|lost|job|claim|amount|how much|proof|evidence|invoice|client|business|compensation|demand|asking|asked)\b/.test(t);
    c.limit = /\b(5,?000|authority|limit\w*|cannot decide|can't decide|not able to (?:approve|decide)|above my|beyond my|outside my|goodwill)\b/.test(t);
    c.correction = /\b(replac\w+|collect\w*|pick ?up|correct item|right item|correct one|right one|send the (?:correct|right)|refund)\b/.test(t);
    c.escalated = /\b(claims reviewer|titilayo|escalat\w+|claims team)\b/.test(t);
  }
  sig.c = c;
  return sig;
}

// =====================================================================
// Slot filling
// =====================================================================

function fillTime(text, time) {
  if (!time) {
    return text
      .replace(/\s+(?:by|until|on)\s+\{time\}/g, '')
      .replace(/,\s*\{time\}\s+then/g, '')
      .replace(/\{time\}/g, '');
  }
  let out = text;
  if (time.kind === 'abs') return out.replace(/\{time\}/g, time.text);
  if (time.kind === 'day') {
    out = out.replace(/\bon\s+\{time\}/g, '{time}');
    return out.replace(/\{time\}/g, time.text);
  }
  // relative: "within 24 hours" reads without a preposition
  out = out.replace(/\b(?:by|until|on)\s+\{time\}/g, '{time}');
  return out.replace(/\{time\}/g, time.text);
}

export function fillLine(text, facts, extra = {}) {
  let out = text;
  const slots = {
    brand: CONFIG.brandName,
    name: facts.customer,
    item: facts.item,
    itemDelivered: facts.itemDelivered,
    orderNo: facts.orderNo,
    amount: facts.amount,
    event: facts.event,
    ordered: facts.ordered,
    city: facts.city,
    lastScan: facts.lastScan,
    delivered: facts.delivered,
    fault: facts.fault,
    job: facts.job,
    demand: facts.demand,
    chargeTime: facts.chargeTime,
    option: extra.option || '',
    owner: extra.owner || ''
  };
  out = fillTime(out, extra.time || null);
  for (const [k, v] of Object.entries(slots)) {
    out = out.split(`{${k}}`).join(v == null ? '' : v);
  }
  // empty-slot clean up
  out = out.replace(/\s+by\s*\./g, '.').replace(/\s{2,}/g, ' ').replace(/\s+([.,])/g, '$1').trim();
  out = out.replace(/\{[a-zA-Z]+\}/g, '').replace(/^\s*([.,]\s*)/, '');
  out = out.replace(/(^|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase());
  return out;
}

export function fillText(text) {
  return String(text).split('{brand}').join(CONFIG.brandName);
}

// =====================================================================
// Trial and case construction
// =====================================================================

function newCaseState(id) {
  return {
    id,
    channel: CASE_META[id].channel,
    status: 'not_started', // not_started | scheduled | open | closed
    openAt: null,
    startedAt: null,
    closedAt: null,
    outcome: null,
    heat: CASE_META[id].startHeat,
    heatHistory: [],
    messages: [],
    customerTurns: 0,
    replies: 0,
    missedInRow: 0,
    totalMissed: 0,
    window: null,
    pending: null,
    draft: { text: '', seq: 0, savedAt: null },
    acknowledged: false,
    signals: [],
    flags: [],
    used: [],
    answered: [],
    mem: {
      checked: false, tracePlus: false, refundRoute: false,
      evidenceRequested: false, evidenceReceived: false, defect: false, remedy: false,
      insultSeen: false, relapseSeen: false, boundaryPending: false, boundaryAt: null,
      verified: false, limit: false, correction: false, escalated: false, clarify: false
    }
  };
}

export function newTrial({ id, learner, trialNo, now }) {
  const cases = {};
  const notes = {};
  for (const c of CASE_ORDER) {
    cases[c] = newCaseState(c);
    notes[c] = { status: 'locked', openedAt: null, deadline: null, completedAt: null, expired: false, fields: {}, seq: 0 };
  }
  return {
    id,
    learnerName: learner.name,
    learnerEmail: learner.email,
    trialNo,
    factSet: trialNo,
    status: 'open',
    version: 1,
    createdAt: now,
    shift: null,
    started: false,
    cases,
    notes,
    resetCount: 0,
    resetAt: null,
    offlineGaps: [],
    lastSeenAt: now,
    processed: [],
    submittedAt: null
  };
}

export function factsFor(trial, caseId) {
  const f = FACTS[caseId][trial.factSet - 1];
  if (caseId === 'C') {
    // before the shift starts nothing is shown, so fall back to the creation time
    const start = trial.shift ? trial.shift.startedAt : trial.createdAt;
    return { ...f, chargeTime: chargeTimeText(f, start, CONFIG.timezone) };
  }
  return f;
}

export function startShift(trial, now) {
  trial.started = true;
  trial.shift = {
    startedAt: now,
    timezone: CONFIG.timezone,
    dateText: fmtDate(now, CONFIG.timezone),
    timeText: fmtTime(now, CONFIG.timezone).toUpperCase().replace(/(AM|PM)/, ' $1') + ' WAT'
  };
  trial.lastSeenAt = now;
  const a = trial.cases.A;
  a.status = 'scheduled';
  a.openAt = now;
  advance(trial, now);
}

// Reset: clear every case, reply, draft and note. Keep the fact set and frozen shift timestamp.
export function resetTrial(trial, now) {
  const fresh = newTrial({ id: trial.id, learner: { name: trial.learnerName, email: trial.learnerEmail }, trialNo: trial.trialNo, now });
  trial.cases = fresh.cases;
  trial.notes = fresh.notes;
  trial.offlineGaps = [];
  trial.processed = [];
  trial.resetCount += 1;
  trial.resetAt = now;
  trial.lastSeenAt = now;
  const a = trial.cases.A;
  a.status = 'scheduled';
  a.openAt = now;
  advance(trial, now);
}

// =====================================================================
// Message and window helpers
// =====================================================================

function windowSeconds(cs) {
  return cs.channel === 'chat' ? CONFIG.chat.replySec : CONFIG.email.replySec;
}
function extendedSeconds(cs) {
  return cs.channel === 'chat' ? CONFIG.chat.extendedSec : CONFIG.email.replySec + CONFIG.email.extendSec;
}
function maxReplies(cs) {
  return cs.channel === 'chat' ? CONFIG.chat.maxReplies : CONFIG.email.maxReplies;
}
function customerDelayMs(cs) {
  return (cs.channel === 'chat' ? CONFIG.chatCustomerDelaySec : CONFIG.nextEmailDelaySec) * SEC;
}

function addFlag(cs, at, flag, detail) {
  cs.flags.push({ at, flag, detail: detail || null });
}

function setHeat(cs, at, heat, reason) {
  cs.heat = Math.max(1, Math.min(5, heat));
  cs.heatHistory.push({ at, heat: cs.heat, reason });
}

function subjectFor(caseId, facts, kind, cs) {
  if (cs.channel !== 'email') return null;
  const s = SUBJECTS[caseId];
  const fill = (x) => x.split('{item}').join(facts.item || '');
  if (kind === 'opener') return fill(s.opener);
  if (kind === 'chaser' && cs.missedInRow === 1) return s.chaser1;
  return fill(s.reply);
}

function pushCustomer(cs, { at, text, kind, subject, lineId }) {
  const id = `${cs.id}-m${cs.messages.length + 1}`;
  cs.messages.push({ id, from: 'customer', at, text, kind, subject: subject || null, lineId: lineId || null });
  if (kind !== 'chaser') cs.customerTurns += 1;
  return id;
}

function openWindow(cs, at) {
  cs.window = { openedAt: at, deadline: at + windowSeconds(cs) * SEC, extended: false, firstTypedAt: null };
}

function closeCase(trial, cs, outcome, at) {
  cs.status = 'closed';
  cs.outcome = outcome;
  cs.closedAt = at;
  cs.window = null;
  cs.pending = null;
  trial.notes[cs.id].status = 'available';
  // Scenario triggers tied to closure
  if (cs.id === 'A') {
    const c = trial.cases.C;
    if (c.status === 'not_started') { c.status = 'scheduled'; c.openAt = at + CONFIG.chatCustomerDelaySec * SEC; }
    const b = trial.cases.B;
    if (b.status === 'not_started') { b.status = 'scheduled'; b.openAt = at + CONFIG.nextEmailDelaySec * SEC; }
  }
  if (cs.id === 'C') {
    const d = trial.cases.D;
    if (d.status === 'not_started') { d.status = 'scheduled'; d.openAt = at + CONFIG.nextEmailDelaySec * SEC; }
  }
}

function openCase(trial, cs, at, windowStart) {
  const facts = factsFor(trial, cs.id);
  cs.status = 'open';
  cs.startedAt = at;
  cs.openAt = null;
  const text = fillLine(LINES[cs.id].opener, facts);
  pushCustomer(cs, { at, text, kind: 'opener', subject: subjectFor(cs.id, facts, 'opener', cs), lineId: 'opener' });
  cs.heatHistory.push({ at, heat: cs.heat, reason: 'opener' });
  openWindow(cs, windowStart ?? at);
}

function deliverPending(trial, cs, windowStart) {
  const p = cs.pending;
  cs.pending = null;
  const facts = factsFor(trial, cs.id);
  pushCustomer(cs, { at: p.dueAt, text: p.text, kind: p.kind, subject: subjectFor(cs.id, facts, p.kind, cs), lineId: p.lineId });
  if (p.setEvidence) cs.mem.evidenceReceived = true;
  if (p.closeOutcome) {
    closeCase(trial, cs, p.closeOutcome, p.dueAt);
  } else {
    openWindow(cs, windowStart ?? p.dueAt);
  }
}

// =====================================================================
// Timer processing
// =====================================================================

function nextEvent(trial, until) {
  let best = null;
  const consider = (t, type, caseId) => {
    if (t <= until && (!best || t < best.t)) best = { t, type, caseId };
  };
  for (const id of CASE_ORDER) {
    const cs = trial.cases[id];
    if (cs.status === 'scheduled') consider(cs.openAt, 'open', id);
    if (cs.pending) consider(cs.pending.dueAt, 'deliver', id);
    if (cs.status === 'open' && cs.window && !cs.pending) consider(cs.window.deadline, 'expire', id);
    const n = trial.notes[id];
    if (n.status === 'open') consider(n.deadline, 'noteExpire', id);
  }
  return best;
}

function handleExpire(trial, cs, at, { offline = false } = {}) {
  const w = cs.window;
  // One extension if typing had started before the deadline
  if (!offline && !w.extended && w.firstTypedAt && w.firstTypedAt <= w.deadline) {
    w.extended = true;
    w.deadline = w.openedAt + extendedSeconds(cs) * SEC;
    addFlag(cs, at, 'window_extended');
    return;
  }
  missWindow(trial, cs, at, { offline });
}

function missWindow(trial, cs, at, { offline = false } = {}) {
  const facts = factsFor(trial, cs.id);
  const lines = LINES[cs.id];
  cs.totalMissed += 1;
  if (offline) {
    // Offline time counts as at most one missed window and never closes the case.
    cs.missedInRow = Math.min(cs.missedInRow + 1, CONFIG.missedToClose - 1);
  } else {
    cs.missedInRow += 1;
  }
  setHeat(cs, at, cs.heat + 1, 'missed_window');
  addFlag(cs, at, 'missed_window', offline ? 'offline' : null);
  if (cs.missedInRow >= CONFIG.missedToClose) {
    pushCustomer(cs, { at, text: fillLine(lines.close, facts), kind: 'close', subject: subjectFor(cs.id, facts, 'close', cs), lineId: 'close' });
    closeCase(trial, cs, 'unresolved', at);
    return;
  }
  const idx = Math.min(cs.missedInRow, lines.chasers.length) - 1;
  pushCustomer(cs, { at, text: fillLine(lines.chasers[idx], facts), kind: 'chaser', subject: subjectFor(cs.id, facts, 'chaser', cs), lineId: `chaser${idx + 1}` });
  openWindow(cs, offline ? at : at);
}

function applyEvent(trial, event, opts = {}) {
  const cs = trial.cases[event.caseId];
  switch (event.type) {
    case 'open': openCase(trial, cs, event.t, opts.windowStart); break;
    case 'deliver': deliverPending(trial, cs, opts.windowStart); break;
    case 'expire': handleExpire(trial, cs, event.t); break;
    case 'noteExpire': {
      const n = trial.notes[event.caseId];
      n.status = 'done';
      n.expired = true;
      n.completedAt = n.deadline;
      break;
    }
  }
}

function runUntil(trial, until) {
  let guard = 0;
  let ev;
  while ((ev = nextEvent(trial, until)) && guard++ < 500) applyEvent(trial, ev);
}

// Advance the trial clock. Handles offline gaps as well as ordinary expiries.
export function advance(trial, now) {
  if (!trial.started || trial.status !== 'open') return;
  const threshold = CONFIG.offlineGapThresholdSec * SEC;
  const gapStart = trial.lastSeenAt;
  if (now - gapStart > threshold) {
    const cutoff = gapStart + threshold;
    runUntil(trial, cutoff);
    trial.offlineGaps.push({ from: gapStart, to: now, seconds: Math.round((now - gapStart) / SEC) });
    // 1. Windows that expired while away: one miss at most per case, never closing.
    for (const id of CASE_ORDER) {
      const cs = trial.cases[id];
      if (cs.status === 'open' && cs.window && !cs.pending && cs.window.deadline <= now) {
        addFlag(cs, now, 'offline_gap', `${Math.round((now - gapStart) / SEC)}s`);
        missWindow(trial, cs, now, { offline: true });
      }
    }
    // 2. Deliveries and arrivals that came due while away appear now, with fresh windows.
    let guard = 0;
    let ev;
    while ((ev = nextEventNoExpiry(trial, now)) && guard++ < 200) applyEvent(trial, ev, { windowStart: now });
    // 3. Notes carry on against the server clock.
    for (const id of CASE_ORDER) {
      const n = trial.notes[id];
      if (n.status === 'open' && n.deadline <= now) { n.status = 'done'; n.expired = true; n.completedAt = n.deadline; }
    }
  } else {
    runUntil(trial, now);
  }
}

function nextEventNoExpiry(trial, until) {
  let best = null;
  for (const id of CASE_ORDER) {
    const cs = trial.cases[id];
    if (cs.status === 'scheduled' && cs.openAt <= until && (!best || cs.openAt < best.t)) best = { t: cs.openAt, type: 'open', caseId: id };
    if (cs.pending && cs.pending.dueAt <= until && (!best || cs.pending.dueAt < best.t)) best = { t: cs.pending.dueAt, type: 'deliver', caseId: id };
  }
  return best;
}

// =====================================================================
// Drafts and replies
// =====================================================================

export function saveDraft(trial, caseId, text, seq, now) {
  const cs = trial.cases[caseId];
  if (!cs || cs.status !== 'open' || cs.pending) return { ok: false, code: 'not_open' };
  if (seq != null && seq <= cs.draft.seq) return { ok: true, ignored: true };
  const clean = String(text || '').slice(0, CONFIG.maxMessageChars);
  cs.draft = { text: clean, seq: seq ?? cs.draft.seq + 1, savedAt: now };
  if (cs.window) {
    if (clean.trim() && !cs.window.firstTypedAt) cs.window.firstTypedAt = now;
    if (!clean.trim()) cs.window.firstTypedAt = null;
  }
  return { ok: true };
}

function pickLine(cs, key, variants, facts) {
  // variants is an array of strings. Returns {id,text} not yet used in this case, or null.
  for (let i = 0; i < variants.length; i++) {
    const id = `${key}${String.fromCharCode(97 + i)}`;
    if (!cs.used.includes(id)) return { id, text: variants[i] };
  }
  return null;
}

function pickHeatLine(cs, lines, heat) {
  const order = [heat, heat - 1, heat + 1, heat - 2, heat + 2].filter((h) => h >= 1 && h <= 5);
  for (const h of order) {
    const v = pickLine(cs, `heat${h}`, lines.heat[h] || [], null);
    if (v) return v;
  }
  return null;
}

const ANSWER_PATTERNS = {
  A: {
    orderNo: /\b(order (?:number|no|id|ref\w*)|reference|trv)\b/,
    ordered: /\b(when (?:did you|was it) (?:order|place)|date (?:of|you) (?:order|place)|ordered)\b/,
    payment: /\b(pay|paid|payment|wallet|how did you)\b/,
    tracking: /\b(track\w*|scan\w*|where is|status|hub)\b/,
    outcome: /\bwhat (?:do you|would you|outcome|result)\b.*\b(want|like|expect|prefer)|\bwhat (?:are you|would be) (?:looking|expecting)|\b(your|the) (?:preferred|expected) (?:outcome|resolution)\b|\bwant me to\b|\bhow (?:can|may) i help\b/,
    city: /\b(city|which city|where are you|your location|located|deliver(?:y)? (?:to|address))\b/
  },
  B: {
    orderNo: /\b(order (?:number|no|id|ref\w*)|reference)\b/,
    evidence: /\b(photo|photos|picture|pictures|video|videos|image|evidence|proof|clip|footage)\b/,
    delivered: /\b(when (?:was it|did it|did you|were you)\b.*\b(deliver|receiv)\w*|delivery date|date (?:of delivery|you received))\b/,
    outcome: /\bwhat (?:would you|do you|outcome)\b.*\b(like|want|prefer|expect)|\breplacement or (?:a )?refund\b|\brefund or (?:a )?replacement\b|\bprefer\w*\b/,
    earlierChat: /\b(what did the (?:agent|first|previous)|earlier chat|previous (?:chat|agent|conversation)|first agent|who told|what (?:were you|was) told)\b/
  },
  C: {
    orderNo: /\b(order (?:number|no|id|ref\w*)|reference)\b/,
    time: /\b(what time|which time|when (?:were|was|did)|time of|charged at)\b/,
    status: /\b(completed|pending|status|successful|reversed)\b/,
    payment: /\b(how did you pay|payment method|paid with|which (?:card|wallet|account)|pay with)\b/,
    outcome: /\bwhat (?:do you|would you|outcome)\b.*\b(want|like|expect|prefer)|\bwant me to\b|\bhow (?:can|may) i help\b/
  },
  D: {
    proof: /\b(proof|evidence|invoice|document\w*|cancellation|message from (?:the |your )?client|screenshot)\b/,
    delivered: /\b(what (?:did you|was) (?:receive|delivered)|which item (?:did you|was)|what arrived|what was delivered)\b/,
    orderNo: /\b(order (?:number|no|id|ref\w*)|reference)\b/,
    outcome: /\bwhat (?:do you|would you|outcome|result)\b.*\b(want|like|expect|prefer)|\bwhat (?:are you|would be) (?:looking|expecting)|\bhow much (?:are you|do you)\b|\bamount (?:are you|you)\b/,
    job: /\b(what (?:was|is) the (?:job|work)|tell me (?:more )?about (?:the )?(?:job|loss)|which job|what job|nature of (?:the )?(?:job|loss))\b/
  }
};

// Evaluate acceptance conditions that depend on the case.
function caseConditionsMet(caseId, cs, sig) {
  const m = cs.mem;
  switch (caseId) {
    case 'A': return m.checked && m.tracePlus && m.refundRoute && !sig.overpromise.includes('delivery_date');
    case 'B': return (m.evidenceRequested || m.evidenceReceived) && m.defect && m.remedy && !sig.c.changeOfMind;
    case 'C': return cs.mem.relapseSeen && m.verified && sig.c.paymentsStep;
    case 'D': return m.escalated && m.limit && m.correction && !!sig.time && !sig.overpromise.includes('approval') && !sig.overpromise.includes('amount');
  }
  return false;
}

function updateMemory(caseId, cs, sig) {
  const m = cs.mem;
  const c = sig.c;
  if (caseId === 'A') {
    if (c.checked) m.checked = true;
    if (c.tracePlus) m.tracePlus = true;
    if (c.refundRoute) m.refundRoute = true;
  }
  if (caseId === 'B') {
    if (c.evidenceRequested) m.evidenceRequested = true;
    if (c.defect) m.defect = true;
    if (c.remedy) m.remedy = true;
  }
  if (caseId === 'C') {
    if (c.verified) m.verified = true;
  }
  if (caseId === 'D') {
    if (c.clarify) m.clarify = true;
    if (c.limit) m.limit = true;
    if (c.correction) m.correction = true;
    if (c.escalated) m.escalated = true;
  }
}

function signalNames(sig, caseId) {
  const names = [];
  if (sig.ack) names.push(sig.ackImpact ? 'acknowledgement_with_impact' : 'acknowledgement');
  if (sig.action) names.push('action_with_fact');
  else if (sig.actionVerb) names.push('action_no_fact');
  if (sig.question) names.push('question');
  if (sig.options) names.push('options');
  if (sig.limit) names.push('limit_stated');
  if (sig.nextStep) names.push('next_step_action_owner_time');
  else if (sig.time) names.push('time_only');
  if (sig.blame) names.push('blame_or_policy_dodge');
  if (sig.hostile) names.push('hostility');
  if (sig.brushOff) names.push('brush_off');
  for (const o of sig.overpromise) names.push(`overpromise_${o}`);
  if (sig.boundary) names.push('boundary');
  if (sig.transfer) names.push('transfer');
  if (sig.sensitive) names.push('asked_sensitive_payment_detail');
  const c = sig.c || {};
  if (c.tracePlus) names.push('trace_with_update_time');
  if (c.refundRoute) names.push('refund_route_explained');
  if (c.evidenceRequested) names.push('evidence_requested');
  if (c.remedy) names.push('remedy_with_timeline');
  if (c.defect) names.push('treated_as_defect');
  if (c.changeOfMind) names.push('applied_change_of_mind_rule');
  if (c.poorContact) names.push('recognised_earlier_poor_contact');
  if (c.verified) names.push('verified_debits');
  if (c.paymentsStep) names.push('payments_next_step');
  if (c.clarify) names.push('clarified_loss_or_amount');
  if (c.limit) names.push('authority_limit_stated');
  if (c.correction) names.push('correction_arranged');
  if (c.escalated) names.push('escalated_to_claims');
  return names;
}

export function submitReply(trial, caseId, text, now, { subject, staleView } = {}) {
  const cs = trial.cases[caseId];
  const facts = factsFor(trial, caseId);
  const lines = LINES[caseId];
  const clean = String(text || '').slice(0, CONFIG.maxMessageChars);

  const w = cs.window;
  const agentMsg = {
    id: `${cs.id}-m${cs.messages.length + 1}`,
    from: 'agent',
    at: now,
    text: clean,
    subject: subject || null,
    latencyMs: w ? now - w.openedAt : null,
    staleView: !!staleView
  };
  cs.messages.push(agentMsg);
  cs.replies += 1;
  cs.missedInRow = 0;
  cs.window = null;
  cs.draft = { text: '', seq: cs.draft.seq, savedAt: now };

  // --- analyse ---
  const sig = analyse(caseId, clean, facts, cs.mem);
  const turnBefore = cs.customerTurns;
  const customerTurn = turnBefore + 1; // the turn about to be written

  updateMemory(caseId, cs, sig);
  if (sig.ack) cs.acknowledged = true;
  if (sig.sensitive) addFlag(cs, now, 'asked_sensitive_payment_detail');
  for (const o of sig.overpromise) addFlag(cs, now, `overpromise_${o}`, clean.slice(0, 160));
  if (sig.hostile) addFlag(cs, now, 'learner_hostility');
  if (sig.blame) addFlag(cs, now, 'blame_or_policy_dodge');
  if (sig.brushOff) addFlag(cs, now, 'brush_off');
  if (caseId === 'B' && sig.c.changeOfMind) addFlag(cs, now, 'applied_change_of_mind_rule');
  if (staleView) addFlag(cs, now, 'sent_from_stale_view');

  // Scenario triggers: first reply in A triggers B; first reply in C triggers D.
  if (cs.replies === 1) {
    const trig = caseId === 'A' ? 'B' : caseId === 'C' ? 'D' : null;
    if (trig && trial.cases[trig].status === 'not_started') {
      trial.cases[trig].status = 'scheduled';
      trial.cases[trig].openAt = now + CONFIG.nextEmailDelaySec * SEC;
    }
  }

  // --- case C bookkeeping before the customer responds ---
  let boundaryAfterInsult = false;
  if (caseId === 'C') {
    if (sig.boundary) {
      boundaryAfterInsult = cs.mem.insultSeen;
      cs.mem.boundaryPending = true;
      cs.mem.boundaryAt = cs.replies;
      if (!cs.mem.insultSeen) addFlag(cs, now, 'boundary_before_first_insult');
    }
  }

  // --- heat ---
  let delta = 1; // each stage adds one point
  const reasons = ['stage'];
  if (sig.ack) { delta -= 1; reasons.push('ack'); }
  if (sig.action) { delta -= 1; reasons.push('action'); }
  const neg = Math.min(2, (sig.blame ? 1 : 0) + (sig.hostile ? 1 : 0) + (sig.brushOff ? 1 : 0));
  if (neg) { delta += neg; reasons.push(`negative+${neg}`); }
  if (caseId === 'C' && sig.boundary) { delta -= 1; reasons.push('boundary'); }
  setHeat(cs, now, cs.heat + delta, reasons.join(','));

  // --- C: transfer ---
  let outcome = null; // 'resolved' | 'transferred' | 'unresolved'
  let line = null;
  let lineId = null;
  const extra = { time: sig.time, option: sig.option, owner: sig.ownerName };

  if (caseId === 'C' && sig.transfer && cs.mem.insultSeen) {
    if (!cs.mem.relapseSeen) addFlag(cs, now, 'transfer_before_relapse');
    outcome = 'transferred';
    line = lines.transferAccept;
    lineId = 'transferAccept';
  }

  // --- fixed turns in C ---
  if (!outcome && caseId === 'C') {
    if (customerTurn === 2) {
      const variant = trial.factSet % 2 === 1 ? 0 : 1;
      line = lines.insult2[variant];
      lineId = `insult2${'ab'[variant]}`;
      cs.mem.insultSeen = true;
    } else if (customerTurn === 4) {
      const variant = trial.factSet % 2 === 1 ? 1 : 0;
      line = lines.relapse4[variant];
      lineId = `relapse4${'ab'[variant]}`;
      cs.mem.relapseSeen = true;
    }
  }

  // --- acceptance ---
  const replyCap = cs.replies >= maxReplies(cs);
  const accepted = !outcome && !line && sig.nextStep && cs.acknowledged && cs.heat <= 3 && caseConditionsMet(caseId, cs, sig);

  if (accepted) {
    outcome = 'resolved';
    line = cs.heat <= 2 ? lines.full : lines.grudging;
    lineId = cs.heat <= 2 ? 'full' : 'grudging';
  }

  // --- reply cap: the customer leaves unresolved ---
  if (!outcome && replyCap) {
    outcome = 'unresolved';
    line = lines.close;
    lineId = 'close';
    addFlag(cs, now, 'reply_cap_reached');
  }

  // --- overpromise: the customer takes it at face value and the case continues ---
  if (!outcome && !line && sig.overpromise.length && sig.time) {
    line = lines.promise;
    lineId = 'promise';
  }

  // --- rejection of a stated remedy ---
  if (!outcome && !line && sig.nextStep && (caseId !== 'C' || cs.mem.relapseSeen)) {
    const first = rejectionIndex(caseId, cs, sig, clean);
    for (const which of [first, 1 - first]) {
      const key = `rejected${which}`;
      if (!cs.used.includes(key)) {
        line = lines.rejected[which];
        lineId = key;
        cs.used.push(key);
        break;
      }
    }
  }

  // --- C: post-boundary bank (the next response after a boundary) ---
  if (!outcome && !line && caseId === 'C' && cs.mem.boundaryPending) {
    const v = pickLine(cs, 'afterBoundary', lines.afterBoundary);
    if (v) {
      line = v.text; lineId = v.id; cs.used.push(v.id);
      cs.mem.boundaryPending = false;
    }
  }

  // --- factual answers from the case record ---
  let setEvidence = false;
  if (!outcome && !line && sig.question) {
    const answers = collectAnswers(caseId, cs, clean);
    if (answers.length) {
      const picked = answers.slice(0, 2);
      line = picked.map((a) => lines.answers[a]).join(' ');
      lineId = picked.map((a) => `answer:${a}`).join('+');
      for (const a of picked) {
        cs.answered.push(a);
        if (caseId === 'B' && a === 'evidence') setEvidence = true;
      }
    }
  }

  // --- heat line ---
  if (!outcome && !line) {
    const v = pickHeatLine(cs, lines, cs.heat);
    if (v) { line = v.text; lineId = v.id; cs.used.push(v.id); }
    else { line = lines.fallback; lineId = 'fallback'; }
  }

  const finalText = fillLine(line, facts, extra);
  cs.pending = {
    dueAt: now + customerDelayMs(cs),
    text: finalText,
    kind: outcome === 'unresolved' ? 'close' : outcome ? 'accept' : 'reply',
    lineId,
    closeOutcome: outcome,
    setEvidence
  };
  recordSignals(cs, now, sig, caseId, { outcome, lineId, boundaryAfterInsult });
}

function rejectionIndex(caseId, cs, sig, text) {
  const t = norm(text);
  switch (caseId) {
    case 'A': return cs.mem.checked ? 1 : 0;
    case 'B': return (sig.c.changeOfMind || sig.blame || /\b(polic\w+|rule\w*|window)\b/.test(t)) ? 0 : 1;
    case 'C': return /\b(process|processes|steps?|working days?|policy|procedure)\b/.test(t) ? 0 : 1;
    case 'D': return /\b(credit|goodwill|5,?000|limit|authority)\b/.test(t) ? 0 : 1;
  }
  return 0;
}

function collectAnswers(caseId, cs, text) {
  const pats = ANSWER_PATTERNS[caseId];
  const t = norm(text);
  const out = [];
  for (const [key, re] of Object.entries(pats)) {
    if (cs.answered.includes(key)) continue;
    if (re.test(t)) out.push(key);
  }
  return out;
}

function recordSignals(cs, at, sig, caseId, extra) {
  cs.signals.push({
    reply: cs.replies,
    at,
    signals: signalNames(sig, caseId),
    heatAfter: cs.heat,
    time: sig.time ? sig.time.text : null,
    owner: sig.ownerKeys,
    customerLine: extra.lineId,
    outcome: extra.outcome || null,
    boundaryAfterInsult: !!extra.boundaryAfterInsult
  });
}

// =====================================================================
// Notes
// =====================================================================

export function noteTemplate(trial, caseId, now) {
  const f = factsFor(trial, caseId);
  return {
    caseId,
    channel: CASE_META[caseId].channel === 'chat' ? 'Live chat' : 'Email',
    caseRef: `Case ${caseId} · ${f.orderNo}`,
    time: `${fmtTime(now, CONFIG.timezone).toUpperCase().replace(/(AM|PM)/, ' $1')} WAT`
  };
}

export function openNote(trial, caseId, now) {
  const n = trial.notes[caseId];
  const cs = trial.cases[caseId];
  if (cs.status !== 'closed') return { ok: false, code: 'case_open' };
  if (n.status === 'open' || n.status === 'done') return { ok: true };
  n.status = 'open';
  n.openedAt = now;
  n.deadline = now + CONFIG.noteSec * SEC;
  n.prefill = noteTemplate(trial, caseId, now);
  return { ok: true };
}

export function saveNote(trial, caseId, fields, seq, now) {
  const n = trial.notes[caseId];
  if (n.status !== 'open') return { ok: false, code: 'note_not_open' };
  if (seq != null && seq <= n.seq) return { ok: true, ignored: true };
  const clean = {};
  for (const f of NOTE_FIELDS) clean[f.n] = String((fields && (fields[f.n] ?? fields[String(f.n)])) || '').slice(0, 2000);
  n.fields = clean;
  n.seq = seq ?? n.seq + 1;
  n.savedAt = now;
  return { ok: true };
}

export function submitNote(trial, caseId, now) {
  const n = trial.notes[caseId];
  if (n.status !== 'open') return { ok: false, code: 'note_not_open' };
  n.status = 'done';
  n.completedAt = now;
  return { ok: true };
}

export function allDone(trial) {
  return CASE_ORDER.every((id) => trial.cases[id].status === 'closed' && trial.notes[id].status === 'done');
}

export { CASE_ORDER, CASE_META, buildRecord };
