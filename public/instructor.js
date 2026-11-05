const f = document.getElementById('f');
const pw = document.getElementById('pw');
const go = document.getElementById('go');
const msg = document.getElementById('msg');

function show(text, kind) { msg.textContent = text; msg.className = `ins-msg ${kind}`; msg.hidden = false; }

f.addEventListener('submit', async (e) => {
  e.preventDefault();
  go.disabled = true; go.textContent = 'Preparing your file…'; msg.hidden = true;
  try {
    const res = await fetch('/api/instructor/export', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: pw.value })
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      show(b.message || 'The download did not work. Try again.', 'err');
      return;
    }
    const blob = await res.blob();
    const name = (res.headers.get('content-disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'trovra-trials.csv';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    const n = Number(res.headers.get('x-trial-count') || 0);
    const l = Number(res.headers.get('x-learner-count') || 0);
    show(n ? `Downloaded ${n} trial${n === 1 ? '' : 's'} from ${l} student${l === 1 ? '' : 's'}. Check your Downloads folder.` : 'No students have started a trial yet. The file only has column headings for now.', 'ok');
  } catch {
    show('Could not reach the site. Check your internet connection and try again.', 'err');
  } finally {
    go.disabled = false; go.textContent = 'Download all trials';
  }
});
