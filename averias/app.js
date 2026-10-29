let EQUIPOS = [];
let AVERIAS = [];
let INTERVENCIONES = [];
let quickFilter = '';

const searchEl=document.getElementById('search');
const statusEl=document.getElementById('statusFilter');
const modalityEl=document.getElementById('modalityFilter');
const listEl=document.getElementById('equipmentList');
const countEl=document.getElementById('resultCount');
const summaryEl=document.getElementById('summary');
const spareTableBody=document.getElementById('spareTableBody');
const spareCountEl=document.getElementById('spareCount');
const clearBtn=document.getElementById('clearBtn');
const template=document.getElementById('equipmentTemplate');

const norm=s=>(s||'').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const esc=s=>(s||'').toString().replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));

function formatDate(value){
  if(value===null||value===undefined||value==='') return 'Sin fecha';
  const raw=value.toString().trim();
  let d=null;

  if(/^\d+(\.\d+)?$/.test(raw)){
    const serial=Number(raw);
    d=new Date(Date.UTC(1899,11,30)+Math.floor(serial)*86400000);
  }else if(/^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/.test(raw)){
    const parts=raw.split(/[\/-]/).map(Number);
    d=new Date(Date.UTC(parts[2],parts[1]-1,parts[0]));
  }else{
    const parsed=new Date(raw);
    if(!Number.isNaN(parsed.getTime())) d=parsed;
  }

  if(!d||Number.isNaN(d.getTime())) return raw;
  const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const day=String(d.getUTCDate()).padStart(2,'0');
  return `${day}-${months[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}

function statusClass(status){
  const s=norm(status);
  if(s.includes('fuera')||s.includes('atencion')) return 'status-en-atencion';
  if(s.includes('repuesto')) return 'status-pendiente-repuesto';
  if(s.includes('seguimiento')||s.includes('observaciones')) return 'status-seguimiento';
  if(s.includes('cerrado')||s.includes('sin pendientes')||s.includes('operativo')||s.includes('sin reporte activo')) return 'status-cerrado';
  if(s.includes('administracion')) return 'status-administracion';
  if(s.includes('pendiente')) return 'status-pendiente';
  return 'status-neutral';
}

function isYes(value){
  const s=norm(value).trim();
  return s==='si'||s==='sí'||s==='yes'||s==='true';
}

function isRejectedCase(c){
  const s=norm(c&&c.EstadoGestion);
  return s.includes('no procede') || s.includes('duplicado');
}

function sanitizeAverias(rows){
  const valid=(Array.isArray(rows)?rows:[]).filter(c=>c&&!isRejectedCase(c)&&(c.AV||'').toString().trim()!=='');
  const byAV=new Map();
  valid.forEach(c=>{
    const av=(c.AV||'').toString().trim();
    if(!byAV.has(av)) byAV.set(av,[]);
    byAV.get(av).push(c);
  });

  const clean=[];
  byAV.forEach((items,av)=>{
    const equipmentKeys=new Set(items.map(c=>(c.Activo||c.Equipo||'').toString().trim()).filter(Boolean));
    if(equipmentKeys.size>1){
      console.warn(`AV ${av} aparece asociada a más de un equipo y fue ocultada por seguridad.`,items);
      return;
    }
    clean.push([...items].sort((a,b)=>(b.Fecha||'').toString().localeCompare((a.Fecha||'').toString()))[0]);
  });
  return clean;
}

function interventionsFor(av){
  if(!(av||'').toString().trim()) return [];
  return INTERVENCIONES
    .filter(i=>i.AV===av)
    .sort((a,b)=>(b.FechaIntervencion||'').toString().localeCompare((a.FechaIntervencion||'').toString()));
}

function isCaseOpen(c){
  if(!c||isRejectedCase(c)) return false;
  return norm(c.EstadoGestion).trim()!=='cerrado';
}

function caseNeedsSpare(c){
  if(!isCaseOpen(c)) return false;
  if(norm(c.EstadoGestion).includes('repuesto')) return true;
  const latest=interventionsFor(c.AV)[0];
  return !!latest&&(isYes(latest.RequiereRepuestos)||norm(latest.EstadoFinalEquipo).includes('repuesto'));
}

function caseNeedsFollowup(c){
  if(!isCaseOpen(c)) return false;
  if(norm(c.EstadoGestion).includes('seguimiento')) return true;
  const latest=interventionsFor(c.AV)[0];
  return !!latest&&isYes(latest.RequiereNuevaIntervencion)&&!caseNeedsSpare(c);
}

function functionalState(c){
  if(!c) return '🟢 Sin reporte activo';
  const latest=interventionsFor(c.AV)[0];
  const state=(latest&&latest.EstadoFinalEquipo)||c.EstadoEquipo||'';
  if(norm(state).includes('repuesto')) return 'Estado funcional no especificado';
  if(norm(state).includes('fuera')) return '🔴 Fuera de servicio';
  if(norm(state).includes('observaciones')) return '🟡 Operativo con observaciones';
  if(norm(state).includes('operativo')) return '🟢 Operativo';
  return state||'Estado funcional no especificado';
}

function managementState(c){
  if(!c) return '🟢 Sin pendientes';
  const s=norm(c.EstadoGestion).trim();
  if(s==='cerrado') return '🟢 Sin pendientes';
  if(caseNeedsSpare(c)) return '🟠 Pendiente de repuesto';
  if(caseNeedsFollowup(c)) return '🔵 Requiere seguimiento';
  if(s.includes('atencion')) return '🔴 En atención';
  if(s.includes('seguimiento')) return '🔵 Requiere seguimiento';
  return c.EstadoGestion||'Sin estado de gestión';
}

function pendingCasesFor(e){
  return (e&&Array.isArray(e.cases)?e.cases:[])
    .filter(isCaseOpen)
    .sort((a,b)=>Number(b.Fecha||0)-Number(a.Fecha||0));
}

function equipmentFunctionalState(e){
  if(!e) return 'Estado funcional no especificado';
  const cases=Array.isArray(e.cases)?e.cases:[];
  const latestCase=[...cases].sort((a,b)=>Number(b.Fecha||0)-Number(a.Fecha||0))[0]||null;
  const allInterventions=cases
    .flatMap(c=>interventionsFor(c.AV).map(i=>({...i,_av:c.AV})))
    .sort((a,b)=>Number(b.FechaIntervencion||0)-Number(a.FechaIntervencion||0));
  const latestIntervention=allInterventions[0]||null;

  const caseDate=latestCase?Number(latestCase.Fecha||0):0;
  const interventionDate=latestIntervention?Number(latestIntervention.FechaIntervencion||0):0;
  const raw=(latestIntervention&&interventionDate>=caseDate)
    ? latestIntervention.EstadoFinalEquipo
    : (latestCase&&latestCase.EstadoEquipo);

  const state=raw||'';
  if(norm(state).includes('fuera')) return '🔴 Fuera de servicio';
  if(norm(state).includes('observaciones')) return '🟡 Operativo con observaciones';
  if(norm(state).includes('operativo')) return '🟢 Operativo';
  return state||'Estado funcional no especificado';
}

function equipmentManagementSummary(e){
  const pending=pendingCasesFor(e);
  if(!pending.length) return '🟢 Sin AV pendientes';
  return pending.length===1?'🟠 1 AV pendiente':`🟠 ${pending.length} AV pendientes`;
}

function spareRequestRows(){
  const equipmentByActivo=new Map(EQUIPOS.map(e=>[(e.Activo||'').toString(),e]));
  const caseByAV=new Map(AVERIAS.map(c=>[(c.AV||'').toString(),c]));
  const rows=[];

  INTERVENCIONES.forEach(i=>{
    const requested=isYes(i.RequiereRepuestos)||!!(i.RepuestosRequeridos||'').toString().trim();
    if(!requested) return;

    const c=caseByAV.get((i.AV||'').toString());
    if(!c||!isCaseOpen(c)) return;

    const requestDate=Number(i.FechaIntervencion||0);
    const installedLater=interventionsFor(i.AV).some(x=>
      Number(x.FechaIntervencion||0)>=requestDate &&
      norm(x.TipoMantenimiento).includes('instalacion repuesto')
    );
    if(installedLater) return;

    const eq=equipmentByActivo.get((c.Activo||'').toString());
    rows.push({
      Repuesto:(i.RepuestosRequeridos||'Repuesto no especificado').toString().trim(),
      Fecha:i.FechaIntervencion,
      Activo:c.Activo||'—',
      Equipo:(eq&&displayName(eq))||c.Equipo||i.Equipo||'Equipo'
    });
  });

  const seen=new Set();
  return rows
    .sort((a,b)=>Number(a.Fecha||0)-Number(b.Fecha||0))
    .filter(r=>{
      const key=[r.Activo,norm(r.Repuesto),r.Fecha].join('|');
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function renderSpareTable(){
  if(!spareTableBody||!spareCountEl) return;
  const rows=spareRequestRows();
  spareCountEl.textContent=`${rows.length} ${rows.length===1?'solicitud pendiente':'solicitudes pendientes'}`;
  spareTableBody.innerHTML='';
  if(!rows.length){
    spareTableBody.innerHTML='<tr><td colspan="4" class="empty-cell">No hay repuestos pendientes registrados.</td></tr>';
    return;
  }
  rows.forEach(r=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${esc(r.Repuesto)}</td><td>${esc(formatDate(r.Fecha))}</td><td>${esc(r.Activo)}</td><td>${esc(r.Equipo)}</td>`;
    spareTableBody.appendChild(tr);
  });
}

function displayName(e){
  const code=e.Codigo||'';
  if(code==='CT-01') return 'TAC Siemens 32';
  if(code==='CT-02') return 'TAC Philips 64';
  if(code==='CT-03') return 'TAC Canon 320';

  if(code.startsWith('MX-')){
    const alias=e.Alias||'';
    const model=e.Modelo||'';
    const cleanAlias=alias.replace(/^\s*[🟢🟣🔵🔴🟡]\s*/u,'').trim();
    const emoji=(alias.match(/[🟢🟣🔵🔴🟡]/u)||[''])[0];
    return `${emoji?emoji+' ':''}Portátil ${cleanAlias}${model?' - '+model:''}`.trim();
  }

  if(code.startsWith('AC-')){
    const alias=e.Alias||'';
    const cleanAlias=alias.replace(/^\s*[🟢🟡🔴🟤🔵]\s*/u,'').trim();
    const emoji=(alias.match(/[🟢🟡🔴🟤🔵]/u)||[''])[0];
    return `${emoji?emoji+' ':''}Arco en C ${cleanAlias}`.trim();
  }

  if(code.startsWith('MM-')) return `${e.Alias||'Mamógrafo'} - ${e.Modelo||'Mammomat Inspiration'}`;
  if(code.startsWith('RX-')) return `${e.Alias||'Sala'}${e.Modelo?' - '+e.Modelo:''}`;
  if(code==='FL-01') return `Fluoroscopia${e.Modelo?' - '+e.Modelo:''}`;
  if(code==='DXA-01') return `Densitómetro Óseo${e.Modelo?' - '+e.Modelo:''}`;
  if(code==='OP-01') return `Ortopantomógrafo${e.Modelo?' - '+e.Modelo:''}`;
  return e.NombreAdministracion||e.Alias||e.Equipo||'Equipo';
}

function groupEquipment(){
  const map=new Map();
  EQUIPOS.forEach(eq=>{
    const key=(eq.Activo||eq.Codigo||eq.NombreAdministracion||eq.Alias||'').toString();
    if(!key) return;
    map.set(key,{...eq,Equipo:eq.NombreAdministracion||eq.Modelo||eq.Alias||'',cases:[]});
  });

  AVERIAS.forEach(a=>{
    const key=(a.Activo||a.Equipo||'').toString();
    if(!key) return;
    if(!map.has(key)) map.set(key,{Activo:a.Activo,Alias:a.Alias||'',Equipo:a.Equipo,Modalidad:a.Modalidad,Codigo:'',Modelo:'',NombreAdministracion:a.Equipo,cases:[]});
    map.get(key).cases.push(a);
  });
  return Array.from(map.values());
}

function currentCase(cases){
  if(!cases.length) return null;
  return [...cases].sort((a,b)=>Number(b.Fecha||0)-Number(a.Fecha||0))[0];
}

function populateModalities(){
  modalityEl.innerHTML='<option value="">Todas las modalidades</option>';
  [...new Set(AVERIAS.map(e=>e.Modalidad).filter(Boolean))].sort().forEach(m=>{
    const o=document.createElement('option');
    o.value=m;o.textContent=m;modalityEl.appendChild(o);
  });
}

function setQuickFilter(type){
  quickFilter=quickFilter===type?'':type;
  render();
}

function renderSummary(equipment){
  const fuera=equipment.filter(e=>norm(equipmentFunctionalState(e)).includes('fuera')).length;
  const observaciones=equipment.filter(e=>norm(equipmentFunctionalState(e)).includes('observaciones')).length;
  const operativo=equipment.filter(e=>norm(equipmentFunctionalState(e)).includes('operativo')&&!norm(equipmentFunctionalState(e)).includes('observaciones')).length;
  const pendientes=equipment.filter(e=>pendingCasesFor(e).length>0).length;
  summaryEl.innerHTML=`
    <button class="summary-card summary-action ${quickFilter==='fuera'?'active':''}" data-filter="fuera" type="button"><div class="label">Fuera de servicio</div><div class="value">${fuera}</div><div class="hint">Estado operativo actual</div></button>
    <button class="summary-card summary-action ${quickFilter==='observaciones'?'active':''}" data-filter="observaciones" type="button"><div class="label">Operativo con observaciones</div><div class="value">${observaciones}</div><div class="hint">Estado operativo actual</div></button>
    <button class="summary-card summary-action ${quickFilter==='operativo'?'active':''}" data-filter="operativo" type="button"><div class="label">Operativos</div><div class="value">${operativo}</div><div class="hint">Estado operativo actual</div></button>
    <button class="summary-card summary-action ${quickFilter==='pendientes'?'active':''}" data-filter="pendientes" type="button"><div class="label">Con AV pendientes</div><div class="value">${pendientes}</div><div class="hint">Gestión administrativa</div></button>`;
  summaryEl.querySelectorAll('[data-filter]').forEach(btn=>btn.addEventListener('click',()=>setQuickFilter(btn.dataset.filter)));
}

function matchesQuickFilter(e){
  if(!quickFilter) return true;
  const state=norm(equipmentFunctionalState(e));
  if(quickFilter==='fuera') return state.includes('fuera');
  if(quickFilter==='observaciones') return state.includes('observaciones');
  if(quickFilter==='operativo') return state.includes('operativo')&&!state.includes('observaciones');
  if(quickFilter==='pendientes') return pendingCasesFor(e).length>0;
  return true;
}

function interventionHtml(i){
  const spare=isYes(i.RequiereRepuestos)||!!(i.RepuestosRequeridos||'').toString().trim();
  return `<div class="intervention">
    <b>${esc(formatDate(i.FechaIntervencion))}</b>${i.TipoMantenimiento?` · ${esc(i.TipoMantenimiento)}`:''}
    ${i.EstadoFinalEquipo?`<br><b>Estado final:</b> <span class="${statusClass(i.EstadoFinalEquipo)}">${esc(i.EstadoFinalEquipo)}</span>`:''}
    ${i.TrabajoRealizado?`<br><b>Trabajo realizado:</b> ${esc(i.TrabajoRealizado)}`:''}
    ${spare?`<div class="spare-box"><b>🟠 Repuesto requerido</b>${i.RepuestosRequeridos?`<br>${esc(i.RepuestosRequeridos)}`:''}</div>`:''}
    ${i.Observaciones?`<br><b>Observaciones:</b> ${esc(i.Observaciones)}`:''}
  </div>`;
}

function render(){
  const q=norm(searchEl.value.trim());
  const status=statusEl.value;
  const modality=modalityEl.value;
  const allEquipment=groupEquipment().filter(e=>e.cases.length>0);
  const equipment=allEquipment.filter(e=>{
    const interventionText=e.cases.flatMap(c=>interventionsFor(c.AV).flatMap(i=>[i.TrabajoRealizado,i.RepuestosRequeridos,i.Observaciones]));
    const hit=!q||[displayName(e),e.Alias,e.Equipo,e.Activo,e.Modalidad,e.Modelo,e.Fabricante,...e.cases.flatMap(c=>[c.AV,c.Descripcion,c.TipoIncidente,c.MensajeError,c.EstadoGestion,functionalState(c),managementState(c)]),...interventionText].some(x=>norm(x).includes(q));
    const statusHit=!status||e.cases.some(c=>c.EstadoGestion===status);
    const modHit=!modality||e.Modalidad===modality;
    return hit&&statusHit&&modHit&&matchesQuickFilter(e);
  });

  renderSummary(allEquipment);
  countEl.textContent=`${equipment.length} ${equipment.length===1?'equipo':'equipos'}`;
  listEl.innerHTML='';

  if(!equipment.length){
    listEl.innerHTML='<div class="empty">No se encontraron equipos o expedientes con esos criterios.</div>';
    return;
  }

  equipment.sort((a,b)=>displayName(a).localeCompare(displayName(b))).forEach(e=>{
    const node=template.content.firstElementChild.cloneNode(true);
    const current=currentCase(e.cases);
    const fState=equipmentFunctionalState(e);
    const mState=equipmentManagementSummary(e);
    const cls=statusClass(fState);

    node.querySelector('.equipment-name').textContent=displayName(e);
    node.querySelector('.equipment-meta').textContent=`Activo ${e.Activo||'—'}`;
    node.querySelector('.status-dot').classList.add(cls);
    node.querySelector('.status-pill').classList.add(cls);
    node.querySelector('.status-pill').textContent=fState;
    node.querySelector('.management-pill').classList.add(pendingCasesFor(e).length?'status-pendiente-repuesto':'status-cerrado');
    node.querySelector('.management-pill').textContent=mState;

    const cases=node.querySelector('.cases');
    [...e.cases]
      .sort((a,b)=>(b.Fecha||'').toString().localeCompare((a.Fecha||'').toString()))
      .forEach(c=>{
        const allInterventions=interventionsFor(c.AV);
        const recentInterventions=allInterventions.slice(0,5);
        const f=functionalState(c);
        const m=managementState(c);
        const latest=allInterventions[0];
        const description=(c.Descripcion||'').toString().trim()||'Sin descripción registrada.';
        const div=document.createElement('div');
        div.className='case';
        div.innerHTML=`
          <div class="case-top"><div class="case-av">${esc(c.AV)}</div><div class="case-date">${esc(formatDate(c.Fecha))}</div></div>
          <div class="case-description">
            <b>Estado del equipo:</b> <span class="${statusClass(f)}">${esc(f)}</span><br>
            <b>Gestión:</b> <span class="${statusClass(m)}">${esc(m)}</span>
          </div>
          <div class="case-description"><b>Descripción del registro</b><br>${esc(description)}</div>
          ${c.MensajeError?`<div class="error-box"><b>⚠️ Error reportado</b><br>${esc(c.MensajeError)}</div>`:''}
          ${caseNeedsSpare(c)&&latest&&latest.RepuestosRequeridos?`<div class="spare-box"><b>🟠 Repuesto pendiente</b><br>${esc(latest.RepuestosRequeridos)}</div>`:''}
          <div class="interventions">
            <div class="case-description"><b>Historial técnico</b><br>${allInterventions.length>5?'Se muestran las 5 intervenciones más recientes de esta AV.':'Intervenciones asociadas a esta AV.'}</div>
            ${recentInterventions.length?recentInterventions.map(interventionHtml).join(''):'<div class="intervention">Sin intervenciones registradas.</div>'}
          </div>`;
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
    const [equiposRes,averiasRes,intervencionesRes]=await Promise.all([
      fetch('./data/equipos.json',{cache:'no-store'}),
      fetch('./data/averias.json',{cache:'no-store'}),
      fetch('./data/intervenciones.json',{cache:'no-store'})
    ]);
    if(!equiposRes.ok||!averiasRes.ok||!intervencionesRes.ok) throw new Error('No se pudieron cargar los datos');
    EQUIPOS=await equiposRes.json();
    AVERIAS=sanitizeAverias(await averiasRes.json());
    INTERVENCIONES=(await intervencionesRes.json()).filter(i=>(i.AV||'').toString().trim()!=='');
    populateModalities();
    render();
    renderSpareTable();
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