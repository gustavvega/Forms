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
  if(s.includes('fuera')||s.includes('atencion')) return 'status-en-atencion';
  if(s.includes('repuesto')) return 'status-pendiente-repuesto';
  if(s.includes('seguimiento')||s.includes('observaciones')) return 'status-seguimiento';
  if(s.includes('cerrado')||s.includes('sin pendientes')||s.includes('operativo')) return 'status-cerrado';
  if(s.includes('administracion')) return 'status-administracion';
  if(s.includes('pendiente')) return 'status-pendiente';
  return 'status-neutral';
}

function isYes(value){
  const s=norm(value).trim();
  return s==='si'||s==='sí'||s==='yes'||s==='true';
}

function interventionsFor(av){
  return INTERVENCIONES.filter(i=>i.AV===av).sort((a,b)=>(b.FechaIntervencion||'').toString().localeCompare((a.FechaIntervencion||'').toString()));
}

function caseNeedsSpare(c){
  if(norm(c.EstadoGestion).includes('repuesto')) return true;
  const latest=interventionsFor(c.AV)[0];
  return !!latest && (isYes(latest.RequiereRepuestos) || norm(latest.EstadoFinalEquipo).includes('repuesto'));
}

function caseNeedsFollowup(c){
  if(norm(c.EstadoGestion).includes('seguimiento')) return true;
  const latest=interventionsFor(c.AV)[0];
  return !!latest && isYes(latest.RequiereNuevaIntervencion) && !caseNeedsSpare(c);
}

function functionalState(c){
  const latest=interventionsFor(c.AV)[0];
  const state=(latest&&latest.EstadoFinalEquipo)||c.EstadoEquipo||'';
  if(norm(state).includes('repuesto')) return 'Estado funcional no especificado';
  if(norm(state).includes('fuera')) return '🔴 Fuera de servicio';
  if(norm(state).includes('observaciones')) return '🟡 Operativo con observaciones';
  if(norm(state).includes('operativo')) return '🟢 Operativo';
  return state||'Estado funcional no especificado';
}

function managementState(c){
  if(caseNeedsSpare(c)) return '🟠 Pendiente de repuesto';
  if(caseNeedsFollowup(c)) return '🔵 Requiere seguimiento';
  const s=norm(c.EstadoGestion);
  if(s==='cerrado') return '🟢 Sin pendientes';
  if(s.includes('atencion')) return '🔴 En atención';
  if(s.includes('seguimiento')) return '🔵 Requiere seguimiento';
  return c.EstadoGestion||'Sin estado de gestión';
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
  const pending=cases.filter(c=>managementState(c)!=='🟢 Sin pendientes');
  const pool=pending.length?pending:cases;
  return [...pool].sort((a,b)=>(b.Fecha||'').toString().localeCompare((a.Fecha||'').toString()))[0];
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
  const fuera=equipment.filter(e=>e.cases.some(c=>norm(functionalState(c)).includes('fuera'))).length;
  const repuesto=equipment.filter(e=>e.cases.some(caseNeedsSpare)).length;
  const seguimiento=equipment.filter(e=>e.cases.some(caseNeedsFollowup)).length;
  const clean=equipment.filter(e=>e.cases.every(c=>managementState(c)==='🟢 Sin pendientes')).length;
  summaryEl.innerHTML=`
    <button class="summary-card summary-action ${quickFilter==='fuera'?'active':''}" data-filter="fuera" type="button">
      <div class="label">Fuera de servicio</div><div class="value">${fuera}</div><div class="hint">Ver equipos</div>
    </button>
    <button class="summary-card summary-action ${quickFilter==='repuesto'?'active':''}" data-filter="repuesto" type="button">
      <div class="label">Pendiente de repuesto</div><div class="value">${repuesto}</div><div class="hint">Ver equipos</div>
    </button>
    <button class="summary-card summary-action ${quickFilter==='seguimiento'?'active':''}" data-filter="seguimiento" type="button">
      <div class="label">Requiere seguimiento</div><div class="value">${seguimiento}</div><div class="hint">Ver equipos</div>
    </button>
    <button class="summary-card summary-action ${quickFilter==='clean'?'active':''}" data-filter="clean" type="button">
      <div class="label">Sin pendientes</div><div class="value">${clean}</div><div class="hint">Ver equipos</div>
    </button>`;
  summaryEl.querySelectorAll('[data-filter]').forEach(btn=>btn.addEventListener('click',()=>setQuickFilter(btn.dataset.filter)));
}

function matchesQuickFilter(e){
  if(!quickFilter) return true;
  if(quickFilter==='fuera') return e.cases.some(c=>norm(functionalState(c)).includes('fuera'));
  if(quickFilter==='repuesto') return e.cases.some(caseNeedsSpare);
  if(quickFilter==='seguimiento') return e.cases.some(caseNeedsFollowup);
  if(quickFilter==='clean') return e.cases.every(c=>managementState(c)==='🟢 Sin pendientes');
  return true;
}

function render(){
  const q=norm(searchEl.value.trim());
  const status=statusEl.value;
  const modality=modalityEl.value;
  const allEquipment=groupEquipment();
  const equipment=allEquipment.filter(e=>{
    const interventionText=e.cases.flatMap(c=>interventionsFor(c.AV).flatMap(i=>[i.TrabajoRealizado,i.RepuestosRequeridos,i.Observaciones]));
    const hit=!q || [e.Alias,e.Equipo,e.Activo,e.Modalidad,...e.cases.flatMap(c=>[c.Alias,c.AV,c.Descripcion,c.TipoIncidente,c.MensajeError,c.EstadoGestion,functionalState(c),managementState(c)]),...interventionText].some(x=>norm(x).includes(q));
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
    const fState=functionalState(current);
    const mState=managementState(current);
    const cls=statusClass(fState);

    node.querySelector('.equipment-name').textContent=e.Alias||e.Equipo;
    node.querySelector('.equipment-meta').textContent=`${e.Equipo} · ${e.Modalidad} · Activo ${e.Activo}`;
    node.querySelector('.status-dot').classList.add(cls);
    node.querySelector('.status-pill').classList.add(cls);
    node.querySelector('.status-pill').textContent=fState;
    node.querySelector('.current-state').innerHTML=`<b>Estado del equipo:</b> ${esc(fState)}<br><b>Gestión:</b> <span class="${statusClass(mState)}">${esc(mState)}</span>`;

    const cases=node.querySelector('.cases');
    [...e.cases].sort((a,b)=>(b.Fecha||'').toString().localeCompare((a.Fecha||'').toString())).forEach(c=>{
      const interventions=interventionsFor(c.AV);
      const f=functionalState(c);
      const m=managementState(c);
      const latest=interventions[0];
      const div=document.createElement('div');
      div.className='case';
      div.innerHTML=`
        <div class="case-top"><div class="case-av">${esc(c.AV)}</div><div class="case-date">${esc(c.Fecha)}</div></div>
        <div class="case-description">
          <b>Estado del equipo:</b> <span class="${statusClass(f)}">${esc(f)}</span><br>
          <b>Gestión:</b> <span class="${statusClass(m)}">${esc(m)}</span><br>
          ${esc(c.Descripcion||c.TipoIncidente||'Sin descripción pública.')}
        </div>
        ${c.MensajeError?`<div class="error-box"><b>⚠️ Error reportado</b><br>${esc(c.MensajeError)}</div>`:''}
        ${caseNeedsSpare(c)?`<div class="spare-box"><b>🟠 Repuesto pendiente</b>${latest&&latest.RepuestosRequeridos?`<br>${esc(latest.RepuestosRequeridos)}`:''}</div>`:''}
        <div class="interventions">${interventions.length?interventions.map(i=>`
          <div class="intervention">
            <b>${esc(i.FechaIntervencion)}</b> · ${esc(i.TipoMantenimiento)} · ${esc(i.EstadoFinalEquipo)}<br>
            ${esc(i.TrabajoRealizado)}
            ${isYes(i.RequiereRepuestos)?`<div class="spare-box"><b>🟠 Repuesto requerido</b>${i.RepuestosRequeridos?`<br>${esc(i.RepuestosRequeridos)}`:''}</div>`:''}
          </div>`).join(''):'<div class="intervention">Sin intervenciones registradas.</div>'}</div>`;
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
