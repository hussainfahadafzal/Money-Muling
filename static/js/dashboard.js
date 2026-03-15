

function scoreColor(s) {
  if (s >= 75) return '#f43f5e';
  if (s >= 40) return '#f59e0b';
  if (s >  0)  return '#10b981';
  return '#374151';
}

function scoreTierTag(s) {
  if (s >= 75) return '<span class="tag tag-red">HIGH</span>';
  if (s >= 40) return '<span class="tag tag-amber">MEDIUM</span>';
  return '<span class="tag tag-green">LOW</span>';
}

function patternColor(p) {
  if (p.includes('cycle'))   return '#06b6d4';
  if (p.includes('fan'))     return '#f43f5e';
  if (p.includes('layer'))   return '#f59e0b';
  if (p.includes('hub'))     return '#8b5cf6';
  return '#475569';
}

// ── Load data ── 
let DATA = null;
try {
  const raw = sessionStorage.getItem('riftResult');
  if (raw) DATA = JSON.parse(raw);
} catch (_) {}

// ── Tab switching ── 
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

/* ── Filter chips ── */
document.querySelectorAll('.filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    if (DATA) renderRingsTable(DATA.fraud_rings, chip.dataset.filter);
  });
});

// ── Graph toolbar ── 
let cy = null;

document.getElementById('btn-fit').addEventListener('click', () => cy && cy.fit(undefined, 40));

document.getElementById('btn-all').addEventListener('click', () => {
  if (!cy) return;
  cy.elements().style('display', 'element');
});

document.getElementById('btn-suspicious').addEventListener('click', () => {
  if (!cy) return;
  cy.nodes().forEach(n => n.style('display', n.data('suspicious') ? 'element' : 'none'));
  cy.edges().forEach(e => {
    const show = e.source().style('display') === 'element' && e.target().style('display') === 'element';
    e.style('display', show ? 'element' : 'none');
  });
});

// ── Download ── 
document.getElementById('btn-download').addEventListener('click', () => {
  if (!DATA) return;
  const blob = new Blob([JSON.stringify({
    suspicious_accounts: DATA.suspicious_accounts,
    fraud_rings:         DATA.fraud_rings,
    summary:             DATA.summary,
  }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'fraud_report.json';
  a.click();
});

// ── Main render ──
if (DATA) {
  document.getElementById('graph-empty').style.display = 'none';
  renderAll(DATA);
}

function renderAll(d) {
  const s = d.summary;

  // Topbar meta 
  document.getElementById('tb-accounts').textContent = s.total_accounts_analyzed;
  document.getElementById('tb-txns').textContent     = s.total_transactions;
  document.getElementById('tb-rings').textContent    = s.fraud_rings_detected;
  document.getElementById('tb-time').textContent     = s.processing_time_seconds + 's';

  // Mini stats 
  document.getElementById('ms-flagged').textContent  = s.suspicious_accounts_flagged;
  document.getElementById('ms-rings').textContent    = s.fraud_rings_detected;
  document.getElementById('ms-accounts').textContent = s.total_accounts_analyzed;
  document.getElementById('ms-time').textContent     = s.processing_time_seconds;

  // Breakdown bars 
  const maxR = Math.max(s.cycle_rings, s.smurfing_rings, s.layering_rings, s.hub_nodes, 1);
  [
    ['br-cycle',  s.cycle_rings,    '#06b6d4'],
    ['br-smurf',  s.smurfing_rings, '#f43f5e'],
    ['br-layer',  s.layering_rings, '#f59e0b'],
    ['br-hub',    s.hub_nodes,      '#8b5cf6'],
  ].forEach(([id, val, color]) => {
    const el = document.getElementById(id);
    if (el) { el.style.width = (val / maxR * 100) + '%'; el.style.background = color; }
    const cnt = document.getElementById(id.replace('br-', 'cnt-'));
    if (cnt) cnt.textContent = val;
  });

  // Account list
  const list = document.getElementById('acct-list');
  list.innerHTML = '';
  const top = d.suspicious_accounts.slice(0, 25);
  if (top.length === 0) {
    list.innerHTML = '<div style="font-family:var(--mono);font-size:11px;color:var(--text3);padding:8px 0">No suspicious accounts detected.</div>';
  }
  top.forEach(a => {
    const row = document.createElement('div');
    row.className = 'acct-row';
    row.dataset.id = a.account_id;
    row.innerHTML = `
      <span class="acct-id">${a.account_id}</span>
      ${scoreTierTag(a.suspicion_score)}
    `;
    row.addEventListener('click', () => focusNode(a.account_id));
    list.appendChild(row);
  });

  // Rings table 
  renderRingsTable(d.fraud_rings, 'all');

  //    Graph 
  renderGraph(d.graph, d.suspicious_accounts);
}

// ── Rings Table ──
function renderRingsTable(rings, filter) {
  const tbody = document.getElementById('rings-tbody');
  const filtered = filter === 'all' ? rings : rings.filter(r => r.pattern_type === filter);

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text3)">No rings match this filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(r => `
    <tr>
      <td class="ring-id-cell">${r.ring_id}</td>
      <td><span class="tag tag-cyan" style="font-size:9px">${r.pattern_type}</span></td>
      <td style="color:var(--text)">${r.member_accounts.length}</td>
      <td>${scoreTierTag(r.risk_score)}</td>
    </tr>
  `).join('');
}

// ── Cytoscape Graph ── 
function renderGraph(graphData, suspicious) {
  const suspMap = {};
  suspicious.forEach(a => { suspMap[a.account_id] = a; });

  // Cap nodes for performance 
  const nodes = graphData.nodes.slice(0, 600).map(n => ({
    data: {
      id: n.id,
      score: suspMap[n.id] ? suspMap[n.id].suspicion_score : (n.score || 0),
      suspicious: n.suspicious,
      in_ring:    n.in_ring,
      in_degree:  n.in_degree,
      out_degree: n.out_degree,
      patterns:   n.patterns || [],
    }
  }));

  const nodeSet = new Set(nodes.map(n => n.data.id));
  const edges = graphData.edges
    .filter(e => nodeSet.has(e.source) && nodeSet.has(e.target))
    .slice(0, 2000)
    .map(e => ({
      data: { id: `${e.source}__${e.target}`, source: e.source, target: e.target, weight: e.weight }
    }));

  cy = cytoscape({
    container: document.getElementById('cy'),
    elements: { nodes, edges },
    style: [
      {
        selector: 'node',
        style: {
          'background-color': n => scoreColor(n.data('score')),
          'border-color':     n => n.data('in_ring') ? '#ffffff' : 'transparent',
          'border-width':     n => n.data('in_ring') ? 2 : 0,
          width:  n => n.data('score') >= 75 ? 30 : n.data('score') >= 40 ? 20 : 11,
          height: n => n.data('score') >= 75 ? 30 : n.data('score') >= 40 ? 20 : 11,
          label:  n => n.data('suspicious') ? n.data('id') : '',
          'font-family': 'JetBrains Mono',
          'font-size': '8px',
          color: '#f1f5f9',
          'text-valign': 'bottom',
          'text-margin-y': 5,
          'text-outline-width': 2,
          'text-outline-color': '#04060f',
          'min-zoomed-font-size': 5,
        }
      },
      {
        selector: 'edge',
        style: {
          'curve-style': 'bezier',
          'target-arrow-shape': 'triangle',
          'target-arrow-color': '#1a2235',
          'line-color': '#1a2235',
          width: 1, opacity: 0.55,
        }
      },
      {
        selector: 'node:selected',
        style: { 'border-color': '#06b6d4', 'border-width': 3 }
      },
    ],
    layout: {
      name: 'cose',
      animate: false,
      nodeRepulsion: 4500,
      idealEdgeLength: 90,
      gravity: 0.25,
      numIter: 500,
    }
  });

  // Node click → detail panel 
  cy.on('tap', 'node', evt => {
    showNodeDetail(evt.target.data());
    highlightListItem(evt.target.data('id'));
  });

  // Background click → clear detail 
  cy.on('tap', evt => {
    if (evt.target === cy) clearNodeDetail();
  });
}

// ── Focus a node programmatically ── 
function focusNode(id) {
  if (!cy) return;
  const node = cy.getElementById(id);
  if (node.length) {
    cy.animate({ fit: { eles: node, padding: 100 } }, { duration: 400 });
    node.select();
    showNodeDetail(node.data());
    highlightListItem(id);
    // Switch to node detail tab 
    document.querySelector('[data-tab="tab-node"]').click();
  }
}

function highlightListItem(id) {
  document.querySelectorAll('.acct-row').forEach(r => {
    r.classList.toggle('selected', r.dataset.id === id);
  });
}

// ── Node Detail ── 
function showNodeDetail(data) {
  document.getElementById('nd-empty').style.display   = 'none';
  document.getElementById('nd-content').style.display = 'block';

  document.getElementById('nd-id').textContent    = data.id;
  document.getElementById('nd-score-val').textContent = data.score.toFixed(1);
  document.getElementById('nd-score-val').style.color = scoreColor(data.score);

  const ring = document.getElementById('nd-ring');
  ring.style.borderColor = scoreColor(data.score);

  document.getElementById('nd-in').textContent  = data.in_degree;
  document.getElementById('nd-out').textContent = data.out_degree;

  const tierEl = document.getElementById('nd-tier');
  tierEl.innerHTML = scoreTierTag(data.score);

  const pats = document.getElementById('nd-patterns');
  pats.innerHTML = '';
  (data.patterns || []).forEach(p => {
    const c = patternColor(p);
    pats.innerHTML += `<span class="tag" style="background:${c}18;color:${c};border:1px solid ${c}33;font-size:10px">${p}</span>`;
  });
  if (!data.patterns || data.patterns.length === 0) {
    pats.innerHTML = '<span style="font-family:var(--mono);font-size:10px;color:var(--text3)">No patterns detected</span>';
  }
}

function clearNodeDetail() {
  document.getElementById('nd-empty').style.display   = 'flex';
  document.getElementById('nd-content').style.display = 'none';
  document.querySelectorAll('.acct-row').forEach(r => r.classList.remove('selected'));


function scoreColor(s) {
  if (s >= 75) return '#f43f5e';
  if (s >= 40) return '#f59e0b';
  if (s >  0)  return '#10b981';
  return '#374151';
}

function scoreTierTag(s) {
  if (s >= 75) return '<span class="tag tag-red">HIGH</span>';
  if (s >= 40) return '<span class="tag tag-amber">MEDIUM</span>';
  return '<span class="tag tag-green">LOW</span>';
}

function patternColor(p) {
  if (p.includes('cycle'))   return '#06b6d4';
  if (p.includes('fan'))     return '#f43f5e';
  if (p.includes('layer'))   return '#f59e0b';
  if (p.includes('hub'))     return '#8b5cf6';
  return '#475569';
}

// ── Load data ── 
let DATA = null;
try {
  const raw = sessionStorage.getItem('riftResult');
  if (raw) DATA = JSON.parse(raw);
} catch (_) {}

// ── Tab switching ── 
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

/* ── Filter chips ── */
document.querySelectorAll('.filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    if (DATA) renderRingsTable(DATA.fraud_rings, chip.dataset.filter);
  });
});

// ── Graph toolbar ── 
let cy = null;

document.getElementById('btn-fit').addEventListener('click', () => cy && cy.fit(undefined, 40));

document.getElementById('btn-all').addEventListener('click', () => {
  if (!cy) return;
  cy.elements().style('display', 'element');
});

document.getElementById('btn-suspicious').addEventListener('click', () => {
  if (!cy) return;
  cy.nodes().forEach(n => n.style('display', n.data('suspicious') ? 'element' : 'none'));
  cy.edges().forEach(e => {
    const show = e.source().style('display') === 'element' && e.target().style('display') === 'element';
    e.style('display', show ? 'element' : 'none');
  });
});

// ── Download ── 
document.getElementById('btn-download').addEventListener('click', () => {
  if (!DATA) return;
  const blob = new Blob([JSON.stringify({
    suspicious_accounts: DATA.suspicious_accounts,
    fraud_rings:         DATA.fraud_rings,
    summary:             DATA.summary,
  }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'fraud_report.json';
  a.click();
});

// ── Main render ──
if (DATA) {
  document.getElementById('graph-empty').style.display = 'none';
  renderAll(DATA);
}

function renderAll(d) {
  const s = d.summary;

  // Topbar meta 
  document.getElementById('tb-accounts').textContent = s.total_accounts_analyzed;
  document.getElementById('tb-txns').textContent     = s.total_transactions;
  document.getElementById('tb-rings').textContent    = s.fraud_rings_detected;
  document.getElementById('tb-time').textContent     = s.processing_time_seconds + 's';

  // Mini stats 
  document.getElementById('ms-flagged').textContent  = s.suspicious_accounts_flagged;
  document.getElementById('ms-rings').textContent    = s.fraud_rings_detected;
  document.getElementById('ms-accounts').textContent = s.total_accounts_analyzed;
  document.getElementById('ms-time').textContent     = s.processing_time_seconds;

  // Breakdown bars 
  const maxR = Math.max(s.cycle_rings, s.smurfing_rings, s.layering_rings, s.hub_nodes, 1);
  [
    ['br-cycle',  s.cycle_rings,    '#06b6d4'],
    ['br-smurf',  s.smurfing_rings, '#f43f5e'],
    ['br-layer',  s.layering_rings, '#f59e0b'],
    ['br-hub',    s.hub_nodes,      '#8b5cf6'],
  ].forEach(([id, val, color]) => {
    const el = document.getElementById(id);
    if (el) { el.style.width = (val / maxR * 100) + '%'; el.style.background = color; }
    const cnt = document.getElementById(id.replace('br-', 'cnt-'));
    if (cnt) cnt.textContent = val;
  });

  // Account list
  const list = document.getElementById('acct-list');
  list.innerHTML = '';
  const top = d.suspicious_accounts.slice(0, 25);
  if (top.length === 0) {
    list.innerHTML = '<div style="font-family:var(--mono);font-size:11px;color:var(--text3);padding:8px 0">No suspicious accounts detected.</div>';
  }
  top.forEach(a => {
    const row = document.createElement('div');
    row.className = 'acct-row';
    row.dataset.id = a.account_id;
    row.innerHTML = `
      <span class="acct-id">${a.account_id}</span>
      ${scoreTierTag(a.suspicion_score)}
    `;
    row.addEventListener('click', () => focusNode(a.account_id));
    list.appendChild(row);
  });

  // Rings table 
  renderRingsTable(d.fraud_rings, 'all');

  //    Graph 
  renderGraph(d.graph, d.suspicious_accounts);
}

// ── Rings Table ──
function renderRingsTable(rings, filter) {
  const tbody = document.getElementById('rings-tbody');
  const filtered = filter === 'all' ? rings : rings.filter(r => r.pattern_type === filter);

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text3)">No rings match this filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(r => `
    <tr>
      <td class="ring-id-cell">${r.ring_id}</td>
      <td><span class="tag tag-cyan" style="font-size:9px">${r.pattern_type}</span></td>
      <td style="color:var(--text)">${r.member_accounts.length}</td>
      <td>${scoreTierTag(r.risk_score)}</td>
    </tr>
  `).join('');
}

// ── Cytoscape Graph ── 
function renderGraph(graphData, suspicious) {
  const suspMap = {};
  suspicious.forEach(a => { suspMap[a.account_id] = a; });

  // Cap nodes for performance 
  const nodes = graphData.nodes.slice(0, 600).map(n => ({
    data: {
      id: n.id,
      score: suspMap[n.id] ? suspMap[n.id].suspicion_score : (n.score || 0),
      suspicious: n.suspicious,
      in_ring:    n.in_ring,
      in_degree:  n.in_degree,
      out_degree: n.out_degree,
      patterns:   n.patterns || [],
    }
  }));

  const nodeSet = new Set(nodes.map(n => n.data.id));
  const edges = graphData.edges
    .filter(e => nodeSet.has(e.source) && nodeSet.has(e.target))
    .slice(0, 2000)
    .map(e => ({
      data: { id: `${e.source}__${e.target}`, source: e.source, target: e.target, weight: e.weight }
    }));

  cy = cytoscape({
    container: document.getElementById('cy'),
    elements: { nodes, edges },
    style: [
      {
        selector: 'node',
        style: {
          'background-color': n => scoreColor(n.data('score')),
          'border-color':     n => n.data('in_ring') ? '#ffffff' : 'transparent',
          'border-width':     n => n.data('in_ring') ? 2 : 0,
          width:  n => n.data('score') >= 75 ? 30 : n.data('score') >= 40 ? 20 : 11,
          height: n => n.data('score') >= 75 ? 30 : n.data('score') >= 40 ? 20 : 11,
          label:  n => n.data('suspicious') ? n.data('id') : '',
          'font-family': 'JetBrains Mono',
          'font-size': '8px',
          color: '#f1f5f9',
          'text-valign': 'bottom',
          'text-margin-y': 5,
          'text-outline-width': 2,
          'text-outline-color': '#04060f',
          'min-zoomed-font-size': 5,
        }
      },
      {
        selector: 'edge',
        style: {
          'curve-style': 'bezier',
          'target-arrow-shape': 'triangle',
          'target-arrow-color': '#1a2235',
          'line-color': '#1a2235',
          width: 1, opacity: 0.55,
        }
      },
      {
        selector: 'node:selected',
        style: { 'border-color': '#06b6d4', 'border-width': 3 }
      },
    ],
    layout: {
      name: 'cose',
      animate: false,
      nodeRepulsion: 4500,
      idealEdgeLength: 90,
      gravity: 0.25,
      numIter: 500,
    }
  });

  // Node click → detail panel 
  cy.on('tap', 'node', evt => {
    showNodeDetail(evt.target.data());
    highlightListItem(evt.target.data('id'));
  });

  // Background click → clear detail 
  cy.on('tap', evt => {
    if (evt.target === cy) clearNodeDetail();
  });
}

// ── Focus a node programmatically ── 
function focusNode(id) {
  if (!cy) return;
  const node = cy.getElementById(id);
  if (node.length) {
    cy.animate({ fit: { eles: node, padding: 100 } }, { duration: 400 });
    node.select();
    showNodeDetail(node.data());
    highlightListItem(id);
    // Switch to node detail tab 
    document.querySelector('[data-tab="tab-node"]').click();
  }
}

function highlightListItem(id) {
  document.querySelectorAll('.acct-row').forEach(r => {
    r.classList.toggle('selected', r.dataset.id === id);
  });
}

// ── Node Detail ── 
function showNodeDetail(data) {
  document.getElementById('nd-empty').style.display   = 'none';
  document.getElementById('nd-content').style.display = 'block';

  document.getElementById('nd-id').textContent    = data.id;
  document.getElementById('nd-score-val').textContent = data.score.toFixed(1);
  document.getElementById('nd-score-val').style.color = scoreColor(data.score);

  const ring = document.getElementById('nd-ring');
  ring.style.borderColor = scoreColor(data.score);

  document.getElementById('nd-in').textContent  = data.in_degree;
  document.getElementById('nd-out').textContent = data.out_degree;

  const tierEl = document.getElementById('nd-tier');
  tierEl.innerHTML = scoreTierTag(data.score);

  const pats = document.getElementById('nd-patterns');
  pats.innerHTML = '';
  (data.patterns || []).forEach(p => {
    const c = patternColor(p);
    pats.innerHTML += `<span class="tag" style="background:${c}18;color:${c};border:1px solid ${c}33;font-size:10px">${p}</span>`;
  });
  if (!data.patterns || data.patterns.length === 0) {
    pats.innerHTML = '<span style="font-family:var(--mono);font-size:10px;color:var(--text3)">No patterns detected</span>';
  }
}

function clearNodeDetail() {
  document.getElementById('nd-empty').style.display   = 'flex';
  document.getElementById('nd-content').style.display = 'none';
  document.querySelectorAll('.acct-row').forEach(r => r.classList.remove('selected'));
}
}