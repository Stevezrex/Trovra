// Merges downloaded trial records (JSON) into one CSV for marking. One row per trial and case.
// Usage:  node merge.mjs <folder-with-json> [out.csv]
// Learner messages are copied exactly as stored. Nothing here edits, trims or rewrites them.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FACTS, CASE_ORDER, CASE_META, fmtDate, fmtTime } from './netlify/functions/cases.mjs';
import { NOTE_FIELDS } from './netlify/functions/static.mjs';
import { factsFor } from './netlify/functions/engine.mjs';

const TZ = 'Africa/Lagos';
const wat = (ms) => (ms ? `${fmtDate(ms, TZ)}, ${fmtTime(ms, TZ)} WAT` : '');
const mmss = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

export const COLUMNS = [
  'trial_id', 'learner_name', 'learner_email', 'trial_no', 'fact_set', 'trial_status',
  'shift_started_wat', 'submitted_wat', 'reset_count', 'reset_wat', 'offline_gaps',
  'case_id', 'channel', 'customer', 'case_outcome', 'final_heat', 'missed_windows', 'learner_replies',
  'flags', 'signals', 'heat_history', 'transcript', 'case_facts',
  'note_status', 'note_time_expired', ...NOTE_FIELDS.map((f) => `note_${f.n}`)
];

function transcript(cs, start) {
  return cs.messages.map((m) => {
    const t = `[${fmtTime(m.at, TZ)}]`;
    if (m.from === 'agent') {
      const lat = m.latencyMs != null ? ` (after ${Math.round(m.latencyMs / 1000)}s)` : '';
      const subj = m.subject ? `\n   Subject: ${m.subject}` : '';
      return `${t} AGENT${lat}:${subj}\n${m.text}`;
    }
    const tag = m.kind === 'chaser' ? ' (chaser after missed window)' : m.kind === 'close' ? ' (customer closes)' : '';
    const subj = m.subject ? `\n   Subject: ${m.subject}` : '';
    return `${t} CUSTOMER${tag}:${subj}\n${m.text}`;
  }).join('\n\n');
}

function signalsText(cs) {
  return cs.signals.map((s) => `Reply ${s.reply}: ${s.signals.join(', ') || '(none)'}${s.time ? ` | time given: ${s.time}` : ''} | heat after: ${s.heatAfter} | customer line: ${s.customerLine}${s.outcome ? ` | outcome: ${s.outcome}` : ''}`).join('\n');
}

function heatText(cs, start) {
  return cs.heatHistory.map((h) => `${mmss(h.at - start)} heat ${h.heat} (${h.reason})`).join('\n');
}

function factsText(caseId, facts) {
  const skip = new Set(['amountNum', 'priceNum', 'demandNum', 'orderedDays', 'scanDays', 'deliveredDays', 'hub', 'chargeMinsBefore']);
  return Object.entries(facts).filter(([k]) => !skip.has(k)).map(([k, v]) => `${k}: ${v}`).join('\n');
}

export function flatten(trial) {
  const rows = [];
  for (const id of CASE_ORDER) {
    const cs = trial.cases[id];
    const note = trial.notes[id];
    const start = cs.startedAt || (trial.shift ? trial.shift.startedAt : 0);
    const row = {
      trial_id: trial.id,
      learner_name: trial.learnerName,
      learner_email: trial.learnerEmail,
      trial_no: trial.trialNo,
      fact_set: trial.factSet,
      trial_status: trial.status,
      shift_started_wat: trial.shift ? wat(trial.shift.startedAt) : '',
      submitted_wat: trial.submittedAt ? wat(trial.submittedAt) : '',
      reset_count: trial.resetCount,
      reset_wat: trial.resetAt ? wat(trial.resetAt) : '',
      offline_gaps: trial.offlineGaps.length ? trial.offlineGaps.map((g) => `${wat(g.from)} to ${wat(g.to)} (${g.seconds}s)`).join('; ') : '',
      case_id: id,
      channel: CASE_META[id].channel === 'chat' ? 'Live chat' : 'Email',
      customer: factsFor(trial, id).customer,
      case_outcome: cs.outcome || (cs.status === 'not_started' ? 'not reached' : 'open'),
      final_heat: cs.heat,
      missed_windows: cs.totalMissed,
      learner_replies: cs.replies,
      flags: cs.flags.map((f) => `${mmss(f.at - start)} ${f.flag}${f.detail ? ` (${f.detail})` : ''}`).join('\n'),
      signals: signalsText(cs),
      heat_history: heatText(cs, start),
      transcript: transcript(cs, start),
      case_facts: factsText(id, factsFor(trial, id)),
      note_status: note.status === 'done' ? 'completed' : note.status,
      note_time_expired: note.expired ? 'yes' : 'no'
    };
    for (const f of NOTE_FIELDS) row[`note_${f.n}`] = (note.fields && note.fields[f.n]) || '';
    rows.push(row);
  }
  return rows;
}

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows) {
  return [COLUMNS.join(','), ...rows.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(','))].join('\r\n') + '\r\n';
}

if (process.argv[1] && process.argv[1].endsWith('merge.mjs')) {
  const dir = process.argv[2];
  const out = process.argv[3] || 'trials_merged.csv';
  if (!dir) { console.error('Usage: node merge.mjs <folder-with-json> [out.csv]'); process.exit(1); }
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  const trials = files.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
  trials.sort((a, b) => a.learnerEmail.localeCompare(b.learnerEmail) || a.trialNo - b.trialNo);
  const rows = trials.flatMap(flatten);
  writeFileSync(out, '﻿' + toCsv(rows), 'utf8');
  console.log(`Merged ${trials.length} trial(s) into ${rows.length} row(s): ${out}`);
}
