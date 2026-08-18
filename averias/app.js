let AVERIAS = [];
let INTERVENCIONES = [];
let quickFilter = '';

const searchEl=document.getElementById('search');
const statusEl=document.getElementById('statusFilter');
const modalityEl=document.getElementById('modalityFilter');
const listEl=document.getElementById('equipmentList');
const countEl=document.getElementById('resultCount');
const summaryEl=document.getElementById('summary');
const clearBtn=document.getElementById('clearBtn');
const template=document.getElementById('equipmentTemplate');

const norm=s=>(s||'').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const esc=s=>(s||'').toString().replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));

function statusClass(status){
  const s=norm(status);
  if(s.includes('cerrado')||s.includes('sin averias abiertas')) return 'status-cerrado';
  if(s.includes('repuesto')) return 'status-pendiente-repuesto';
  if(s.includes('atencion')||s.includes('fuera')) return 'status-en-atencion';
  if(s.includes('seguimiento')||s.includes('observaciones')) return 'status-seguimiento';
  if(s.includes('administracion')) return 'status-administracion';
  if(s.includes('pendiente')) return 'status-pendiente';
  return 'status-neutral';
}

function groupEquipment(){
  const map=new Map();
  AVERIAS.forEach(a=>{
    const key=a.Activo||a.Equipo;
    if(!map.has(key)) map.set(key,{Activo:a.Activo,Alias:a.Alias||'',Equipo:a.Equipo,Modalidad:a.Modalidad,cases:[]});
    map.get(key).cases.push(a);
  });
  return Array.from(map.values());
}

function currentCase(cases){
  const open=cases.filter(c=>norm(c.EstadoGestion)!=='cerrado');
  const pool=open.length?open:cases;
  return [...pool].sort((a,b)=>(b.Fecha||'').localeCompare(a.Fecha||''))[0];
}

function populateModalities(){
  modalityEl.innerHTML='<option value="">Todas las modalidades</option>';
  [...new Set(AVERIAS.map(a=>a.Modalidad).filter(Boolean))].sort().forEach(m=>{
    const o=document.createElement('option');o.value=m;o.textContent=m;modalityEl.appendChild(o);
  });
}

function setQuickFilter(type){
  quickFilter = quickFilter===type ? '' : type;
  render();
}

function renderSummary(equipment){
  const open=equipment.filter(e=>e.cases.some(c=>norm(c.EstadoGestion)!=='cerrado')).length;
  const repuesto=equipment.filter(e=>e.cases.some(c=>norm(c.EstadoGestion).includes('repuesto'))).length;
  const closed=equipment.filter(e=>e.cases.every(c=>norm(c.EstadoGestion)==='cerrado')).length;
  summaryEl.innerHTML=`
    <button class="summary-card summary-action ${quickFilter==='open'?'active':''}" data-filter="open" type="button">
      <div class="label">Con reporte abierto</div><div class="value">${open}</div><div class="hint">Ver equipos</div>
    </button>
    <button class="summary-card summary-action ${quickFilter==='repuesto'?'active':''}" data-filter="repuesto" type="button">
      <div class="label">Pendiente de repuesto</div><div class="value">${repuesto}</div><div class="hint">Ver equipos</div>
    </button>
    <button class="summary-card summary-action ${quickFilter==='closed'?'active':''}" data-filter="closed" type="button">
      <div class="label">Sin averías abiertas</div><div class="value">${closed}</div><div class="hint">Ver equipos</div>
    </button>`;
  summaryEl.querySelectorAll('[data-filter]').forEach(btn=>btn.addEventListener('click',()=>setQuickFilter(btn.dataset.filter)));
}

function matchesQuickFilter(e){
  const openCases=e.cases.filter(c=>norm(c.EstadoGestion)!=='cerrado');
  if(!quickFilter) return true;
  if(quickFilter==='open') return openCases.length>0;
  if(quickFilter==='repuesto') return openCases.some(c=>norm(c.EstadoGestion).includes('repuesto'));
  if(quickFilter==='closed') return openCases.length===0;
  return true;
}

function render(){
  const q=norm(searchEl.value.trim());
  const status=statusEl.value;
  const modality=modalityEl.value;
  const allEquipment=groupEquipment();
  const equipment=allEquipment.filter(e=>{
    const hit=!q || [e.Alias,e.Equipo,e.Activo,e.Modalidad,...e.cases.flatMap(c=>[c.Alias,c.AV,c.Descripcion,c.TipoIncidente,c.EstadoGestion])].some(x=>norm(x).includes(q));
    const statusHit=!status || e.cases.some(c=>c.EstadoGestion===status);
    const modHit=!modality || e.Modalidad===modality;
    return hit&&statusHit&&modHit&&matchesQuickFilter(e);
  });

  renderSummary(allEquipment);
  countEl.textContent=`${equipment.length} ${equipment.length===1?'equipo':'equipos'}`;
  listEl.innerHTML='';

  if(!equipment.length){
    listEl.innerHTML='<div class="empty">No se encontraron equipos o expedientes con esos criterios.</div>';
    return;
  }

  equipment.sort((a,b)=>(a.Alias||a.Equipo).localeCompare(b.Alias||b.Equipo)).forEach(e=>{
    const node=template.content.firstElementChild.cloneNode(true);
    const current=currentCase(e.cases);
    const openCases=e.cases.filter(c=>norm(c.EstadoGestion)!=='cerrado');
    const state=openCases.length?current.EstadoGestion:'Sin averías abiertas';
    const cls=openCases.length?statusClass(state):'status-cerrado';

    node.querySelector('.equipment-name').textContent=e.Alias||e.Equipo;
    node.querySelector('.equipment-meta').textContent=`${e.Equipo} · ${e.Modalidad} · Activo ${e.Activo}`;
    node.querySelector('.status-dot').classList.add(cls);
    node.querySelector('.status-pill').classList.add(cls);
    node.querySelector('.status-pill').textContent=openCases.length?state:'🟢 Sin averías abiertas';
    node.querySelector('.current-state').innerHTML=openCases.length
      ? `<b>Estado actual:</b> ${esc(current.EstadoEquipo||current.EstadoGestion)} · <b>${openCases.length}</b> expediente(s) abierto(s).`
      : '<b>Estado actual:</b> 🟢 No hay averías abiertas para este equipo.';

    const cases=node.querySelector('.cases');
    [...e.cases].sort((a,b)=>(b.Fecha||'').localeCompare(a.Fecha||'')).forEach(c=>{
      const interventions=INTERVENCIONES.filter(i=>i.AV===c.AV).sort((a,b)=>(b.FechaIntervencion||'').localeCompare(a.FechaIntervencion||''));
      const div=document.createElement('div');
      div.className='case';
      div.innerHTML=`
        <div class="case-top"><div class="case-av">${esc(c.AV)}</div><div class="case-date">${esc(c.Fecha)}</div></div>
        <div class="case-description"><b class="${statusClass(c.EstadoGestion)}">${esc(c.EstadoGestion)}</b><br>${esc(c.Descripcion||c.TipoIncidente||'Sin descripción pública.')}</div>
        <div class="interventions">${interventions.length?interventions.map(i=>`<div class="intervention"><b>${esc(i.FechaIntervencion)}</b> · ${esc(i.TipoMantenimiento)} · ${esc(i.EstadoFinalEquipo)}<br>${esc(i.TrabajoRealizado)}</div>`).join(''):'<div class="intervention">Sin intervenciones registradas.</div>'}</div>`;
      cases.appendChild(div);
    });

    const header=node.querySelector('.equipment-header');
    const detail=node.querySelector('.equipment-detail');
    header.addEventListener('click',()=>{
      const open=node.classList.toggle('open');
      detail.hidden=!open;
    });
    listEl.appendChild(node);
  });
}

async function loadData(){
  try{
    const [averiasRes,intervencionesRes]=await Promise.all([
      fetch('./data/averias.json',{cache:'no-store'}),
      fetch('./data/intervenciones.json',{cache:'no-store'})
    ]);
    if(!averiasRes.ok||!intervencionesRes.ok) throw new Error('No se pudieron cargar los datos');
    AVERIAS=await averiasRes.json();
    INTERVENCIONES=await intervencionesRes.json();
    populateModalities();
    render();
  }catch(err){
    console.error(err);
    listEl.innerHTML='<div class="empty">No fue posible cargar el estado de los equipos. Intente nuevamente en unos minutos.</div>';
    countEl.textContent='Sin datos';
    summaryEl.innerHTML='';
  }
}

[searchEl,statusEl,modalityEl].forEach(el=>el.addEventListener(el===searchEl?'input':'change',render));
clearBtn.addEventListener('click',()=>{searchEl.value='';statusEl.value='';modalityEl.value='';quickFilter='';render();searchEl.focus();});

loadData();
