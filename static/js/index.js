/* ── Upload Page Logic ── */

const dropZone   = document.getElementById('drop-zone');
const fileInput  = document.getElementById('file-input');
const chosen     = document.getElementById('drop-chosen');
const analyzeBtn = document.getElementById('analyze-btn');
const errorBox   = document.getElementById('error-box');
const progWrap   = document.getElementById('progress-wrap');
const progFill   = document.getElementById('progress-fill');
const progText   = document.getElementById('progress-text');
const progPct    = document.getElementById('progress-pct');
const btnLabel   = document.getElementById('btn-label');

let file = null;

/* ── Drag & Drop ── */
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('over');
  const f = e.dataTransfer.files[0];
  if (f && f.name.toLowerCase().endsWith('.csv')) setFile(f);
  else showErr('Only .csv files are accepted.');
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) setFile(fileInput.files[0]);
});

function setFile(f) {
  file = f;
  chosen.textContent = `✓  ${f.name}  ·  ${(f.size / 1024).toFixed(1)} KB`;
  chosen.classList.add('show');
  analyzeBtn.disabled = false;
  hideErr();
}

function showErr(msg) {
  errorBox.textContent = '⚠  ' + msg;
  errorBox.classList.add('show');
}
function hideErr() { errorBox.classList.remove('show'); }

/* ── Two-phase progress — never freezes ── */
const STEPS_FAST = [
  'Parsing CSV…',
  'Validating schema…',
  'Building directed graph…',
  'Running cycle detection…',
  'Detecting smurfing patterns…',
  'Analyzing shell networks…',
  'Scoring suspicion levels…',
];

const STEPS_SLOW = [
  'Graph traversal in progress…',
  'Computing suspicion scores…',
  'Finalizing ring detection…',
  'Processing large dataset…',
  'Still working, please wait…',
  'Almost there…',
];

analyzeBtn.addEventListener('click', async () => {
  if (!file) return;
  analyzeBtn.disabled = true;
  hideErr();
  progWrap.classList.add('show');
  btnLabel.textContent = 'Analyzing…';

  let pct = 0, stepFast = 0, stepSlow = 0;
  const startTime = Date.now();

  // Phase 1: fast 0% → 75% (≈3 seconds)
  const fastTicker = setInterval(() => {
    if (pct >= 75) { clearInterval(fastTicker); return; }
    pct = Math.min(pct + Math.random() * 7 + 3, 75);
    progFill.style.width = pct + '%';
    progPct.textContent  = Math.round(pct) + '%';
    progText.textContent = STEPS_FAST[Math.min(stepFast++, STEPS_FAST.length - 1)];
  }, 350);

  // Phase 2: slow crawl 75% → 95% with live elapsed timer
  // Starts after Phase 1 naturally. Moves 0.3% every 1.2s so user sees motion.
  const slowTicker = setInterval(() => {
    if (pct < 75) return;
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    if (pct < 95) {
      pct = Math.min(pct + 0.3, 95);
      progFill.style.width = pct + '%';
      progPct.textContent  = Math.round(pct) + '%';
    }
    const msg = STEPS_SLOW[stepSlow % STEPS_SLOW.length];
    progText.textContent = `${msg}  (${elapsed}s elapsed)`;
    stepSlow++;
  }, 1200);

  try {
    const form = new FormData();
    form.append('file', file);

    const res  = await fetch('/analyze', { method: 'POST', body: form });
    const json = await res.json();

    clearInterval(fastTicker);
    clearInterval(slowTicker);

    if (json.status !== 'ok') {
      resetProgress();
      showErr(json.message || 'Analysis failed. Check your CSV format.');
      analyzeBtn.disabled = false;
      btnLabel.textContent = '▶  Run Analysis';
      return;
    }

    // Save to sessionStorage with error handling
    try {
      sessionStorage.setItem('riftResult', JSON.stringify(json.data));
    } catch (storageErr) {
      // If sessionStorage is full, strip graph edges and retry
      const slim = { ...json.data, graph: { nodes: json.data.graph.nodes, edges: [] } };
      sessionStorage.setItem('riftResult', JSON.stringify(slim));
    }

    progFill.style.width = '100%';
    progPct.textContent  = '100%';
    progText.textContent = '✓  Complete!';

    setTimeout(() => window.location.href = '/dashboard', 400);

  } catch (fetchErr) {
    clearInterval(fastTicker);
    clearInterval(slowTicker);
    resetProgress();
    showErr('Network error — is the server running? Try again.');
    analyzeBtn.disabled = false;
    btnLabel.textContent = '▶  Run Analysis';
  }
});

function resetProgress() {
  progWrap.classList.remove('show');
  progFill.style.width = '0%';
  progPct.textContent  = '0%';
}