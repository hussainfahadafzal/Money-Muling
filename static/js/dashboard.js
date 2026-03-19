/* ── Dashboard Graph Page JS ── */

function nColor(s){if(s>=75)return'#ef4444';if(s>=40)return'#f59e0b';if(s>0)return'#10b981';return'#2a3a55'}
function nBorder(s){if(s>=75)return'rgba(239,68,68,0.5)';if(s>=40)return'rgba(245,158,11,0.5)';if(s>0)return'rgba(16,185,129,0.4)';return'rgba(42,58,85,0.5)'}
function nSize(s){if(s>=75)return 30;if(s>=40)return 22;if(s>0)return 16;return 10}
function pColor(p){
  if(p.includes('cycle'))  return{c:'#06b6d4',bg:'rgba(6,182,212,0.1)',  bd:'rgba(6,182,212,0.25)'};
  if(p.includes('fan_in')) return{c:'#ef4444',bg:'rgba(239,68,68,0.1)',  bd:'rgba(239,68,68,0.25)'};
  if(p.includes('fan_out'))return{c:'#f97316',bg:'rgba(249,115,22,0.1)', bd:'rgba(249,115,22,0.25)'};
  if(p.includes('layer'))  return{c:'#f59e0b',bg:'rgba(245,158,11,0.1)', bd:'rgba(245,158,11,0.25)'};
  if(p.includes('hub'))    return{c:'#8b5cf6',bg:'rgba(139,92,246,0.1)', bd:'rgba(139,92,246,0.25)'};
  return{c:'#64748b',bg:'rgba(100,116,139,0.1)',bd:'rgba(100,116,139,0.25)'};
}
function rtColor(t){
  if(t==='cycle')   return{c:'#06b6d4',bg:'rgba(6,182,212,0.1)',  bd:'rgba(6,182,212,0.25)'};
  if(t==='fan_in')  return{c:'#ef4444',bg:'rgba(239,68,68,0.1)',  bd:'rgba(239,68,68,0.25)'};
  if(t==='fan_out') return{c:'#f97316',bg:'rgba(249,115,22,0.1)', bd:'rgba(249,115,22,0.25)'};
  if(t==='layering')return{c:'#f59e0b',bg:'rgba(245,158,11,0.1)', bd:'rgba(245,158,11,0.25)'};
  return{c:'#8b5cf6',bg:'rgba(139,92,246,0.1)',bd:'rgba(139,92,246,0.25)'};
}

/* ── Load data ── */
let DATA = null;
try{ const r=sessionStorage.getItem('riftResult'); if(r) DATA=JSON.parse(r); }catch(_){}

/* ── Tabs ── */
document.querySelectorAll('.tab').forEach(b=>{
  b.addEventListener('click',()=>{
    b.closest('.right-panel').querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    b.closest('.right-panel').querySelectorAll('.tab-pane').forEach(x=>x.classList.remove('active'));
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

let cy = null;

/* ── Toolbar ── */
document.getElementById('btn-fit').onclick    = ()=>cy&&cy.fit(undefined,48);
document.getElementById('btn-all').onclick    = ()=>{ if(!cy)return; cy.elements().style('display','element'); cy.fit(undefined,48); };
document.getElementById('btn-sus').onclick    = ()=>{
  if(!cy)return;
  cy.batch(()=>{
    cy.nodes().forEach(n=>n.style('display',n.data('suspicious')?'element':'none'));
    cy.edges().forEach(e=>e.style('display', e.source().style('display')==='element'&&e.target().style('display')==='element'?'element':'none'));
  });
  setTimeout(()=>cy.fit(cy.nodes(':visible'),48),30);
};
document.getElementById('btn-rings').onclick  = ()=>{
  if(!cy)return;
  cy.batch(()=>{
    cy.nodes().forEach(n=>n.style('display',n.data('in_ring')?'element':'none'));
    cy.edges().forEach(e=>e.style('display', e.source().style('display')==='element'&&e.target().style('display')==='element'?'element':'none'));
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
    cy.edges().forEach(e=>e.style('display', e.source().style('display')==='element'&&e.target().style('display')==='element'?'element':'none'));
  });
  const vis=cy.nodes(':visible');
  if(vis.length===1){cy.animate({fit:{eles:vis,padding:120}},{duration:350}); showDetail(vis.first().data());}
});

/* ── Init ── */
if(DATA){
  document.getElementById('g-empty').style.display='none';
  const t=document.getElementById('rp-time');
  if(t) t.textContent=DATA.summary.processing_time_seconds+'s';
  renderRings(DATA.fraud_rings,'all');
  renderGraph(DATA.graph, DATA.suspicious_accounts);
}

/* ── Rings panel ── */
function renderRings(rings,filter){
  const list=document.getElementById('rings-list');
  const f=filter==='all'?rings:rings.filter(r=>r.pattern_type.includes(filter));
  if(!f.length){list.innerHTML='<div style="font-family:var(--mono);font-size:11px;color:var(--text3);padding:16px;text-align:center">No rings.</div>';return;}
  list.innerHTML=f.map(r=>{
    const ts=rtColor(r.pattern_type),sc=nColor(r.risk_score);
    return`<div class="rcard" onclick="hlRing(${JSON.stringify(r.member_accounts)})">
      <div class="rcard-top"><span class="rcard-id">${r.ring_id}</span><span class="rcard-score" style="color:${sc}">${r.risk_score.toFixed(1)}</span></div>
      <div class="rcard-bot"><span class="rcard-type" style="color:${ts.c};background:${ts.bg};border-color:${ts.bd}">${r.pattern_type}</span><span class="rcard-members">${r.member_accounts.length} members</span></div>
      <div class="rbar-track"><div class="rbar-fill" style="width:${r.risk_score}%;background:${sc}"></div></div>
    </div>`;
  }).join('');
}

/* ── Graph ── */
function renderGraph(gd,sus){
  const sm={};sus.forEach(a=>{sm[a.account_id]=a.suspicion_score;});
  const nodes=gd.nodes.slice(0,700).map(n=>({data:{id:n.id,score:sm[n.id]??(n.score||0),suspicious:n.suspicious,in_ring:n.in_ring,in_degree:n.in_degree,out_degree:n.out_degree,patterns:n.patterns||[]}}));
  const ns=new Set(nodes.map(n=>n.data.id));
  const edges=gd.edges.filter(e=>ns.has(e.source)&&ns.has(e.target)).slice(0,2000).map(e=>({data:{id:`${e.source}__${e.target}`,source:e.source,target:e.target}}));
  document.getElementById('g-n').textContent=nodes.length;
  document.getElementById('g-e').textContent=edges.length;
  cy=cytoscape({
    container:document.getElementById('cy'),
    elements:{nodes,edges},
    style:[
      {selector:'node',style:{
        'background-color':n=>nColor(n.data('score')),
        'border-width':n=>n.data('in_ring')?3:1.5,'border-color':n=>n.data('in_ring')?'#06b6d4':nBorder(n.data('score')),
        'shadow-blur':n=>n.data('suspicious')?20:0,'shadow-color':n=>nColor(n.data('score')),'shadow-opacity':n=>n.data('suspicious')?0.7:0,'shadow-offset-x':0,'shadow-offset-y':0,
        width:n=>nSize(n.data('score')),height:n=>nSize(n.data('score')),
        label:n=>n.data('suspicious')?n.data('id'):'',
        'font-family':'"JetBrains Mono",monospace','font-size':'9px','font-weight':600,color:'#f0f4ff',
        'text-valign':'bottom','text-halign':'center','text-margin-y':5,
        'text-outline-width':2.5,'text-outline-color':'#0f0f13','min-zoomed-font-size':6,
      }},
      {selector:'edge',style:{'curve-style':'bezier','line-color':'#2a3a55','target-arrow-shape':'triangle','target-arrow-color':'#2a3a55','arrow-scale':0.8,width:1.5,opacity:0.7}},
      {selector:'node:selected',style:{'border-width':3,'border-color':'#06b6d4','shadow-blur':24,'shadow-color':'#06b6d4','shadow-opacity':1}},
      {selector:'.hl-edge', style:{'line-color':'#06b6d4','target-arrow-color':'#06b6d4',width:2.5,opacity:1,'z-index':10}},
      {selector:'.ring-edge',style:{'line-color':'#ef4444','target-arrow-color':'#ef4444',width:3,opacity:1,'z-index':10}},
      {selector:'.dim',style:{opacity:0.07}},
    ],
    layout:{name:'cose',animate:false,nodeRepulsion:5000,idealEdgeLength:90,gravity:0.25,numIter:600,randomize:true},
    wheelSensitivity:0.25,minZoom:0.05,maxZoom:10,
  });
  cy.on('tap','node',evt=>{
    const n=evt.target; showDetail(n.data()); dimExcept(n);
    document.querySelector('[data-tab="t-node"]').click();
  });
  cy.on('tap',evt=>{ if(evt.target!==cy)return; cy.elements().removeClass('dim hl-edge ring-edge'); clearDetail(); });
}

function dimExcept(node){cy.elements().removeClass('dim hl-edge ring-edge');cy.elements().not(node.neighborhood().add(node)).addClass('dim');node.connectedEdges().addClass('hl-edge');}
function hlRing(members){
  if(!cy)return;
  cy.elements().style('display','element');cy.elements().removeClass('dim hl-edge ring-edge');
  const ms=new Set(members.map(String));
  cy.nodes().forEach(n=>{if(!ms.has(String(n.data('id'))))n.addClass('dim');});
  cy.edges().forEach(e=>{const si=ms.has(String(e.source().data('id'))),di=ms.has(String(e.target().data('id')));if(si&&di)e.addClass('ring-edge');else e.addClass('dim');});
  const vis=cy.nodes().filter(n=>!n.hasClass('dim'));
  if(vis.length)cy.animate({fit:{eles:vis,padding:80}},{duration:350});
}

function showDetail(data){
  document.getElementById('nd-empty').style.display='none';
  document.getElementById('nd-content').classList.add('show');
  const s=data.score||0,C=163.4,arc=document.getElementById('d-arc');
  arc.style.strokeDashoffset=C-(s/100)*C; arc.style.stroke=nColor(s);
  const dsc=document.getElementById('d-score'); dsc.textContent=s.toFixed(1); dsc.style.color=nColor(s);
  document.getElementById('d-id').textContent=data.id;
  document.getElementById('d-in').textContent=data.in_degree;
  document.getElementById('d-out').textContent=data.out_degree;
  document.getElementById('d-tot').textContent=data.in_degree+data.out_degree;
  document.getElementById('d-ring').textContent=data.in_ring?'✓ Yes':'No';
  const rs=document.getElementById('d-risk');
  rs.className='nd-risk '+(s>=75?'risk-h':s>=40?'risk-m':'risk-l');
  rs.textContent=s>=75?'🔴 HIGH RISK':s>=40?'🟡 MEDIUM RISK':'🟢 LOW RISK';
  const pc=document.getElementById('d-pats'); pc.innerHTML='';
  (data.patterns||[]).forEach(p=>{const{c,bg,bd}=pColor(p);pc.innerHTML+=`<span class="pc" style="color:${c};background:${bg};border-color:${bd}">${p}</span>`;});
  if(!data.patterns?.length) pc.innerHTML='<span style="font-size:9px;color:var(--text3)">None</span>';
}
function clearDetail(){
  document.getElementById('nd-empty').style.display='flex';
  document.getElementById('nd-content').classList.remove('show');
}