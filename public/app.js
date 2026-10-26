// Trovra support desk simulation: browser client.
// The server runs the simulation. This file only shows state and sends learner actions.

const TOKEN_KEY = 'trovra.token';
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const S = {
  token: null,
  brand: 'Support desk',
  tz: 'Africa/Lagos',
  menu: null,
  view: null,
  ref: null,
  offset: 0,
  pollSec: 4,
  screen: 'boot',
  ui: { filter: 'all', selected: null, ws: 'queue', ctxOpen: true, summaryOpen: false },
  drafts: {},
  noteDrafts: {},
  seen: {},
  sending: {},
  reqIds: {},
  saveSeq: 0,
  blocked: false,
  pollTimer: null,
  lastPoll: 0,
  prevCases: null,
  convoKey: null,
  saveTimers: {},
  status: {}
};

const store = {
  get() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set(v) { try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ } }
};

// ---------- icons ----------
const ICONS = {
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  mail: '<path d="M3 6h18v12H3z"/><path d="M3 7l9 7 9-7"/>',
  inbox: '<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 3h6l1-3h5"/>',
  live: '<circle cx="12" cy="12" r="3"/><path d="M6 6a8 8 0 000 12M18 6a8 8 0 010 12"/>',
  team: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-4 3-6 6.500-6s6.500 2 6.500 6"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c3 0 4.500 1.500 4.500 4"/>',
  book: '<path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3z"/><path d="M5 17a3 3 0 013-3h11"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.500l3 3 5-6"/>',
  arrow: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8M13 8l4 4-4 4"/>',
  x: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
  open: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.500" fill="currentColor"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.600 5.600l2.100 2.100M16.300 16.300l2.100 2.100M5.600 18.400l2.100-2.100M16.300 7.700l2.100-2.100"/>',
  chart: '<path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3"/>',
  note: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h7"/>'
};
const ic = (n) => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;

// ---------- time helpers ----------
const nowMs = () => Date.now() + S.offset;
const fmtClock = (ms) => new Intl.DateTimeFormat('en-GB', { timeZone: S.tz, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(ms));
const fmtStamp = (ms) => new Intl.DateTimeFormat('en-GB', { timeZone: S.tz, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(ms));
const fmtCountdown = (ms) => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
const initials = (name) => name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
function setHtml(el, html) {
  if (el.dataset.h === html) return false;
  const sc = el.scrollTop;
  el.innerHTML = html;
  el.dataset.h = html;
  el.scrollTop = sc;
  return true;
}
const monoSeq = () => (S.saveSeq = Math.max(S.saveSeq + 1, Date.now()));

// ---------- API ----------
async function api(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(S.token ? { authorization: `Bearer ${S.token}` } : {}) },
    body: method === 'GET' ? undefined : JSON.stringify(body || {})
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty */ }
  if (res.status === 409 && data.error === 'session_moved') { sessionMoved(); }
  else if (res.status === 401) { localSignOut(); }
  return { status: res.status, data };
}

// ---------- boot ----------
let booted = false;

function setAppH() {
  const h = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
  document.documentElement.style.setProperty('--app-h', `${Math.round(h)}px`);
}
window.addEventListener('resize', setAppH);
if (window.visualViewport) window.visualViewport.addEventListener('resize', setAppH);
setAppH();

async function boot() {
  if (booted) return;
  booted = true;
  S.token = store.get();
  if (!S.token) return showSignIn();
  try {
    const r = await api('GET', '/state');
    if (r.status === 200) {
      S.menu = r.data.menu || S.menu;
      if (r.data.view) { await loadReference(); enterTrial(r.data.view); }
      else { const m = await api('GET', '/menu'); S.menu = m.data.menu; S.brand = m.data.brand || S.brand; showMenu(); }
    } else if (S.screen === 'boot') showSignIn();
  } catch {
    showSignIn('Cannot reach the server. Check your connection and try again.');
  }
}

function setTitle() { document.title = S.screen === 'console' ? `${S.brand} support desk` : `${S.brand} support desk simulation`; }

// ---------- sign in ----------
function showSignIn(msg = '') {
  stopPolling();
  S.screen = 'signin';
  S.token = null; store.set(null);
  setTitle();
  $('#app').innerHTML = `
    <div class="page">
      <aside class="brand-panel">
        <div class="brand-mark"><span class="dot"></span><span>${esc(S.brand)}</span></div>
        <div><h2>Support desk simulation</h2><p>Week 7: difficult customers and conflict resolution.</p></div>
      </aside>
      <main class="page-main"><form class="panel" id="signin" novalidate>
        <h1>Sign in</h1>
        <p class="lead">Use the same name and email address every time. You have up to three trials.</p>
        <p class="error" id="err" role="alert">${esc(msg)}</p>
        <label class="field"><span>Full name</span><input id="name" autocomplete="name" required></label>
        <label class="field"><span>Email address</span><input id="email" type="email" autocomplete="email" inputmode="email" required></label>
        <button class="btn btn-primary" type="submit" id="go">Continue</button>
        <p class="notice">Your name, email address and your responses in the simulation are stored for trial tracking and assessment.</p>
      </form></main>
    </div>`;
  $('#signin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#name').value, email = $('#email').value;
    const btn = $('#go'); btn.disabled = true;
    try {
      const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email }) });
      const data = await r.json();
      if (!r.ok) { $('#err').textContent = data.message || 'Could not sign in.'; btn.disabled = false; return; }
      S.token = data.token; store.set(S.token); S.menu = data.menu; S.brand = data.brand || S.brand;
      booted = true;
      // resume straight into an open trial if there is one
      const st = await api('GET', '/state');
      if (st.data && st.data.view) { await loadReference(); enterTrial(st.data.view); } else showMenu();
    } catch {
      $('#err').textContent = 'Cannot reach the server. Check your connection and try again.';
      btn.disabled = false;
    }
  });
}

function localSignOut() {
  stopPolling();
  S.token = null; store.set(null);
  S.view = null; S.prevCases = null; S.convoKey = null; S.drafts = {}; S.noteDrafts = {}; S.ui.selected = null; S.ui.ws = 'queue';
  closeModal();
  if (S.screen !== 'signin') showSignIn('Please sign in again.');
}

async function signOut() {
  try { await api('POST', '/logout'); } catch { /* ignore */ }
  localSignOut();
}

// ---------- menu ----------
function showMenu(note = '') {
  stopPolling();
  S.screen = 'menu';
  setTitle();
  const m = S.menu;
  const rows = [];
  for (let n = 1; n <= m.max; n++) {
    const t = m.trials.find((x) => x.trialNo === n);
    let tag, action = '';
    if (t && t.status === 'submitted') tag = `<span class="tag done">${ic('check')} Submitted ${esc(fmtStamp(t.submittedAt))}</span>`;
    else if (t) { tag = '<span class="tag open">Open</span>'; action = `<button class="btn btn-primary btn-sm" data-act="open">Resume trial ${n}</button>`; }
    else if (m.nextTrialNo === n) { tag = '<span class="tag">Not started</span>'; action = `<button class="btn btn-primary btn-sm" data-act="open">Start trial ${n}</button>`; }
    else tag = '<span class="tag">Not started</span>';
    rows.push(`<li><span><strong>Trial ${n}</strong> &nbsp;${tag}</span>${action}</li>`);
  }
  $('#app').innerHTML = `
    <div class="page">
      <aside class="brand-panel"><div class="brand-mark"><span class="dot"></span><span>${esc(S.brand)}</span></div>
        <div><h2>Support desk simulation</h2><p>Week 7: difficult customers and conflict resolution.</p></div></aside>
      <main class="page-main"><div class="panel">
        <h1>Hello, ${esc(m.learner.name.split(' ')[0])}</h1>
        <p class="lead">Trials used: ${m.used} of ${m.max}. Trials remaining: ${m.remaining}.</p>
        ${note ? `<p class="notice" role="status" style="margin:0 0 16px">${esc(note)}</p>` : ''}
        <ul class="trial-list">${rows.join('')}</ul>
        <div class="row-actions"><button class="btn btn-light" id="out">Sign out</button></div>
      </div></main>
    </div>`;
  $('#out').addEventListener('click', signOut);
  $$('[data-act="open"]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    const r = await api('POST', '/trial/open');
    if (r.status === 200) { await loadReference(); enterTrial(r.data.view); }
    else { b.disabled = false; showMenu(r.data.message || 'Could not open the trial.'); }
  }));
}

async function loadReference() {
  try { const r = await api('GET', '/reference'); if (r.status === 200) S.ref = r.data; } catch { /* retry later */ }
}

// ---------- trial entry ----------
function enterTrial(view) {
  S.prevCases = null; S.convoKey = null; S.drafts = {}; S.noteDrafts = {}; S.seen = {}; S.status = {};
  S.ui.selected = null; S.ui.ws = 'queue'; S.ui.filter = 'all';
  S.brand = view.brand; S.tz = view.timezone; S.pollSec = view.pollSec;
  applyView(view, { initial: true });
  startPolling();
}

function showWelcome(v) {
  S.screen = 'welcome'; setTitle();
  $('#app').innerHTML = `
    <div class="page">
      <aside class="brand-panel"><div class="brand-mark"><span class="dot"></span><span>${esc(S.brand)}</span></div>
        <div><h2>Support desk simulation</h2><p>Week 7: difficult customers and conflict resolution.</p></div></aside>
      <main class="page-main"><div class="panel">
        <h1>Welcome, ${esc(S.menu ? S.menu.learner.name : '')}</h1>
        <p class="lead">Your shift starts when you select Start shift.</p>
        <ul class="facts">
          <li><span>Trial</span><span>${v.trial.trialNo} of 3</span></li>
          <li><span>Date</span><span>${esc(v.trial.todayText)}</span></li>
          <li><span>Shift start time</span><span>Recorded when you start (WAT)</span></li>
        </ul>
        <button class="btn btn-primary" id="start">Start shift</button>
        <p class="notice">Your name, email address and your responses in the simulation are stored for trial tracking and assessment.</p>
      </div></main>
    </div>`;
  $('#start').addEventListener('click', async (e) => {
    e.target.disabled = true;
    const r = await api('POST', '/shift/start');
    if (r.status === 200) { await loadReference(); applyView(r.data.view); } else e.target.disabled = false;
  });
}

function showComplete() {
  S.screen = 'complete'; setTitle();
  $('#app').innerHTML = `
    <div class="page">
      <aside class="brand-panel"><div class="brand-mark"><span class="dot"></span><span>${esc(S.brand)}</span></div></aside>
      <main class="page-main"><div class="panel">
        <h1>Shift complete</h1>
        <p class="lead">All four cases and service recovery notes are finished. Submitting locks this trial. You will not see a score.</p>
        <button class="btn btn-primary" id="submit">Sign out and submit</button>
        <p class="error" id="err" role="alert"></p>
      </div></main>
    </div>`;
  $('#submit').addEventListener('click', async (e) => {
    e.target.disabled = true;
    const r = await api('POST', '/submit');
    if (r.status === 200) {
      stopPolling();
      S.menu = r.data.menu; S.view = null;
      showMenu(`Trial submitted. ${r.data.menu.remaining} trial${r.data.menu.remaining === 1 ? '' : 's'} remaining.`);
    } else { e.target.disabled = false; $('#err').textContent = r.data.message || 'Could not submit.'; }
  });
}

// ---------- polling ----------
function startPolling() {
  stopPolling();
  S.pollTimer = setInterval(poll, S.pollSec * 1000);
  S.tickTimer = setInterval(tickTimers, 250);
}
function stopPolling() { clearInterval(S.pollTimer); clearInterval(S.tickTimer); S.pollTimer = S.tickTimer = null; }
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.view && !S.blocked) poll(); });

async function poll() {
  if (S.blocked || !S.token || !S.view) return;
  if (Date.now() - S.lastPoll < 700) return;
  S.lastPoll = Date.now();
  try {
    const r = await api('GET', '/state');
    if (r.status === 200 && r.data.view) applyView(r.data.view);
  } catch { /* offline: the server records the gap */ }
}

function tickTimers() {
  const t = nowMs();
  let expired = false;
  $$('[data-deadline]').forEach((el) => {
    const d = Number(el.dataset.deadline);
    const left = d - t;
    const label = el.querySelector('.tl') || el;
    label.textContent = fmtCountdown(left);
    el.classList.toggle('low', left <= 20000 && left > 0);
    el.classList.toggle('out', left <= 0);
    if (left <= 0) expired = true;
  });
  if (expired && Date.now() - (S.lastExpiryPoll || 0) > 1500) { S.lastExpiryPoll = Date.now(); S.lastPoll = 0; poll(); }
}

// ---------- applying server state ----------
function applyView(view, { initial = false } = {}) {
  const prev = S.view;
  S.view = view;
  S.offset = view.serverNow - Date.now();
  S.brand = view.brand;
  if (!view.trial.started) { if (S.screen !== 'welcome') showWelcome(view); return; }
  if (view.trial.allDone) { stopPolling(); showComplete(); return; }
  if (S.screen !== 'console') { buildConsole(); if (S.pollTimer == null) startPolling(); }
  if (!S.ui.selected && view.cases.length) selectCase(view.cases[0].id, { quiet: true });
  notifyArrivals(prev, view, initial);
  renderAll();
}

function notifyArrivals(prev, view, initial) {
  const before = new Map((prev ? prev.cases : []).map((c) => [c.id, c.lastCustomerId]));
  if (initial || !prev || prev.cases.length === 0) return;
  for (const c of view.cases) {
    const had = before.has(c.id);
    const changed = before.get(c.id) !== c.lastCustomerId;
    if (!changed) continue;
    const visibleNow = S.ui.selected === c.id && S.ui.ws === 'convo' && !document.hidden;
    if (visibleNow) continue;
    const who = c.customer;
    const msg = !had
      ? (c.channel === 'email' ? `New email from ${who}: ${c.subject}` : `New live chat: ${who}`)
      : (c.channel === 'email' ? `New email from ${who}` : `New message from ${who}`);
    toast(msg, c.id);
  }
}

function toast(text, caseId) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class="t-body">${esc(text)}</span><button aria-label="Dismiss notification">&times;</button>`;
  const go = () => { if (caseId) selectCase(caseId); el.remove(); };
  el.querySelector('.t-body').style.cursor = 'pointer';
  el.querySelector('.t-body').addEventListener('click', go);
  el.querySelector('button').addEventListener('click', () => el.remove());
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 9000);
}

// ---------- console skeleton ----------
function buildConsole() {
  S.screen = 'console'; S.convoKey = null; setTitle();
  $('#app').innerHTML = `
    <div class="console">
      <header class="topbar">
        <div class="brand-mark"><span class="dot"></span><span>${esc(S.brand)}</span></div>
        <div class="meta" id="meta"></div>
        <div class="spacer"></div>
        <button class="btn btn-ghost btn-sm desktop-only" id="ctxToggle" aria-pressed="true">Case details</button>
        <button class="btn btn-ghost btn-sm desktop-only" id="resetBtn">Reset trial</button>
        <button class="btn btn-ghost btn-sm" id="menuBtn" aria-label="Menu">${ic('menu')}<span class="desktop-only">Sign out</span></button>
      </header>
      <div class="workspace" id="ws" data-screen="queue">
        <nav class="rail" aria-label="Main">
          <button data-nav="inbox">${ic('inbox')}<span>Inbox</span><b class="badge" hidden></b></button>
          <button data-nav="live">${ic('live')}<span>Live</span><b class="badge" hidden></b></button>
          <button data-nav="team">${ic('team')}<span>Team</span></button>
          <button data-nav="policy">${ic('book')}<span>Policy</span></button>
          <button disabled title="Not available in this simulation">${ic('chart')}<span>Reports</span></button>
          <button disabled title="Not available in this simulation">${ic('gear')}<span>Settings</span></button>
        </nav>
        <section class="queue" id="queue" aria-label="Open work"></section>
        <section class="convo" id="convo" aria-label="Conversation"></section>
        <section class="page-view" id="pageview"></section>
        <aside class="context" id="context" aria-label="Case details"></aside>
        <nav class="mbar" aria-label="Main">
          <button data-nav="queue">${ic('inbox')}<span>Queue</span><b class="badge" hidden></b></button>
          <button data-nav="policy">${ic('book')}<span>Policy</span></button>
          <button data-nav="team">${ic('team')}<span>Team</span></button>
        </nav>
      </div>
    </div>`;
  $('#menuBtn').addEventListener('click', openMenu);
  $('#resetBtn').addEventListener('click', confirmReset);
  $('#ctxToggle').addEventListener('click', () => { S.ui.ctxOpen = !S.ui.ctxOpen; $('#ctxToggle').setAttribute('aria-pressed', S.ui.ctxOpen); renderLayout(); });
  $$('[data-nav]').forEach((b) => b.addEventListener('click', () => nav(b.dataset.nav)));
}

function nav(where) {
  if (where === 'inbox') { S.ui.filter = 'email'; S.ui.page = null; S.ui.ws = S.ui.selected ? 'convo' : 'queue'; if (isMobile()) S.ui.ws = 'queue'; }
  else if (where === 'live') { S.ui.filter = 'chat'; S.ui.page = null; S.ui.ws = S.ui.selected ? 'convo' : 'queue'; if (isMobile()) S.ui.ws = 'queue'; }
  else if (where === 'queue') { S.ui.page = null; S.ui.ws = 'queue'; }
  else { S.ui.page = where; S.ui.ws = 'page'; }
  renderAll();
}
const isMobile = () => window.matchMedia('(max-width: 899px)').matches;

function selectCase(id, { quiet = false } = {}) {
  S.ui.selected = id; S.ui.page = null; S.ui.summaryOpen = false;
  S.ui.ws = quiet && isMobile() ? 'queue' : 'convo';
  if (!quiet) renderAll();
}

// ---------- rendering ----------
function markSeen() {
  const c = currentCase();
  if (c && S.ui.ws === 'convo' && !S.ui.page && !document.hidden) S.seen[c.id] = c.lastCustomerId;
}

function renderAll() {
  if (S.screen !== 'console') return;
  markSeen();
  renderTop(); renderLayout(); renderQueue(); renderConvo(); renderContext(); renderPage();
  tickTimers();
}

function renderTop() {
  const v = S.view;
  $('#meta').innerHTML = `<span>Trial ${v.trial.trialNo}</span><span>Shift started ${esc(v.trial.shift.timeText)}</span><span>${esc(v.trial.shift.dateText)}</span>`;
  $('#resetBtn').hidden = !v.trial.resetAvailable;
}

function renderLayout() {
  const ws = $('#ws');
  ws.dataset.screen = S.ui.ws;
  ws.classList.toggle('ctx-closed', !S.ui.ctxOpen);
  $$('.rail [data-nav], .mbar [data-nav]').forEach((b) => {
    const k = b.dataset.nav;
    const on = S.ui.page ? k === S.ui.page : (k === 'queue' || (k === 'inbox' && S.ui.filter === 'email') || (k === 'live' && S.ui.filter === 'chat'));
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
}

function unread(c) { return !!c.lastCustomerId && S.seen[c.id] !== c.lastCustomerId; }

function statusPill(c) {
  if (c.status === 'closed') {
    const map = { resolved: ['check', 'Resolved'], transferred: ['arrow', 'Transferred'], unresolved: ['x', 'Unresolved'] };
    const [i, l] = map[c.outcome] || ['check', 'Closed'];
    return `<span class="status ${esc(c.outcome)}">${ic(i)}${l}</span>`;
  }
  if (c.status === 'waiting') return `<span class="status waiting">${ic('clock')}Waiting for customer</span>`;
  return `<span class="status">${ic('open')}Open</span>`;
}

function renderQueue() {
  const v = S.view, f = S.ui.filter;
  const match = (ch) => f === 'all' || f === ch;
  const open = v.cases.filter((c) => c.status !== 'closed' && match(c.channel)).sort((a, b) => b.lastActivity - a.lastActivity);
  const closed = v.cases.filter((c) => c.status === 'closed' && match(c.channel));
  const hist = (S.ref ? S.ref.history : []).filter((h) => match(h.channel));
  const newCount = v.cases.filter(unread).length;

  const item = (c) => {
    const un = unread(c);
    const sub = c.channel === 'email' ? c.subject : c.topic || 'Live chat';
    const note = v.notes[c.id];
    const noteTag = c.status === 'closed' ? (note.status === 'done' ? '<span class="noteflag" style="color:#8FD6B2">Note done</span>' : '<span class="noteflag">Note due</span>') : '';
    const timer = c.deadline ? `<span class="timer" data-deadline="${c.deadline}">${ic('clock')}<span class="tl"></span></span>` : '';
    return `<button class="qitem ${un ? 'unread' : ''}" data-case="${c.id}" aria-current="${S.ui.selected === c.id}">
      <div class="qline"><span class="udot ${un ? '' : 'none'}" title="${un ? 'Unread' : 'Read'}"></span>${ic(c.channel === 'email' ? 'mail' : 'chat')}<span class="qname">${esc(c.customer)}</span><span class="qtime">${esc(fmtClock(c.lastActivity))}</span></div>
      <div class="qsub">${esc(sub)}</div>
      <div class="qmeta">${un ? '<span class="sr">Unread. </span>' : ''}${statusPill(c)}${timer}${noteTag}</div>
    </button>`;
  };
  const hitem = (h) => `<button class="qitem archived" data-hist="${h.id}" aria-current="${S.ui.selected === h.id}">
      <div class="qline"><span class="udot none"></span>${ic(h.channel === 'email' ? 'mail' : 'chat')}<span class="qname">${esc(h.customer)}</span><span class="qtime">${esc(h.when.split(', ').slice(0, 1).join(''))}</span></div>
      <div class="qsub">${esc(h.subject)}</div>
      <div class="qmeta"><span class="status resolved">${ic('check')}Closed</span><span style="font-size:12px">${esc(h.closure)}</span></div>
    </button>`;

  const q = $('#queue');
  const html = `
    <div class="queue-head"><h2>Work queue</h2>
      <div class="chips" role="group" aria-label="Filter">
        ${['all', 'chat', 'email'].map((k) => `<button class="chip" data-filter="${k}" aria-pressed="${f === k}">${{ all: 'All', chat: 'Chat', email: 'Email' }[k]}</button>`).join('')}
      </div></div>
    ${newCount ? `<div class="queue-notice" role="status">${ic('inbox')}<span>${newCount} unread ${newCount === 1 ? 'conversation' : 'conversations'}</span></div>` : ''}
    <div class="queue-scroll">
      <div class="queue-section">Open work</div>
      ${open.length ? open.map(item).join('') : '<p style="padding:6px 14px;color:var(--muted);font-size:14px;margin:0">Nothing open in this view.</p>'}
      ${closed.length ? `<div class="queue-section">Closed this shift</div>${closed.map(item).join('')}` : ''}
      ${hist.length ? `<div class="queue-section muted">Closed by previous shift</div>${hist.map(hitem).join('')}` : ''}
    </div>`;
  const prevScroll = $('.queue-scroll', q) ? $('.queue-scroll', q).scrollTop : 0;
  if (q.dataset.h !== html) {
    q.innerHTML = html; q.dataset.h = html;
    $('.queue-scroll', q).scrollTop = prevScroll;
    $$('[data-filter]', q).forEach((b) => b.addEventListener('click', () => { S.ui.filter = b.dataset.filter; renderQueue(); renderLayout(); }));
    $$('[data-case]', q).forEach((b) => b.addEventListener('click', () => selectCase(b.dataset.case)));
    $$('[data-hist]', q).forEach((b) => b.addEventListener('click', () => selectCase(b.dataset.hist)));
  }
  // rail badges
  const unEmail = v.cases.filter((c) => c.channel === 'email' && unread(c)).length;
  const unChat = v.cases.filter((c) => c.channel === 'chat' && unread(c)).length;
  const setBadge = (sel, n) => $$(sel).forEach((b) => { b.hidden = !n; b.textContent = n; });
  setBadge('.rail [data-nav="inbox"] .badge', unEmail);
  setBadge('.rail [data-nav="live"] .badge', unChat);
  setBadge('.mbar [data-nav="queue"] .badge', unEmail + unChat);
}

function currentCase() { return S.view.cases.find((c) => c.id === S.ui.selected) || null; }
function currentHist() { return S.ref ? S.ref.history.find((h) => h.id === S.ui.selected) : null; }

function msgHtml(c, m, chat) {
  const mine = m.from === 'agent';
  if (chat) {
    return `<div class="bubble ${mine ? 'agent' : 'customer'}"><span class="who">${mine ? 'You' : esc(c.customer)}</span>${esc(m.text)}<span class="when">${esc(fmtClock(m.at))}</span></div>`;
  }
  return `<article class="email ${mine ? 'agent' : 'customer'}">
    <header><span><strong>From:</strong> ${mine ? 'You (Support)' : esc(c.customer)}</span><span><strong>To:</strong> ${mine ? esc(c.customer) : 'Support'}</span><span><strong>Subject:</strong> ${esc(m.subject || c.subject)}</span><span>${esc(fmtStamp(m.at))}</span></header>
    <div class="body">${esc(m.text)}</div></article>`;
}

function renderConvo() {
  const root = $('#convo');
  const c = currentCase();
  const h = currentHist();
  if (!c && !h) {
    saveVisibleDraft();
    S.convoKey = 'none';
    root.innerHTML = `<div class="empty"><h2>Select a conversation</h2><p>Open an item from the work queue.</p></div>`;
    return;
  }
  if (h) return renderHistory(root, h);
  const note = S.view.notes[c.id];
  const key = [c.id, c.canReply ? 'r' : 'x', c.status, note.status, S.ui.summaryOpen ? 's' : ''].join('|');
  const chat = c.channel === 'chat';

  if (S.convoKey !== key) {
    saveVisibleDraft();
    S.convoKey = key;
    const title = chat ? c.customer : c.subject;
    const sub = chat ? (c.topic || 'Live chat') : `From ${c.customer}`;
    root.innerHTML = `
      <div class="convo-head">
        <button class="btn btn-ghost btn-sm mobile-only" id="backBtn" aria-label="Back to queue" style="color:var(--ink);border-color:var(--rule)">${ic('back')}</button>
        <h2>${esc(title)}<span class="sub">${esc(sub)}</span></h2>
        <span id="dl"></span>
      </div>
      <div class="summary" id="summary"></div>
      <div class="msgs" id="msgs" tabindex="0" aria-label="Messages"></div>
      <div id="below"></div>`;
    $('#backBtn').addEventListener('click', () => { S.ui.ws = 'queue'; renderAll(); });
    $('#below').dataset.built = '';
    $('#msgs').dataset.count = '';
  }

  // header deadline
  const dl = $('#dl');
  setHtml(dl, c.deadline
    ? `<span class="deadline" data-deadline="${c.deadline}">${ic('clock')}<span class="tl"></span><span class="sr"> left to reply</span></span>`
    : `<span class="deadline idle">${c.status === 'closed' ? ({ resolved: 'Resolved', transferred: 'Transferred', unresolved: 'Unresolved' }[c.outcome] || 'Closed') : 'Waiting for customer'}</span>`);

  // pinned summary (mobile)
  const sum = $('#summary');
  const amt = c.record.rows.find((r) => /amount|price/i.test(r[0]));
  setHtml(sum, `<button aria-expanded="${S.ui.summaryOpen}" id="sumBtn"><span class="sum-main"><strong>${esc(c.record.title)}</strong>${amt ? ` · ${esc(amt[1])}` : ''}</span><span>${S.ui.summaryOpen ? 'Hide' : 'Details'}</span></button>${S.ui.summaryOpen ? `<div class="sum-full">${recordHtml(c)}</div>` : ''}`);
  $('#sumBtn').onclick = () => { S.ui.summaryOpen = !S.ui.summaryOpen; S.convoKey = null; renderConvo(); };

  // messages
  const msgs = $('#msgs');
  const count = `${c.messages.length}|${c.status}`;
  if (msgs.dataset.count !== count) {
    const nearBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 120 || !msgs.dataset.count;
    msgs.innerHTML = c.messages.map((m) => msgHtml(c, m, chat)).join('') +
      (c.status === 'waiting' ? `<div class="typing">${ic('clock')}<span>${chat ? `${esc(c.customer)} is typing…` : 'Waiting for the customer to reply.'}</span></div>` : '');
    msgs.dataset.count = count;
    if (nearBottom) msgs.scrollTop = msgs.scrollHeight;
  }

  renderBelow(c, note, chat);
  tickTimers();
}

function renderBelow(c, note, chat) {
  const below = $('#below');
  if (below.dataset.built === S.convoKey) {
    // keep the composer element, just refresh state
    refreshComposerState(c);
    return;
  }
  below.dataset.built = S.convoKey;
  if (c.status !== 'closed') {
    if (c.canReply && S.status[c.id] && S.status[c.id].kind === 'sent') S.status[c.id] = null;
    const draft = S.drafts[c.id] ?? c.draft ?? '';
    below.innerHTML = `
      <form class="composer ${chat ? 'chat' : 'email'}" id="composer" novalidate>
        ${chat ? '' : `<div class="envelope"><span>To</span><output>${esc(c.customer)}</output><span>Subject</span><output>Re: ${esc(c.subject.replace(/^Re:\s*/i, ''))}</output></div>`}
        <label class="sr" for="body">Reply to ${esc(c.customer)}</label>
        <textarea id="body" rows="${chat ? 2 : 6}" placeholder="${c.canReply ? 'Write your reply' : 'Waiting for the customer'}" ${c.canReply ? '' : 'disabled'}>${esc(draft)}</textarea>
        <div class="composer-bar"><span class="saved" id="saved" role="status"></span><button class="btn btn-primary" type="submit" id="send" ${c.canReply ? '' : 'disabled'}>${chat ? 'Send' : 'Send email'}</button></div>
      </form>`;
    const ta = $('#body');
    S.drafts[c.id] = draft;
    ta.addEventListener('input', () => onType(c.id));
    ta.addEventListener('keydown', (e) => {
      if (chat && e.key === 'Enter' && !e.shiftKey && !window.matchMedia('(pointer: coarse)').matches) { e.preventDefault(); sendReply(c.id); }
    });
    ta.addEventListener('focus', () => setTimeout(() => { ta.scrollIntoView({ block: 'nearest' }); const m = $('#msgs'); if (m) m.scrollTop = m.scrollHeight; }, 300));
    $('#composer').addEventListener('submit', (e) => { e.preventDefault(); sendReply(c.id); });
    refreshComposerState(c);
  } else {
    below.innerHTML = closedBlock(c, note);
    bindNote(c, note);
  }
}

function refreshComposerState(c) {
  const ta = $('#body'); const btn = $('#send'); const saved = $('#saved');
  if (!ta) return;
  ta.disabled = !c.canReply;
  ta.placeholder = c.canReply ? 'Write your reply' : 'Waiting for the customer';
  const sending = !!S.sending[c.id];
  btn.disabled = !c.canReply || sending;
  const st = S.status[c.id];
  const failed = st && st.kind === 'notsent';
  btn.textContent = failed ? 'Retry' : (c.channel === 'chat' ? 'Send' : 'Send email');
  if (st) { saved.className = `saved ${st.kind === 'notsent' || st.kind === 'err' ? 'err' : st.kind === 'sent' ? 'sent' : ''}`; saved.textContent = st.text; }
  else { saved.className = 'saved'; saved.textContent = ''; }
}

function setStatus(id, kind, text) {
  S.status[id] = { kind, text };
  const c = currentCase();
  if (c && c.id === id) refreshComposerState(c);
}

function saveVisibleDraft() {
  const ta = $('#body');
  const c = S.convoKey && S.convoKey !== 'none' ? S.convoKey.split('|')[0] : null;
  if (ta && c) S.drafts[c] = ta.value;
}

// ---------- drafts and sending ----------
function onType(id) {
  const ta = $('#body');
  const prev = S.drafts[id] || '';
  S.drafts[id] = ta.value;
  S.reqIds[id] = null;
  if (S.status[id] && S.status[id].kind === 'notsent') S.status[id] = null;
  setStatus(id, 'saving', 'Saving…');
  clearTimeout(S.saveTimers[id]);
  // typing starting is sent at once so the server can see it before the deadline
  const delay = !prev.trim() && ta.value.trim() ? 0 : 700;
  S.saveTimers[id] = setTimeout(() => pushDraft(id), delay);
}

async function pushDraft(id) {
  const text = S.drafts[id] ?? '';
  try {
    const r = await api('POST', '/draft', { caseId: id, text, seq: monoSeq() });
    if (r.status === 200) { if ((S.drafts[id] ?? '') === text) setStatus(id, 'saved', text ? 'Saved' : ''); }
    else if (r.status === 409) setStatus(id, 'saving', '');
    else setStatus(id, 'err', 'Not saved. Keep this page open.');
  } catch { setStatus(id, 'err', 'Not saved. Check your connection.'); }
}

async function sendReply(id) {
  if (S.blocked || S.sending[id]) return;
  const ta = $('#body');
  const text = (ta ? ta.value : S.drafts[id] || '');
  const c = S.view.cases.find((x) => x.id === id);
  if (!c || !c.canReply) return;
  if (!text.trim()) { setStatus(id, 'err', 'Type a reply first.'); return; }
  clearTimeout(S.saveTimers[id]);
  S.sending[id] = true;
  S.drafts[id] = text;
  // the same request id is reused on retry so the server never records a reply twice
  if (!S.reqIds[id]) S.reqIds[id] = `${id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  setStatus(id, 'saving', 'Sending…');
  try {
    const r = await api('POST', '/send', {
      caseId: id, text, requestId: S.reqIds[id], lastCustomerId: c.lastCustomerId,
      subject: c.channel === 'email' ? `Re: ${c.subject.replace(/^Re:\s*/i, '')}` : null
    });
    if (r.status === 200 && r.data.view) {
      S.drafts[id] = ''; S.reqIds[id] = null; S.sending[id] = false;
      S.status[id] = { kind: 'sent', text: 'Sent' };
      S.convoKey = null;
      applyView(r.data.view);
      return;
    }
    S.sending[id] = false;
    if (r.status === 409 && r.data.error === 'session_moved') return;
    setStatus(id, 'notsent', `Not sent. ${r.data.message || 'Try again.'}`);
    if (r.status === 409) poll();
  } catch {
    S.sending[id] = false;
    setStatus(id, 'notsent', 'Not sent. Check your connection, then retry.');
  }
}

// ---------- notes ----------
function closedBlock(c, note) {
  const label = { resolved: 'Resolved', transferred: 'Transferred', unresolved: 'Unresolved' }[c.outcome] || 'Closed';
  const head = `<div class="banner" role="status"><strong>${label}.</strong> <span>This conversation is closed.</span>${note.status === 'available' ? '<button class="btn btn-primary btn-sm" id="openNote">Write service recovery note</button>' : ''}</div>`;
  if (note.status === 'locked') return head;
  if (note.status === 'available') return head + `<p style="margin:0 20px 20px;font-size:14px;color:var(--ink-2)">The note timer starts when you open the note: 3 minutes.</p>`;
  const fields = S.view.noteFields;
  const saved = note.fields || {};
  const ro = note.status === 'done';
  const pf = note.prefill || {};
  const val = (n) => (S.noteDrafts[c.id] && S.noteDrafts[c.id][n] != null && !ro) ? S.noteDrafts[c.id][n] : (saved[n] || '');
  return head + `
    <section class="note-card" aria-label="Service recovery note">
      <h3>${ic('note')} Internal note: service recovery <span class="deadline ${ro ? 'idle' : ''}" id="ndl" style="margin-left:auto">${ro ? (note.expired ? 'Time up. Saved.' : 'Submitted') : `${ic('clock')}<span class="tl"></span>`}</span></h3>
      <p class="hint">Internal only. The customer does not see this note.</p>
      <div class="note-prefill"><span><b>Case:</b> ${esc(pf.caseRef || '')}</span><span><b>Channel:</b> ${esc(pf.channel || '')}</span><span><b>Time:</b> ${esc(pf.time || '')}</span></div>
      <form id="noteForm" novalidate>
        ${fields.map((f) => `<div class="note-row"><label for="nf${f.n}">${f.n}. ${esc(f.label)}</label><textarea id="nf${f.n}" data-n="${f.n}" rows="2" ${ro ? 'readonly' : ''}>${esc(val(f.n))}</textarea></div>`).join('')}
        ${ro ? '' : `<div class="composer-bar" style="margin-top:0"><span class="saved" id="nsaved" role="status"></span><button class="btn btn-primary" type="submit">Submit note</button></div>`}
      </form>
    </section>`;
}

function bindNote(c, note) {
  const open = $('#openNote');
  if (open) open.addEventListener('click', async () => {
    open.disabled = true;
    const r = await api('POST', '/note/open', { caseId: c.id });
    if (r.status === 200) applyView(r.data.view);
    else open.disabled = false;
  });
  const form = $('#noteForm');
  if (!form || note.status !== 'open') {
    const ndl = $('#ndl'); if (ndl && note.deadline) ndl.dataset.deadline = note.deadline;
    return;
  }
  const ndl = $('#ndl');
  ndl.dataset.deadline = note.deadline;
  ndl.classList.add('deadline');
  const read = () => { const f = {}; $$('textarea', form).forEach((t) => { f[t.dataset.n] = t.value; }); return f; };
  let timer = null;
  const save = async () => {
    const fields = read();
    S.noteDrafts[c.id] = fields;
    try {
      const r = await api('POST', '/note/save', { caseId: c.id, fields, seq: monoSeq() });
      const el = $('#nsaved'); if (el) { el.className = 'saved'; el.textContent = r.status === 200 ? 'Saved' : ''; }
      if (r.status === 409) poll();
    } catch { const el = $('#nsaved'); if (el) { el.className = 'saved err'; el.textContent = 'Not saved. Check your connection.'; } }
  };
  $$('textarea', form).forEach((t) => t.addEventListener('input', () => {
    S.noteDrafts[c.id] = read();
    const el = $('#nsaved'); if (el) { el.className = 'saved'; el.textContent = 'Saving…'; }
    clearTimeout(timer); timer = setTimeout(save, 300);
  }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearTimeout(timer);
    const r = await api('POST', '/note/submit', { caseId: c.id, fields: read(), seq: monoSeq() });
    if (r.status === 200) { S.convoKey = null; applyView(r.data.view); }
    else { const el = $('#nsaved'); if (el) { el.className = 'saved err'; el.textContent = r.data.message || 'Not submitted.'; } poll(); }
  });
}

// ---------- history ----------
function renderHistory(root, h) {
  saveVisibleDraft();
  S.convoKey = `hist|${h.id}`;
  const chat = h.channel === 'chat';
  root.innerHTML = `
    <div class="convo-head">
      <button class="btn btn-ghost btn-sm mobile-only" id="backBtn" aria-label="Back to queue" style="color:var(--ink);border-color:var(--rule)">${ic('back')}</button>
      <h2>${esc(h.subject)}<span class="sub">${esc(h.customer)} · ${esc(h.when)}</span></h2>
      <span class="deadline idle">Archived</span>
    </div>
    <div class="msgs">${h.messages.map((m, i) => {
      const fake = { customer: h.customer, subject: h.subject };
      const mm = { from: m.from, text: m.text, at: 0, subject: h.subject };
      if (chat) return `<div class="bubble ${m.from === 'agent' ? 'agent' : 'customer'}"><span class="who">${m.from === 'agent' ? 'Agent' : esc(h.customer)}</span>${esc(m.text)}</div>`;
      return `<article class="email ${m.from === 'agent' ? 'agent' : 'customer'}"><header><span><strong>From:</strong> ${m.from === 'agent' ? 'Support' : esc(h.customer)}</span><span><strong>Subject:</strong> ${esc(i ? 'Re: ' + h.subject : h.subject)}</span></header><div class="body">${esc(m.text)}</div></article>`;
    }).join('')}</div>
    <div class="banner" role="status"><strong>Closed by previous shift.</strong> <span>${esc(h.closure)} Read only.</span></div>`;
  $('#backBtn').addEventListener('click', () => { S.ui.ws = 'queue'; renderAll(); });
}

// ---------- context and pages ----------
function recordHtml(c) {
  return `<table class="record"><tbody>${c.record.rows.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>${c.record.notes.map((n) => `<div class="ctx-note">${esc(n)}</div>`).join('')}`;
}

function renderContext() {
  const el = $('#context');
  const c = currentCase();
  if (!c) {
    const h = currentHist();
    setHtml(el, h ? `<h3>Archived conversation</h3><p class="ctx-note">${esc(h.closure)}</p>` : '<h3>Case details</h3><p style="color:var(--ink-2)">Select a conversation to see the order record.</p>');
    return;
  }
  const policy = S.ref ? S.ref.policy : [];
  const open = $$('details.pol[open] summary', el).map((x) => x.textContent);
  const html = `
    <h3>${esc(c.record.title)}</h3>
    ${recordHtml(c)}
    <div class="ctx-section"><h3>Policy</h3>
      ${policy.map((p) => `<details class="pol"><summary>${esc(p.title)}</summary><p>${esc(p.text)}</p></details>`).join('')}
    </div>`;
  if (setHtml(el, html)) $$('details.pol', el).forEach((d) => { if (open.includes($('summary', d).textContent)) d.open = true; });
}

function renderPage() {
  const el = $('#pageview');
  if (S.ui.page === 'policy') {
    const policy = S.ref ? S.ref.policy : [];
    setHtml(el, `<h2>Policy</h2><div class="policy-grid">${policy.map((p) => `<div class="policy-card"><h3>${esc(p.title)}</h3><p>${esc(p.text)}</p></div>`).join('')}</div>`);
  } else if (S.ui.page === 'team') {
    const staff = S.ref ? S.ref.staff : [];
    setHtml(el, `<h2>Team</h2><div class="team-grid">${staff.map((p) => `<div class="person"><span class="avatar" aria-hidden="true">${esc(initials(p.name))}</span><div><b>${esc(p.name)}</b><span>${esc(p.role)}</span></div></div>`).join('')}</div>`);
  } else setHtml(el, '');
}

// ---------- menu, reset, modals ----------
function modal(html, onMount) {
  closeModal();
  const back = document.createElement('div');
  back.className = 'modal-back'; back.id = 'modal';
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  back.addEventListener('click', (e) => { if (e.target === back) closeModal(); });
  document.body.appendChild(back);
  onMount && onMount(back);
  const first = back.querySelector('button, input, a'); if (first) first.focus();
}
function closeModal() { const m = $('#modal'); if (m) m.remove(); }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

function openMenu() {
  const v = S.view;
  modal(`<h2>Menu</h2><p>Signing out keeps your trial open. You can resume it later on any device.</p>
    <div class="actions" style="justify-content:stretch;flex-direction:column">
      ${v && v.trial.resetAvailable ? '<button class="btn btn-light" id="m-reset">Reset trial</button>' : ''}
      <button class="btn btn-light" id="m-out">Sign out</button>
      <button class="btn btn-ghost" id="m-close" style="color:var(--ink);border-color:var(--rule)">Close</button>
    </div>`, (m) => {
    $('#m-out', m).addEventListener('click', signOut);
    $('#m-close', m).addEventListener('click', closeModal);
    const r = $('#m-reset', m); if (r) r.addEventListener('click', confirmReset);
  });
}

function confirmReset() {
  modal(`<h2>Reset this trial?</h2>
    <p>Every conversation, reply, draft and note in this trial is cleared and the shift restarts with Case A and the same customers. You can do this once per trial. It does not use one of your three trials.</p>
    <div class="actions"><button class="btn btn-light" id="r-no">Cancel</button><button class="btn btn-danger" id="r-yes">Reset trial</button></div>`, (m) => {
    $('#r-no', m).addEventListener('click', closeModal);
    $('#r-yes', m).addEventListener('click', async (e) => {
      e.target.disabled = true;
      const r = await api('POST', '/reset', { confirm: true });
      closeModal();
      if (r.status === 200) {
        S.drafts = {}; S.noteDrafts = {}; S.seen = {}; S.status = {}; S.ui.selected = null; S.ui.ws = 'queue'; S.convoKey = null; S.prevCases = null;
        applyView(r.data.view, { initial: true });
      } else toast(r.data.message || 'Could not reset the trial.');
    });
  });
}

function sessionMoved() {
  if (S.blocked) return;
  S.blocked = true;
  stopPolling();
  modal(`<h2>Session moved</h2><p>This trial was opened on another device. This device can no longer change it. Sign in again to take the session back.</p>
    <div class="actions"><button class="btn btn-primary" id="sm-in">Sign in again</button></div>`, (m) => {
    $('#sm-in', m).addEventListener('click', () => { S.blocked = false; localSignOut(); });
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
