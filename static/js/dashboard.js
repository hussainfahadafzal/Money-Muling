/* ── RIFT 2026 Dashboard JS — dark theme ── */

/* ── Color helpers ── */
function nColor(s){if(s>=75)return'#f43f5e';if(s>=40)return'#f59e0b';if(s>0)return'#10b981';return'#2a3a55'}
function nBorder(s){if(s>=75)return'rgba(244,63,94,0.5)';if(s>=40)return'rgba(245,158,11,0.5)';if(s>0)return'rgba(16,185,129,0.4)';return'rgba(42,58,85,0.8)'}
function nSize(s){if(s>=75)return 30;if(s>=40)return 22;if(s>0)return 16;return 10}

function pColor(p){
  if(p.includes('cycle'))  return{c:'#06b6d4',bg:'rgba(6,182,212,0.1)',bd:'rgba(6,182,212,0.25)'};
  if(p.includes('fan_in')) return{c:'#f43f5e',bg:'rgba(244,63,94,0.1)',bd:'rgba(244,63,94,0.25)'};
  if(p.includes('fan_out'))return{c:'#f97316',bg:'rgba(249,115,22,0.1)',bd:'rgba(249,115,22,0.25)'};
  if(p.includes('layer'))  return{c:'#f59e0b',bg:'rgba(245,158,11,0.1)',bd:'rgba(245,158,11,0.25)'};
  if(p.includes('hub'))    return{c:'#8b5cf6',bg:'rgba(139,92,246,0.1)',bd:'rgba(139,92,246,0.25)'};
  return{c:'#64748b',bg:'rgba(100,116,139,0.1)',bd:'rgba(100,116,139,0.25)'};
}
function rtColor(t){
  if(t==='cycle')   return{c:'#06b6d4',bg:'rgba(6,182,212,0.1)',  bd:'rgba(6,182,212,0.25)'};
  if(t==='fan_in')  return{c:'#f43f5e',bg:'rgba(244,63,94,0.1)',  bd:'rgba(244,63,94,0.25)'};
  if(t==='fan_out') return{c:'#f97316',bg:'rgba(249,115,22,0.1)', bd:'rgba(249,115,22,0.25)'};
  if(t==='layering')return{c:'#f59e0b',bg:'rgba(245,158,11,0.1)', bd:'rgba(245,158,11,0.25)'};
  return{c:'#8b5cf6',bg:'rgba(139,92,246,0.1)',bd:'rgba(139,92,246,0.25)'};
}

/* ── Load data ── */
let DATA=null;
try{const r=sessionStorage.getItem('riftResult');if(r)DATA=JSON.parse(r);}catch(_){}

/* ── Tabs ── */
document.querySelectorAll('.tab').forEach(b=>{
  b.addEventListener('click',()=>{
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    document.getElementById(b.dataset.tab).classList.add('active');
  });
});

/* ── Filter chips ── */
document.querySelectorAll('.fchip').forEach(c=>{
  c.addEventListener('click',()=>{
    document.querySelectorAll('.fchip').forEach(x=>x.classList.remove('active'));
    c.classList.add('active');
    if(DATA) renderRings(DATA.fraud_rings, c.dataset.filter);
  });
});

/* ── Cy ref ── */
let cy=null;

/* ── Toolbar ── */
document.getElementById('btn-fit').onclick   = ()=>cy&&cy.fit(undefined,48);
document.getElementById('btn-all').onclick   = ()=>{if(!cy)return;cy.elements().style('display','element');cy.fit(undefined,48);};
document.getElementById('btn-sus2').onclick  = ()=>{
  if(!cy)return;
  cy.batch(()=>{
    cy.nodes().forEach(n=>n.style('display',n.data('suspicious')?'element':'none'));
    cy.edges().forEach(e=>e.style('display',
      e.source().style('display')==='element'&&e.target().style('display')==='element'?'element':'none'));
  });
  setTimeout(()=>cy.fit(cy.nodes(':visible'),48),30);
};
document.getElementById('btn-rings').onclick = ()=>{
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
document.getElementById('btn-dl').onclick=()=>{
  if(!DATA)return;
  const blob=new Blob([JSON.stringify({
    suspicious_accounts:DATA.suspicious_accounts,
    fraud_rings:DATA.fraud_rings,
    summary:DATA.summary,
  },null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='rift_fraud_report.json';a.click();
};

/* ── Render ── */
if(DATA){document.getElementById('g-empty').style.display='none';renderAll(DATA);}

function renderAll(d){
  const s=d.summary;

  /* Sidebar stats */
  document.getElementById('sc-sus').textContent=s.suspicious_accounts_flagged;
  document.getElementById('sc-rng').textContent=s.fraud_rings_detected;
  document.getElementById('sc-acc').textContent=s.total_accounts_analyzed;
  document.getElementById('sc-txn').textContent=s.total_transactions;

  /* Header time */
  const ht=document.getElementById('hdr-time');
  if(ht) ht.textContent=s.processing_time_seconds+'s';

  /* Ring bars */
  const mx=Math.max(s.cycle_rings,s.smurfing_rings,s.layering_rings,s.hub_nodes,1);
  [['rb-c','rv-c',s.cycle_rings],['rb-s','rv-s',s.smurfing_rings],
   ['rb-l','rv-l',s.layering_rings],['rb-h','rv-h',s.hub_nodes]].forEach(([b,v,n])=>{
    document.getElementById(b).style.width=(n/mx*100)+'%';
    document.getElementById(v).textContent=n;
  });

  /* Mobile stats */
  const mb={acc:s.total_accounts_analyzed,txn:s.total_transactions,
            sus:s.suspicious_accounts_flagged,rng:s.fraud_rings_detected,tim:s.processing_time_seconds};
  Object.entries(mb).forEach(([k,v])=>{const el=document.getElementById('mb-'+k);if(el)el.textContent=v;});

  /* Account list */
  const list=document.getElementById('acct-list');
  list.innerHTML='';
  const top=d.suspicious_accounts.slice(0,30);
  if(!top.length){list.innerHTML='<div style="font-family:var(--mono);font-size:10px;color:var(--text3)">None detected.</div>';}
  top.forEach(a=>{
    const row=document.createElement('div');
    row.className='acct-row';row.dataset.id=a.account_id;
    row.innerHTML=`<span class="acct-id">${a.account_id}</span>
                   <span class="acct-score" style="color:${nColor(a.suspicion_score)}">${a.suspicion_score.toFixed(0)}</span>`;
    row.addEventListener('click',()=>focusNode(a.account_id));
    list.appendChild(row);
  });

  renderRings(d.fraud_rings,'all');
  renderGraph(d.graph,d.suspicious_accounts);
}

/* ── Rings ── */
function renderRings(rings,filter){
  const list=document.getElementById('rings-list');
  const f=filter==='all'?rings:rings.filter(r=>r.pattern_type.includes(filter));
  if(!f.length){list.innerHTML='<div style="font-family:var(--mono);font-size:11px;color:var(--text3);padding:20px;text-align:center">No rings.</div>';return;}
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

/* ── Graph ── */
function renderGraph(gd,sus){
  const sm={};sus.forEach(a=>{sm[a.account_id]=a.suspicion_score;});

  const nodes=gd.nodes.slice(0,700).map(n=>({
    data:{id:n.id,score:sm[n.id]??(n.score||0),
          suspicious:n.suspicious,in_ring:n.in_ring,
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
      {
        selector:'node',
        style:{
          'background-color':   n=>nColor(n.data('score')),
          'border-width':       n=>n.data('in_ring')?3:1.5,
          'border-color':       n=>n.data('in_ring')?'#06b6d4':nBorder(n.data('score')),
          'border-opacity':     1,
          /* glow via shadow on suspicious nodes */
          'shadow-blur':        n=>n.data('suspicious')?20:0,
          'shadow-color':       n=>nColor(n.data('score')),
          'shadow-opacity':     n=>n.data('suspicious')?0.7:0,
          'shadow-offset-x':    0,
          'shadow-offset-y':    0,
          width:  n=>nSize(n.data('score')),
          height: n=>nSize(n.data('score')),
          label:  n=>n.data('suspicious')?n.data('id'):'',
          'font-family':'"JetBrains Mono",monospace',
          'font-size':'9px','font-weight':600,
          color:'#f1f5f9',
          'text-valign':'bottom','text-halign':'center','text-margin-y':5,
          'text-outline-width':2.5,'text-outline-color':'#0a0a0f',
          'min-zoomed-font-size':6,
        }
      },
      {
        selector:'edge',
        style:{
          'curve-style':'bezier',
          /* bright enough to see on dark bg */
          'line-color':'#2a3a55',
          'target-arrow-shape':'triangle',
          'target-arrow-color':'#2a3a55',
          'arrow-scale':0.8,
          width:1.5,opacity:0.7,
        }
      },
      {selector:'node:selected',style:{'border-width':3,'border-color':'#06b6d4','shadow-blur':24,'shadow-color':'#06b6d4','shadow-opacity':1}},
      {selector:'.hl-edge', style:{'line-color':'#06b6d4','target-arrow-color':'#06b6d4',width:2.5,opacity:1,'z-index':10}},
      {selector:'.ring-edge',style:{'line-color':'#f43f5e','target-arrow-color':'#f43f5e',width:3,opacity:1,'z-index':10}},
      {selector:'.dim',style:{opacity:0.08}},
    ],
    layout:{name:'cose',animate:false,nodeRepulsion:5000,idealEdgeLength:90,gravity:0.25,numIter:600,randomize:true},
    wheelSensitivity:0.25,minZoom:0.05,maxZoom:10,
  });

  cy.on('tap','node',evt=>{
    const n=evt.target;
    showDetail(n.data());dimExcept(n);setRow(n.data('id'));
    document.querySelector('[data-tab="t-node"]').click();
  });
  cy.on('tap',evt=>{
    if(evt.target!==cy)return;
    cy.elements().removeClass('dim hl-edge ring-edge');
    clearDetail();
    document.querySelectorAll('.acct-row').forEach(r=>r.classList.remove('active'));
  });
}

function dimExcept(node){
  cy.elements().removeClass('dim hl-edge ring-edge');
  cy.elements().not(node.neighborhood().add(node)).addClass('dim');
  node.connectedEdges().addClass('hl-edge');
}

function focusNode(id){
  if(!cy)return;
  const n=cy.getElementById(id);
  if(!n.length)return;
  cy.elements().style('display','element');
  cy.animate({fit:{eles:n.neighborhood().add(n),padding:80}},{duration:350});
  n.select();showDetail(n.data());dimExcept(n);setRow(id);
  document.querySelector('[data-tab="t-node"]').click();
}

function hlRing(members){
  if(!cy)return;
  cy.elements().style('display','element');
  cy.elements().removeClass('dim hl-edge ring-edge');
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
  const el=document.querySelector(`.acct-row[data-id="${id}"]`);
  if(el)el.scrollIntoView({block:'nearest'});
}

function showDetail(data){
  document.getElementById('nd-empty').style.display='none';
  document.getElementById('nd-detail').classList.add('show');
  const s=data.score||0;
  const C=175.9,arc=document.getElementById('d-arc');
  arc.style.strokeDashoffset=C-(s/100)*C;
  arc.style.stroke=nColor(s);
  document.getElementById('d-score').textContent=s.toFixed(1);
  document.getElementById('d-score').style.color=nColor(s);
  document.getElementById('d-id').textContent=data.id;
  document.getElementById('d-in').textContent=data.in_degree;
  document.getElementById('d-out').textContent=data.out_degree;
  document.getElementById('d-tot').textContent=data.in_degree+data.out_degree;
  document.getElementById('d-ring').textContent=data.in_ring?'✓ Yes':'No';
  const rs=document.getElementById('d-risk');
  rs.className='nd-risk '+(s>=75?'risk-h':s>=40?'risk-m':'risk-l');
  rs.textContent=s>=75?'🔴  HIGH RISK':s>=40?'🟡  MEDIUM RISK':'🟢  LOW RISK';
  const pc=document.getElementById('d-pats');
  pc.innerHTML='';
  (data.patterns||[]).forEach(p=>{
    const{c,bg,bd}=pColor(p);
    pc.innerHTML+=`<span class="pc" style="color:${c};background:${bg};border-color:${bd}">${p}</span>`;
  });
  if(!data.patterns?.length)pc.innerHTML='<span style="font-size:11px;color:var(--text3)">No patterns</span>';
}

function clearDetail(){
  document.getElementById('nd-empty').style.display='flex';
  document.getElementById('nd-detail').classList.remove('show');
}

/* ── Sidebar toggle (mobile/tablet) ── */
const sidenavEl=document.getElementById('sidenav');
const toggleBtn=document.getElementById('sidebar-toggle');
const arrowEl  =document.getElementById('sidebar-arrow');
if(toggleBtn&&sidenavEl){
  toggleBtn.addEventListener('click',()=>{
    const open=sidenavEl.classList.toggle('open');
    if(arrowEl)arrowEl.textContent=open?'▲':'▼';
  });
}