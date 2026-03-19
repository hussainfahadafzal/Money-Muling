/* ── RIFT 2026 Dashboard JS — MuleNet style ── */

/* ── Color helpers ── */
function nColor(s){if(s>=75)return'#ef4444';if(s>=40)return'#f59e0b';if(s>0)return'#10b981';return'#2a3a55'}
function nBorder(s){if(s>=75)return'rgba(239,68,68,0.5)';if(s>=40)return'rgba(245,158,11,0.5)';if(s>0)return'rgba(16,185,129,0.4)';return'rgba(42,58,85,0.6)'}
function nSize(s){if(s>=75)return 30;if(s>=40)return 22;if(s>0)return 16;return 10}
function pColor(p){
  if(p.includes('cycle'))  return{c:'#06b6d4',bg:'rgba(6,182,212,0.1)',bd:'rgba(6,182,212,0.25)'};
  if(p.includes('fan_in')) return{c:'#ef4444',bg:'rgba(239,68,68,0.1)',bd:'rgba(239,68,68,0.25)'};
  if(p.includes('fan_out'))return{c:'#f97316',bg:'rgba(249,115,22,0.1)',bd:'rgba(249,115,22,0.25)'};
  if(p.includes('layer'))  return{c:'#f59e0b',bg:'rgba(245,158,11,0.1)',bd:'rgba(245,158,11,0.25)'};
  if(p.includes('hub'))    return{c:'#8b5cf6',bg:'rgba(139,92,246,0.1)',bd:'rgba(139,92,246,0.25)'};
  return{c:'#64748b',bg:'rgba(100,116,139,0.1)',bd:'rgba(100,116,139,0.25)'};
}
function rtColor(t){
  if(t==='cycle')   return{c:'#06b6d4',bg:'rgba(6,182,212,0.1)',  bd:'rgba(6,182,212,0.25)'};
  if(t==='fan_in')  return{c:'#ef4444',bg:'rgba(239,68,68,0.1)',  bd:'rgba(239,68,68,0.25)'};
  if(t==='fan_out') return{c:'#f97316',bg:'rgba(249,115,22,0.1)', bd:'rgba(249,115,22,0.25)'};
  if(t==='layering')return{c:'#f59e0b',bg:'rgba(245,158,11,0.1)', bd:'rgba(245,158,11,0.25)'};
  return{c:'#8b5cf6',bg:'rgba(139,92,246,0.1)',bd:'rgba(139,92,246,0.25)'};
}

/* ── Data ── */
let DATA=null;
try{const r=sessionStorage.getItem('riftResult');if(r)DATA=JSON.parse(r);}catch(_){}

/* ── Navigation ── */
function navTo(page){
  document.querySelectorAll('.nb-link').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id==='page-'+page));
  // Lazy init charts when analytics is opened
  if(page==='analytics'&&DATA) initCharts(DATA);
  if(page==='dashboard'&&DATA&&!cy) renderGraph(DATA.graph, DATA.suspicious_accounts);
}

document.querySelectorAll('.nb-link').forEach(b=>{
  b.addEventListener('click',()=>navTo(b.dataset.page));
});

/* ── Tabs ── */
document.querySelectorAll('.tab').forEach(b=>{
  b.addEventListener('click',()=>{
    const parent=b.closest('.detail-card');
    parent.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    parent.querySelectorAll('.tab-pane').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    document.getElementById(b.dataset.tab).classList.add('active');
  });
});

/* ── Ring filter chips ── */
document.querySelectorAll('.fchip').forEach(c=>{
  c.addEventListener('click',()=>{
    document.querySelectorAll('.fchip').forEach(x=>x.classList.remove('active'));
    c.classList.add('active');
    if(DATA)renderRings(DATA.fraud_rings,c.dataset.filter);
  });
});

/* ── Cytoscape ── */
let cy=null;

/* ── Graph toolbar ── */
document.getElementById('btn-fit').onclick       = ()=>cy&&cy.fit(undefined,48);
document.getElementById('btn-all').onclick       = ()=>{if(!cy)return;cy.elements().style('display','element');cy.fit(undefined,48);};
document.getElementById('btn-sus2').onclick      = ()=>{
  if(!cy)return;
  cy.batch(()=>{
    cy.nodes().forEach(n=>n.style('display',n.data('suspicious')?'element':'none'));
    cy.edges().forEach(e=>e.style('display',
      e.source().style('display')==='element'&&e.target().style('display')==='element'?'element':'none'));
  });
  setTimeout(()=>cy.fit(cy.nodes(':visible'),48),30);
};
document.getElementById('btn-rings-only').onclick = ()=>{
  if(!cy)return;
  cy.batch(()=>{
    cy.nodes().forEach(n=>n.style('display',n.data('in_ring')?'element':'none'));
    cy.edges().forEach(e=>e.style('display',
      e.source().style('display')==='element'&&e.target().style('display')==='element'?'element':'none'));
  });
  setTimeout(()=>cy.fit(cy.nodes(':visible'),48),30);
};

/* ── Search ── */
document.getElementById('g-search-input').addEventListener('input',e=>{
  if(!cy)return;
  const q=e.target.value.trim().toLowerCase();
  if(!q){cy.elements().style('display','element');return;}
  cy.batch(()=>{
    cy.nodes().forEach(n=>n.style('display',n.data('id').toLowerCase().includes(q)?'element':'none'));
    cy.edges().forEach(e=>e.style('display',
      e.source().style('display')==='element'&&e.target().style('display')==='element'?'element':'none'));
  });
  const vis=cy.nodes(':visible');
  if(vis.length===1){cy.animate({fit:{eles:vis,padding:120}},{duration:350});showDetail(vis.first().data());}
});

/* ── Download ── */
// Download is on analyze page — handled in index.js logic, but also wire up here if button exists
document.addEventListener('click',e=>{
  if(e.target.id==='btn-dl'&&DATA){
    const blob=new Blob([JSON.stringify({suspicious_accounts:DATA.suspicious_accounts,fraud_rings:DATA.fraud_rings,summary:DATA.summary},null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='rift_fraud_report.json';a.click();
  }
});

/* ── Main render ── */
if(DATA){
  document.getElementById('g-empty').style.display='none';
  renderAll(DATA);
  // Set status badge
  const st=document.getElementById('nb-status-text');
  if(st)st.textContent='Analysis Active';
}

function renderAll(d){
  const s=d.summary;

  /* Home stats */
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  set('hs-sus',s.suspicious_accounts_flagged);
  set('hs-rng',s.fraud_rings_detected);
  set('hs-acc',s.total_accounts_analyzed);
  set('hs-tim',s.processing_time_seconds);

  /* Home account list */
  const hal=document.getElementById('home-acct-list');
  if(hal){
    hal.innerHTML='';
    d.suspicious_accounts.slice(0,8).forEach(a=>{
      const c=nColor(a.suspicion_score);
      const tier=a.suspicion_score>=75?'HIGH':a.suspicion_score>=40?'MED':'LOW';
      const bc=a.suspicion_score>=75?'badge-red':a.suspicion_score>=40?'badge-amber':'badge-green';
      hal.innerHTML+=`<div class="activity-item">
        <div class="ai-left">
          <div class="ai-dot" style="background:${c}"></div>
          <div><div class="ai-text">${a.account_id}</div>
          <div class="ai-sub">${(a.detected_patterns||[]).join(', ')||'—'}</div></div>
        </div>
        <span class="ai-badge ${bc}" style="border:1px solid">${a.suspicion_score.toFixed(0)}</span>
      </div>`;
    });
  }

  /* Home breakdown */
  const hbd=document.getElementById('home-breakdown');
  if(hbd){
    const max=Math.max(s.cycle_rings,s.smurfing_rings,s.layering_rings,s.hub_nodes,1);
    const rows=[['Cycle rings',s.cycle_rings,'#06b6d4'],['Smurfing rings',s.smurfing_rings,'#ef4444'],
                ['Layering rings',s.layering_rings,'#f59e0b'],['Hub nodes',s.hub_nodes,'#8b5cf6']];
    hbd.innerHTML=rows.map(([lbl,val,c])=>`
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:12px;color:var(--text2);width:110px;flex-shrink:0">${lbl}</span>
        <div style="flex:1;height:6px;background:var(--card2);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${(val/max*100)}%;background:${c};border-radius:3px;transition:width 0.7s ease"></div>
        </div>
        <span style="font-family:var(--mono);font-size:11px;font-weight:700;color:var(--text1);width:24px;text-align:right">${val}</span>
      </div>`).join('');
  }

  /* Rings table */
  renderRingsTable(d.fraud_rings);

  /* Rings panel */
  renderRings(d.fraud_rings,'all');

  /* Graph */
  renderGraph(d.graph,d.suspicious_accounts);
}

/* ── Rings panel (dashboard page) ── */
function renderRings(rings,filter){
  const list=document.getElementById('rings-list');
  if(!list)return;
  const f=filter==='all'?rings:rings.filter(r=>r.pattern_type.includes(filter));
  if(!f.length){list.innerHTML='<div style="font-family:var(--mono);font-size:11px;color:var(--text3);padding:16px;text-align:center">No rings.</div>';return;}
  list.innerHTML=f.map(r=>{
    const ts=rtColor(r.pattern_type),sc=nColor(r.risk_score);
    return `<div class="ring-card" onclick="hlRing(${JSON.stringify(r.member_accounts)})">
      <div class="rc-top"><span class="rc-id">${r.ring_id}</span><span class="rc-score" style="color:${sc}">${r.risk_score.toFixed(1)}</span></div>
      <div class="rc-bot">
        <span class="rc-type" style="color:${ts.c};background:${ts.bg};border-color:${ts.bd}">${r.pattern_type}</span>
        <span class="rc-members">${r.member_accounts.length} members</span>
      </div>
      <div class="rc-bar-track"><div class="rc-bar-fill" style="width:${r.risk_score}%;background:${sc}"></div></div>
    </div>`;
  }).join('');
}

/* ── Rings table (rings page) ── */
function renderRingsTable(rings){
  const tbody=document.getElementById('rings-table-body');
  if(!tbody)return;
  if(!rings.length){tbody.innerHTML='<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text3);font-family:var(--mono);font-size:11px">No fraud rings detected.</td></tr>';return;}
  const tierBadge=(s)=>s>=75?'badge-red':s>=40?'badge-amber':'badge-green';
  tbody.innerHTML=rings.map(r=>`
    <tr>
      <td class="td-mono td-cyan">${r.ring_id}</td>
      <td><span class="badge badge-cyan">${r.pattern_type}</span></td>
      <td class="td-mono">${r.member_accounts.length}</td>
      <td><span class="badge ${tierBadge(r.risk_score)}">${r.risk_score.toFixed(1)}</span></td>
      <td style="font-family:var(--mono);font-size:10px;color:var(--text2);max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.member_accounts.slice(0,5).join(', ')}${r.member_accounts.length>5?' …':''}</td>
    </tr>`).join('');
}

/* ── Cytoscape ── */
function renderGraph(gd,sus){
  const sm={};sus.forEach(a=>{sm[a.account_id]=a.suspicion_score;});
  const nodes=gd.nodes.slice(0,700).map(n=>({
    data:{id:n.id,score:sm[n.id]??(n.score||0),suspicious:n.suspicious,in_ring:n.in_ring,
          in_degree:n.in_degree,out_degree:n.out_degree,patterns:n.patterns||[]}
  }));
  const ns=new Set(nodes.map(n=>n.data.id));
  const edges=gd.edges.filter(e=>ns.has(e.source)&&ns.has(e.target)).slice(0,2000)
    .map(e=>({data:{id:`${e.source}__${e.target}`,source:e.source,target:e.target}}));

  document.getElementById('g-n').textContent=nodes.length;
  document.getElementById('g-e').textContent=edges.length;

  cy=cytoscape({
    container:document.getElementById('cy'),
    elements:{nodes,edges},
    style:[
      {selector:'node',style:{
        'background-color':n=>nColor(n.data('score')),
        'border-width':n=>n.data('in_ring')?3:1.5,
        'border-color':n=>n.data('in_ring')?'#06b6d4':nBorder(n.data('score')),
        'shadow-blur':n=>n.data('suspicious')?20:0,
        'shadow-color':n=>nColor(n.data('score')),
        'shadow-opacity':n=>n.data('suspicious')?0.7:0,
        'shadow-offset-x':0,'shadow-offset-y':0,
        width:n=>nSize(n.data('score')),height:n=>nSize(n.data('score')),
        label:n=>n.data('suspicious')?n.data('id'):'',
        'font-family':'"JetBrains Mono",monospace',
        'font-size':'9px','font-weight':600,color:'#f0f4ff',
        'text-valign':'bottom','text-halign':'center','text-margin-y':5,
        'text-outline-width':2.5,'text-outline-color':'#0f0f13',
        'min-zoomed-font-size':6,
      }},
      {selector:'edge',style:{
        'curve-style':'bezier','line-color':'#2a3a55',
        'target-arrow-shape':'triangle','target-arrow-color':'#2a3a55',
        'arrow-scale':0.8,width:1.5,opacity:0.7,
      }},
      {selector:'node:selected',style:{'border-width':3,'border-color':'#06b6d4','shadow-blur':24,'shadow-color':'#06b6d4','shadow-opacity':1}},
      {selector:'.hl-edge', style:{'line-color':'#06b6d4','target-arrow-color':'#06b6d4',width:2.5,opacity:1,'z-index':10}},
      {selector:'.ring-edge',style:{'line-color':'#ef4444','target-arrow-color':'#ef4444',width:3,opacity:1,'z-index':10}},
      {selector:'.dim',style:{opacity:0.07}},
    ],
    layout:{name:'cose',animate:false,nodeRepulsion:5000,idealEdgeLength:90,gravity:0.25,numIter:600,randomize:true},
    wheelSensitivity:0.25,minZoom:0.05,maxZoom:10,
  });

  cy.on('tap','node',evt=>{
    const n=evt.target;showDetail(n.data());dimExcept(n);setRow(n.data('id'));
    document.querySelector('[data-tab="t-node"]').click();
  });
  cy.on('tap',evt=>{
    if(evt.target!==cy)return;
    cy.elements().removeClass('dim hl-edge ring-edge');
    clearDetail();
  });
}

function dimExcept(node){
  cy.elements().removeClass('dim hl-edge ring-edge');
  cy.elements().not(node.neighborhood().add(node)).addClass('dim');
  node.connectedEdges().addClass('hl-edge');
}
function focusNode(id){
  if(!cy)return;
  const n=cy.getElementById(id);if(!n.length)return;
  cy.elements().style('display','element');
  cy.animate({fit:{eles:n.neighborhood().add(n),padding:80}},{duration:350});
  n.select();showDetail(n.data());dimExcept(n);
  document.querySelector('[data-tab="t-node"]').click();
  navTo('dashboard');
}
function hlRing(members){
  if(!cy)return;
  cy.elements().style('display','element');cy.elements().removeClass('dim hl-edge ring-edge');
  const ms=new Set(members.map(String));
  cy.nodes().forEach(n=>{if(!ms.has(String(n.data('id'))))n.addClass('dim');});
  cy.edges().forEach(e=>{
    const si=ms.has(String(e.source().data('id'))),di=ms.has(String(e.target().data('id')));
    if(si&&di)e.addClass('ring-edge');else e.addClass('dim');
  });
  const vis=cy.nodes().filter(n=>!n.hasClass('dim'));
  if(vis.length)cy.animate({fit:{eles:vis,padding:80}},{duration:350});
}
function setRow(id){
  document.querySelectorAll('.acct-row').forEach(r=>r.classList.toggle('active',r.dataset.id===id));
}
function showDetail(data){
  document.getElementById('nd-empty').style.display='none';
  document.getElementById('nd-detail').classList.add('show');
  const s=data.score||0;
  const C=163.4,arc=document.getElementById('d-arc');
  arc.style.strokeDashoffset=C-(s/100)*C;arc.style.stroke=nColor(s);
  const dsc=document.getElementById('d-score');dsc.textContent=s.toFixed(1);dsc.style.color=nColor(s);
  document.getElementById('d-id').textContent=data.id;
  document.getElementById('d-in').textContent=data.in_degree;
  document.getElementById('d-out').textContent=data.out_degree;
  document.getElementById('d-tot').textContent=data.in_degree+data.out_degree;
  document.getElementById('d-ring').textContent=data.in_ring?'✓ Yes':'No';
  const rs=document.getElementById('d-risk');
  rs.className='nd-risk '+(s>=75?'risk-h':s>=40?'risk-m':'risk-l');
  rs.textContent=s>=75?'🔴 HIGH RISK':s>=40?'🟡 MEDIUM RISK':'🟢 LOW RISK';
  const pc=document.getElementById('d-pats');pc.innerHTML='';
  (data.patterns||[]).forEach(p=>{const{c,bg,bd}=pColor(p);pc.innerHTML+=`<span class="pc" style="color:${c};background:${bg};border-color:${bd}">${p}</span>`;});
  if(!data.patterns?.length)pc.innerHTML='<span style="font-size:10px;color:var(--text3)">None</span>';
}
function clearDetail(){
  document.getElementById('nd-empty').style.display='flex';
  document.getElementById('nd-detail').classList.remove('show');
}

/* ── Analytics Charts ── */
let chartsInited=false;
const CHART_DEFAULTS={
  color:'#8892a4',
  plugins:{legend:{display:false},tooltip:{
    backgroundColor:'#1a1a24',borderColor:'rgba(255,255,255,0.1)',borderWidth:1,
    titleColor:'#f0f4ff',bodyColor:'#8892a4',
    titleFont:{family:'JetBrains Mono',size:11},bodyFont:{family:'JetBrains Mono',size:10},
  }},
};

function initCharts(d){
  if(chartsInited)return;
  chartsInited=true;
  Chart.defaults.color='#8892a4';
  Chart.defaults.font.family='Inter';

  /* 1. Score distribution bar chart */
  const buckets=['0-10','10-20','20-30','30-40','40-50','50-60','60-70','70-80','80-90','90-100'];
  const counts=new Array(10).fill(0);
  (d.suspicious_accounts||[]).forEach(a=>{
    const idx=Math.min(Math.floor(a.suspicion_score/10),9);
    counts[idx]++;
  });
  // also count non-suspicious nodes
  (d.graph.nodes||[]).forEach(n=>{
    if(!n.suspicious){const idx=Math.min(Math.floor((n.score||0)/10),9);counts[idx]++;}
  });
  new Chart(document.getElementById('chart-score-dist'),{
    type:'bar',
    data:{labels:buckets,datasets:[{data:counts,backgroundColor:'#ef4444',borderRadius:4,borderSkipped:false}]},
    options:{...CHART_DEFAULTS,scales:{
      x:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{font:{family:'JetBrains Mono',size:10}}},
      y:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{font:{family:'JetBrains Mono',size:10}}},
    }},
  });

  /* 2. Lifecycle donut */
  const high=d.suspicious_accounts.filter(a=>a.suspicion_score>=75).length;
  const med =d.suspicious_accounts.filter(a=>a.suspicion_score>=40&&a.suspicion_score<75).length;
  const low =d.graph.nodes.filter(n=>!n.suspicious).length;
  new Chart(document.getElementById('chart-lifecycle'),{
    type:'doughnut',
    data:{
      labels:['High Risk','Active Medium','Dormant/Normal'],
      datasets:[{data:[high,med,low],backgroundColor:['#ef4444','#f59e0b','#2a3a55'],borderColor:'transparent',borderWidth:0,hoverOffset:8}],
    },
    options:{
      ...CHART_DEFAULTS,
      plugins:{...CHART_DEFAULTS.plugins,legend:{display:true,position:'right',labels:{color:'#8892a4',font:{family:'JetBrains Mono',size:10},boxWidth:12,padding:14}}},
      cutout:'65%',
    },
  });

  /* 3. Top patterns horizontal bar */
  const patCount={};
  (d.suspicious_accounts||[]).forEach(a=>{
    (a.detected_patterns||[]).forEach(p=>{patCount[p]=(patCount[p]||0)+1;});
  });
  const sorted=Object.entries(patCount).sort((a,b)=>b[1]-a[1]).slice(0,8);
  new Chart(document.getElementById('chart-patterns'),{
    type:'bar',
    data:{
      labels:sorted.map(x=>x[0]),
      datasets:[{data:sorted.map(x=>x[1]),backgroundColor:'#3b82f6',borderRadius:4,borderSkipped:false}],
    },
    options:{
      ...CHART_DEFAULTS,
      indexAxis:'y',
      scales:{
        x:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{font:{family:'JetBrains Mono',size:10}}},
        y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{font:{family:'JetBrains Mono',size:10}}},
      },
    },
  });

  /* 4. Ring size vs risk score scatter */
  const pts=(d.fraud_rings||[]).map(r=>({x:r.member_accounts.length,y:r.risk_score}));
  new Chart(document.getElementById('chart-scatter'),{
    type:'scatter',
    data:{datasets:[{data:pts,backgroundColor:'rgba(245,158,11,0.7)',pointRadius:5,pointHoverRadius:7}]},
    options:{
      ...CHART_DEFAULTS,
      scales:{
        x:{title:{display:true,text:'Ring Size',color:'#8892a4',font:{family:'JetBrains Mono',size:10}},grid:{color:'rgba(255,255,255,0.05)'},ticks:{font:{family:'JetBrains Mono',size:10}}},
        y:{title:{display:true,text:'Risk Score',color:'#8892a4',font:{family:'JetBrains Mono',size:10}},grid:{color:'rgba(255,255,255,0.05)'},ticks:{font:{family:'JetBrains Mono',size:10}}},
      },
    },
  });
}

/* ══════════════════════════════════════════════════════
   ANALYZE PAGE — Upload logic (uses dsh- prefixed IDs
   so it never conflicts with index.html)
══════════════════════════════════════════════════════ */
(function(){
  const dropZone  = document.getElementById('dsh-drop-zone');
  const fileInput = document.getElementById('dsh-file-input');
  const chosen    = document.getElementById('dsh-drop-chosen');
  const btn       = document.getElementById('dsh-analyze-btn');
  const errBox    = document.getElementById('dsh-error-box');
  const progWrap  = document.getElementById('dsh-progress-wrap');
  const progFill  = document.getElementById('dsh-progress-fill');
  const progText  = document.getElementById('dsh-progress-text');
  const progPct   = document.getElementById('dsh-progress-pct');
  const btnLabel  = document.getElementById('dsh-btn-label');

  // Elements only exist on dashboard page — bail if not found
  if(!dropZone) return;

  let file = null;

  dropZone.addEventListener('click', ()=>fileInput.click());
  dropZone.addEventListener('dragover', e=>{ e.preventDefault(); dropZone.classList.add('over'); });
  dropZone.addEventListener('dragleave', ()=>dropZone.classList.remove('over'));
  dropZone.addEventListener('drop', e=>{
    e.preventDefault(); dropZone.classList.remove('over');
    const f = e.dataTransfer.files[0];
    if(f && f.name.toLowerCase().endsWith('.csv')) setFile(f);
    else showErr('Only .csv files are accepted.');
  });
  fileInput.addEventListener('change', ()=>{ if(fileInput.files[0]) setFile(fileInput.files[0]); });

  function setFile(f){
    file = f;
    chosen.textContent = `✓  ${f.name}  ·  ${(f.size/1024).toFixed(1)} KB`;
    chosen.classList.add('show');
    btn.disabled = false;
    hideErr();
  }
  function showErr(msg){ errBox.textContent='⚠  '+msg; errBox.classList.add('show'); }
  function hideErr(){ errBox.classList.remove('show'); }

  const STEPS_FAST = ['Parsing CSV…','Validating schema…','Building directed graph…','Running cycle detection…','Detecting smurfing patterns…','Analyzing shell networks…','Scoring suspicion levels…'];
  const STEPS_SLOW = ['Graph traversal in progress…','Computing suspicion scores…','Finalizing ring detection…','Still working, please wait…','Almost there…'];

  btn.addEventListener('click', async ()=>{
    if(!file) return;
    btn.disabled = true; hideErr();
    progWrap.classList.add('show');
    btnLabel.textContent = 'Analyzing…';

    let pct=0, stepFast=0, stepSlow=0;
    const startTime = Date.now();

    const fastTicker = setInterval(()=>{
      if(pct>=75){ clearInterval(fastTicker); return; }
      pct = Math.min(pct + Math.random()*7+3, 75);
      progFill.style.width = pct+'%';
      progPct.textContent  = Math.round(pct)+'%';
      progText.textContent = STEPS_FAST[Math.min(stepFast++, STEPS_FAST.length-1)];
    }, 350);

    const slowTicker = setInterval(()=>{
      if(pct<75) return;
      const elapsed = Math.round((Date.now()-startTime)/1000);
      if(pct<95){ pct=Math.min(pct+0.3,95); progFill.style.width=pct+'%'; progPct.textContent=Math.round(pct)+'%'; }
      progText.textContent = `${STEPS_SLOW[stepSlow%STEPS_SLOW.length]}  (${elapsed}s elapsed)`;
      stepSlow++;
    }, 1200);

    try {
      const form = new FormData();
      form.append('file', file);
      const res  = await fetch('/analyze', { method:'POST', body:form });
      const json = await res.json();
      clearInterval(fastTicker); clearInterval(slowTicker);

      if(json.status !== 'ok'){
        progWrap.classList.remove('show');
        progFill.style.width='0%';
        showErr(json.message || 'Analysis failed.');
        btn.disabled = false;
        btnLabel.textContent = '▶ Run Analysis';
        return;
      }

      try { sessionStorage.setItem('riftResult', JSON.stringify(json.data)); }
      catch(e){ const slim={...json.data,graph:{nodes:json.data.graph.nodes,edges:[]}};
                sessionStorage.setItem('riftResult', JSON.stringify(slim)); }

      progFill.style.width='100%'; progPct.textContent='100%'; progText.textContent='✓  Complete!';

      // Load data into dashboard without page reload
      DATA = json.data;
      document.getElementById('g-empty').style.display='none';
      renderAll(DATA);
      const st=document.getElementById('nb-status-text');
      if(st) st.textContent='Analysis Active';

      setTimeout(()=>navTo('home'), 600);

    } catch(err){
      clearInterval(fastTicker); clearInterval(slowTicker);
      progWrap.classList.remove('show');
      showErr('Network error — please try again.');
      btn.disabled = false;
      btnLabel.textContent = '▶ Run Analysis';
    }
  });
})();