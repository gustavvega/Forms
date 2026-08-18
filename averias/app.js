const AVERIAS = [
  {AV:'AV-2026-08-0001',Modalidad:'Mamografía',Equipo:'Mammomat Inspiration',Activo:'1345001',Lugar:'Mamografía',Fecha:'2026-08-17',TipoIncidente:'Error intermitente durante adquisición',Descripcion:'El equipo presentó una alerta durante el estudio y continuó operativo con observaciones.',EstadoEquipo:'🟠 Pendiente de repuesto',EstadoGestion:'Pendiente de repuesto'},
  {AV:'AV-2026-08-0002',Modalidad:'TAC',Equipo:'TAC Siemens 32 - SOMATOM Perspective',Activo:'1345644',Lugar:'TAC',Fecha:'2026-08-17',TipoIncidente:'Falla técnica',Descripcion:'Reporte técnico de prueba para validar el expediente público.',EstadoEquipo:'🟢 Operativo',EstadoGestion:'Cerrado'},
  {AV:'AV-2026-08-0003',Modalidad:'Rayos X',Equipo:'Mobilett Elara Max',Activo:'1345384',Lugar:'Radiología',Fecha:'2026-08-18',TipoIncidente:'Revisión técnica',Descripcion:'Equipo en seguimiento técnico.',EstadoEquipo:'🟡 Operativo con observaciones',EstadoGestion:'Seguimiento requerido'}
];

const INTERVENCIONES = [
  {AV:'AV-2026-08-0001',FechaIntervencion:'2026-08-17',TipoMantenimiento:'Diagnóstico / revisión',Empresa:'Servicio técnico',TrabajoRealizado:'Diagnóstico y revisión del sistema.',RequiereRepuestos:'Sí',RepuestosRequeridos:'Módulo de control — 1 unidad',EstadoFinalEquipo:'🟠 Pendiente de repuesto'},
  {AV:'AV-2026-08-0002',FechaIntervencion:'2026-08-18',TipoMantenimiento:'Correctivo',Empresa:'Servicio técnico',TrabajoRealizado:'Ajuste, pruebas funcionales y verificación final.',RequiereRepuestos:'No',RepuestosRequeridos:'',EstadoFinalEquipo:'🟢 Operativo'},
  {AV:'AV-2026-08-0003',FechaIntervencion:'2026-08-18',TipoMantenimiento:'Diagnóstico / revisión',Empresa:'Servicio técnico',TrabajoRealizado:'Revisión funcional. Se mantiene seguimiento.',RequiereRepuestos:'No',RepuestosRequeridos:'',EstadoFinalEquipo:'🟡 Operativo con observaciones'}
];

const searchEl=document.getElementById('search');
const statusEl=document.getElementById('statusFilter');
const modalityEl=document.getElementById('modalityFilter');
const listEl=document.getElementById('equipmentList');
const countEl=document.getElementById('resultCount');
const summaryEl=document.getElementById('summary');
const clearBtn=document.getElementById('clearBtn');
const template=document.getElementById('equipmentTemplate');

const norm=s=>(s||'').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const esc=s=>(s||'').toString().replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function statusClass(status){
  const s=norm(status);
  if(s.includes('cerrado')||s.includes('operativo')) return 'status-cerrado';
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
    if(!map.has(key)) map.set(key,{Activo:a.Activo,Equipo:a.Equipo,Modalidad:a.Modalidad,cases:[]});
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
  [...new Set(AVERIAS.map(a=>a.Modalidad).filter(Boolean))].sort().forEach(m=>{
    const o=document.createElement('option');o.value=m;o.textContent=m;modalityEl.appendChild(o);
  });
}

function renderSummary(equipment){
  const open=equipment.filter(e=>e.cases.some(c=>norm(c.EstadoGestion)!=='cerrado')).length;
  const closed=equipment.filter(e=>e.cases.every(c=>norm(c.EstadoGestion)==='cerrado')).length;
  const repuesto=equipment.filter(e=>e.cases.some(c=>norm(c.EstadoGestion).includes('repuesto'))).length;
  const attention=equipment.filter(e=>e.cases.some(c=>norm(c.EstadoGestion).includes('atencion'))).length;
  summaryEl.innerHTML=`
    <div class="summary-card"><div class="label">Equipos consultables</div><div class="value">${equipment.length}</div></div>
    <div class="summary-card"><div class="label">Con reporte abierto</div><div class="value">${open}</div></div>
    <div class="summary-card"><div class="label">Pendiente de repuesto</div><div class="value">${repuesto}</div></div>
    <div class="summary-card"><div class="label">Sin averías abiertas</div><div class="value">${closed}</div></div>`;
}

function render(){
  const q=norm(searchEl.value.trim());
  const status=statusEl.value;
  const modality=modalityEl.value;
  let equipment=groupEquipment().filter(e=>{
    const hit=!q || [e.Equipo,e.Activo,e.Modalidad,...e.cases.flatMap(c=>[c.AV,c.Descripcion,c.TipoIncidente,c.EstadoGestion])].some(x=>norm(x).includes(q));
    const statusHit=!status || e.cases.some(c=>c.EstadoGestion===status);
    const modHit=!modality || e.Modalidad===modality;
    return hit&&statusHit&&modHit;
  });
  renderSummary(groupEquipment());
  countEl.textContent=`${equipment.length} ${equipment.length===1?'equipo':'equipos'}`;
  listEl.innerHTML='';
  if(!equipment.length){listEl.innerHTML='<div class="empty">No se encontraron equipos o expedientes con esos criterios.</div>';return;}

  equipment.sort((a,b)=>a.Equipo.localeCompare(b.Equipo)).forEach(e=>{
    const node=template.content.firstElementChild.cloneNode(true);
    const current=currentCase(e.cases);
    const openCases=e.cases.filter(c=>norm(c.EstadoGestion)!=='cerrado');
    const state=openCases.length?current.EstadoGestion:'Sin averías abiertas';
    const cls=openCases.length?statusClass(state):'status-cerrado';
    node.querySelector('.equipment-name').textContent=e.Equipo;
    node.querySelector('.equipment-meta').textContent=`${e.Modalidad} · Activo ${e.Activo}`;
    node.querySelector('.status-dot').classList.add(cls);
    node.querySelector('.status-pill').classList.add(cls);
    node.querySelector('.status-pill').textContent=openCases.length?state:'🟢 Sin averías abiertas';
    node.querySelector('.current-state').innerHTML=openCases.length
      ? `<b>Estado actual:</b> ${esc(current.EstadoEquipo||current.EstadoGestion)} · <b>${openCases.length}</b> expediente(s) abierto(s).`
      : '<b>Estado actual:</b> 🟢 No hay averías abiertas para este equipo.';

    const cases=node.querySelector('.cases');
    [...e.cases].sort((a,b)=>(b.Fecha||'').localeCompare(a.Fecha||'')).forEach(c=>{
      const interventions=INTERVENCIONES.filter(i=>i.AV===c.AV).sort((a,b)=>(b.FechaIntervencion||'').localeCompare(a.FechaIntervencion||''));
      const div=document.createElement('div');div.className='case';
      div.innerHTML=`<div class="case-top"><div class="case-av">${esc(c.AV)}</div><div class="case-date">${esc(c.Fecha)}</div></div>
        <div class="case-description"><b class="${statusClass(c.EstadoGestion)}">${esc(c.EstadoGestion)}</b><br>${esc(c.Descripcion||c.TipoIncidente||'Sin descripción pública.')}</div>
        <div class="interventions">${interventions.length?interventions.map(i=>`<div class="intervention"><b>${esc(i.FechaIntervencion)}</b> · ${esc(i.TipoMantenimiento)} · ${esc(i.EstadoFinalEquipo)}<br>${esc(i.TrabajoRealizado)}</div>`).join(''):'<div class="intervention">Sin intervenciones registradas.</div>'}</div>`;
      cases.appendChild(div);
    });
    const header=node.querySelector('.equipment-header');const detail=node.querySelector('.equipment-detail');
    header.addEventListener('click',()=>{const open=node.classList.toggle('open');detail.hidden=!open;});
    listEl.appendChild(node);
  });
}

[searchEl,statusEl,modalityEl].forEach(el=>el.addEventListener(el===searchEl?'input':'change',render));
clearBtn.addEventListener('click',()=>{searchEl.value='';statusEl.value='';modalityEl.value='';render();searchEl.focus();});
populateModalities();render();
