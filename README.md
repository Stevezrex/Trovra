# Trovra support desk simulation (Week 7)

Certificate in Customer Service and Virtual Assistance. Week 7: difficult customers and conflict resolution.
Learners work four complaint cases in a fictional support console. The server runs the simulation and stores the evidence. You mark from the transcripts and notes.

Built from `Week7_Trovra_Simulation_Plan_Revised-1.md`.

## What is in this folder

```text
public/                 Static front end (index.html, app.js, styles.css, fonts, Ankara SVG)
netlify/functions/
  api.mjs               HTTP layer: sessions, validation, returns only what the learner may see
  engine.mjs            Rule engine: signals, heat, acceptance, timers, offline gaps, notes
  cases.mjs             Fact sets, authored customer lines, order records (server only)
  static.mjs            Policy, staff, previous-shift conversations, note fields
  config.mjs            Every timing and limit, in one file
  store.mjs             Netlify Blobs storage (in-memory for tests)
scripts/
  dev_server.mjs        Local preview (npm run dev)
  copy_fonts.mjs        Copies fonts from npm into public/fonts at build time
  export_trials.mjs     Downloads trial records from Netlify Blobs
  make_fake_records.mjs Generates fake trials by playing scripted learners
merge.mjs               Trial JSON files to one CSV (one row per trial and case)
build_workbook.py       CSV to the Excel marking workbook
tests/                  28 automated server checks (npm test)
sample/                 Fake records, fake CSV and a fake marking workbook
netlify.toml            Publish folder, functions folder, headers, Node 20
```

`public/` is the publish folder on purpose. The customer line bank in `cases.mjs` never sits in a folder that is served to browsers.

## Deploy

1. Push this folder to a GitHub repository.
2. In Netlify, add a new site from that repository. `netlify.toml` already sets the publish folder (`public`), functions folder, build command (`npm run build`) and Node 20. No environment variables are needed.
3. Netlify Blobs is enabled automatically for functions on the site.
4. Open the site URL. Sign in with a test name and email.

Before the cohort uses it (plan section 14):

1. Deploy a test account.
2. Complete and submit one disposable trial on a phone and a laptop.
3. Export it (see below), merge it, and open it in the workbook.
4. Delete the test records. In the Netlify dashboard open the site, then Blobs, store `trovra`, and delete the `trial/` and `learner/` keys that belong to the test account. Or run `netlify blobs:delete` for those keys.

## Run it locally

```bash
npm install
npm test          # 28 checks against the real server code
npm run dev       # http://localhost:8888, in-memory store
TROVRA_FAST=1 npm run dev   # same, with short timers for walking through a shift
```

The local preview forgets everything when you stop it.

## Settings

All timings live in `netlify/functions/config.mjs`: chat 90 s (extends to 120 s if typing has started), email 3 min (+30 s), note 3 min, next email 60 s after the learner's reply, offline threshold, three missed windows, three trials, one reset. The brand name is set there too. Change a value, commit, redeploy. The plan asks you to confirm the timings in a phone-and-laptop pilot.

## Exporting records and marking

1. Create a personal access token in your Netlify user settings. Find the site ID under Site configuration.
2. Export:
   ```bash
   NETLIFY_SITE_ID=... NETLIFY_AUTH_TOKEN=... node scripts/export_trials.mjs exports
   ```
   You can also use the Netlify CLI (`netlify blobs:list`, `netlify blobs:get`) and save each `trial/...` record as a `.json` file.
3. Merge:
   ```bash
   node merge.mjs exports trials_merged.csv
   ```
4. Build the workbook:
   ```bash
   pip install openpyxl
   python3 build_workbook.py trials_merged.csv Trovra_Week7_Marking_Workbook.xlsx
   ```
5. Open the workbook. Read its Guide sheet. In short: pick the trial to mark for each learner on the Learners sheet (nothing is picked for you), score the yellow cells on the Case sheets, and read the total out of 100 on the Learners sheet.

`sample/Trovra_Week7_Marking_Workbook_FAKE.xlsx` shows the finished layout with fake data. Try the whole path first:
`node scripts/make_fake_records.mjs`, `node merge.mjs sample/fake_records sample/fake_trials.csv`, then `build_workbook.py` with `--fake`.

Keep exported files private. They contain learner names, emails and responses.

## How the engine decides (short version)

- Each learner reply is checked for signals: acknowledgement, action using a record fact, question, options and limits, next step with action, owner and time, blame or policy dodging, hostility, brush-off (under four words), overpromise, boundary, transfer, and asking for card details.
- Heat moves 1 to 5 as in the plan. Each stage adds one. Acknowledgement and a demonstrated action subtract one each. Negatives add up to two.
- A customer accepts when the reply has action, owner and time, the learner has acknowledged the concern, heat is 3 or below, and the case conditions are met (plan section 9).
- An overpromise does not end a case. The customer takes it at face value and the record flags it. The overpromise check applies to the reply where it happens. A later reply that meets the conditions can still resolve the case. The flag stays for you.
- A chat allows five learner replies and an email three. If nothing is accepted by then, the customer leaves and the case closes unresolved.
- Case C: customer turn 2 is always an insult and turn 4 always a relapse. A conditional warning ("if this continues I will transfer you") counts as a boundary, not a transfer. An actual transfer after the first insult closes the case as transferred.
- Signals are evidence for you. They never award marks. The wording rules are broad but not perfect. Score from the transcript.

## Choices the plan left open

- **Welcome screen.** It shows the trial number and today's date. The shift start time is captured when the learner selects Start shift (plan section 5) and shown in the console. The plan also lists it on the welcome screen, which would mean showing a time that has not been captured yet.
- **Case D delivery dates.** The plan has no delivery date for Case D. The record uses 2, 1 and 3 days ago for sets 1, 2 and 3.
- **Previous-shift conversations.** The plan gives six titles. The short conversations and closure notes are written here. Edit them in `static.mjs`.
- **Sign-in match.** Email identifies the learner. The name must match the one first used with that email (trimmed, case-insensitive). A mismatch is refused with a message.
- **No password.** Anyone who types a classmate's name and email can take over that learner's open trial. That is how the plan defines sign-in. The session-moved notice makes it visible to the real learner.
- **Reset.** It clears every case, reply, draft and note and restarts at Case A. The original shift timestamp stays frozen. It does not use an attempt.
- **Case C charge times.** The plan's fixed times ("9:14am today") could fall after the learner's clock. The charge time is now worked out from the frozen shift start: 52, 37 and 71 minutes before it for sets 1, 2 and 3, shown as "today" or "yesterday" if the shift starts just after midnight. It never changes on resume or reset. Change the offsets in `cases.mjs` (`chargeMinsBefore`).
- **Context panel policy.** The panel lists every policy section, the same for each case, so it does not point at the "right" one.

## Known limits

- Netlify Blobs has no conditional writes. The server serialises writes per learner inside one function instance and keeps a version number, a draft sequence number and request ids. With fewer than 50 learners and one session each, a stale overwrite is not expected, but two function instances writing the same trial at the same instant is not impossible.
- The server works out timers when a request arrives. There is no background process. A page that stops polling (a phone in a pocket) is treated as offline. The offline gap counts as at most one missed window and never closes a case.
- Deployment to Netlify and Netlify Blobs were not tested from here. The server code was tested against an in-memory store, the function bundles with esbuild, and the Blobs calls match the installed package version (8.2).
- Case B items read as authored: "I bought electric kettle for ₦14,200". The plan's wording is used as written.
