/* ── Analyze Page Upload Logic ── */
if (document.getElementById('drop-zone')) {

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

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('over');
  const f = e.dataTransfer.files[0];
  if (f && f.name.toLowerCase().endsWith('.csv')) setFile(f);
  else showErr('Only .csv files are accepted.');
});
fileInput.addEventListener('change', () => { if (fileInput.files[0]) setFile(fileInput.files[0]); });

function setFile(f) {
  file = f;
  chosen.textContent = `✓  ${f.name}  ·  ${(f.size / 1024).toFixed(1)} KB`;
  chosen.classList.add('show');
  analyzeBtn.disabled = false;
  hideErr();
}
function showErr(msg) { errorBox.textContent = '⚠  ' + msg; errorBox.classList.add('show'); }
function hideErr() { errorBox.classList.remove('show'); }

const STEPS_FAST = ['Parsing CSV…','Validating schema…','Building directed graph…','Running cycle detection…','Detecting smurfing patterns…','Analyzing shell networks…','Scoring suspicion levels…'];
const STEPS_SLOW = ['Graph traversal in progress…','Computing suspicion scores…','Finalizing ring detection…','Still working, please wait…','Almost there…'];

analyzeBtn.addEventListener('click', async () => {
  if (!file) return;
  analyzeBtn.disabled = true;
  hideErr();
  progWrap.classList.add('show');
  btnLabel.textContent = 'Analyzing…';

  let pct = 0, sf = 0, ss = 0;
  const t0 = Date.now();

  const fast = setInterval(() => {
    if (pct >= 75) { clearInterval(fast); return; }
    pct = Math.min(pct + Math.random() * 7 + 3, 75);
    progFill.style.width = pct + '%';
    progPct.textContent = Math.round(pct) + '%';
    progText.textContent = STEPS_FAST[Math.min(sf++, STEPS_FAST.length - 1)];
  }, 350);

  const slow = setInterval(() => {
    if (pct < 75) return;
    const elapsed = Math.round((Date.now() - t0) / 1000);
    if (pct < 95) { pct = Math.min(pct + 0.3, 95); progFill.style.width = pct + '%'; progPct.textContent = Math.round(pct) + '%'; }
    progText.textContent = `${STEPS_SLOW[ss % STEPS_SLOW.length]}  (${elapsed}s)`;
    ss++;
  }, 1200);

  try {
    const form = new FormData();
    form.append('file', file);
    const res  = await fetch('/analyze', { method: 'POST', body: form });
    const json = await res.json();
    clearInterval(fast); clearInterval(slow);

    if (json.status !== 'ok') {
      progWrap.classList.remove('show');
      progFill.style.width = '0%';
      showErr(json.message || 'Analysis failed.');
      analyzeBtn.disabled = false;
      btnLabel.textContent = '▶ Run Analysis';
      return;
    }

    // Save result
    try { sessionStorage.setItem('riftResult', JSON.stringify(json.data)); }
    catch(e) { const slim = {...json.data, graph:{nodes:json.data.graph.nodes,edges:[]}}; sessionStorage.setItem('riftResult', JSON.stringify(slim)); }

    // Save filename for history
    sessionStorage.setItem('riftFilename', file.name);

    progFill.style.width = '100%';
    progPct.textContent  = '100%';
    progText.textContent = '✓  Complete!';

    setTimeout(() => window.location.href = '/', 500);

  } catch (err) {
    clearInterval(fast); clearInterval(slow);
    progWrap.classList.remove('show');
    showErr('Network error — please try again.');
    analyzeBtn.disabled = false;
    btnLabel.textContent = '▶ Run Analysis';
  }
});

} // end guard