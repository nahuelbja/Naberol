// naberol. Contable — app.js
const SB_URL = 'https://sxwbfqaufvzbenfvffjl.supabase.co'
const SB_KEY = 'sb_publishable_752-wqS5XqsKWlqKhqg_MA_v1YAakcf'
const { createClient } = supabase
const db = createClient(SB_URL, SB_KEY)

// ── State ──
let clientes=[], timbrados=[], facturas=[]
let activeCliente=null, hFilter='todos', g10Auto=true
const hoy=new Date().toISOString().split('T')[0]

// ── Utils ──
const fmt=n=>Math.round(n).toLocaleString('es-PY')
const iv10=g=>Math.round(g/11)
const iv5=g=>Math.round(g/21)
const calcIVA=f=>{const i10=iv10(f.g10||0),i5=iv5(f.g5||0);return{i10,i5,tot:i10+i5,total:(f.g10||0)+(f.g5||0)+(f.exenta||0)}}
const estTim=t=>{if(hoy>t.fin)return'ven';return(new Date(t.fin)-new Date(hoy))/864e5<=30?'prox':'vig'}
const inic=n=>n.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()
const fmtNro=raw=>{const d=raw.replace(/\D/g,'');if(!d)return'';const p1=d.slice(0,3).padStart(3,'0');const p2=(d.length>3?d.slice(3,6):'001').padStart(3,'0');const p3=d.slice(6,13).padStart(7,'0');if(d.length<=3)return p1;if(d.length<=6)return p1+'-'+p2;return p1+'-'+p2+'-'+p3}

// ── Screen manager ──
// Sistema basado en clases .active — más confiable que inline styles
// .screen { display:none !important } en CSS, .screen.active { display:flex !important }
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'))
  document.getElementById(id).classList.add('active')
}

// ── Init ──
async function init() {
  try {
    // getSession() lee de localStorage sin llamada de red — más confiable
    const {data:{session}}=await db.auth.getSession()
    if(!session){show('s-login');return}
    setUser(session.user)
    await loadData()
    show('s-home')
    updateHomeStats()
  } catch(e) {
    show('s-login')
  }
}

function setUser(user) {
  const e=user.email
  document.getElementById('h-email').textContent=e
  document.getElementById('nb-email').textContent=e
}

async function loadData() {
  const [{data:c},{data:t},{data:f}]=await Promise.all([
    db.from('clientes').select('*').order('created_at'),
    db.from('timbrados').select('*').order('created_at'),
    db.from('facturas').select('*').order('fecha',{ascending:false})
  ])
  clientes=c||[]; timbrados=t||[]; facturas=f||[]
}

// ── Auth ──
async function doLogin() {
  const email=document.getElementById('l-email').value.trim()
  const pass=document.getElementById('l-pass').value
  const err=document.getElementById('login-err')
  const btn=document.getElementById('l-btn')
  err.style.display='none'
  if(!email||!pass){err.textContent='Completá email y contraseña.';err.style.display='block';return}
  btn.textContent='Ingresando...';btn.disabled=true
  const {data,error}=await db.auth.signInWithPassword({email,password:pass})
  if(error){err.textContent='Email o contraseña incorrectos.';err.style.display='block';btn.innerHTML='<i class="ti ti-login"></i> Ingresar al sistema';btn.disabled=false;return}
  setUser(data.user)
  await loadData()
  show('s-home')
  updateHomeStats()
}

async function doLogout() {
  await db.auth.signOut()
  location.reload()
}

// ── Home ──
function updateHomeStats() {
  const h=new Date().getHours()
  const g=h<12?'Buenos días':h<19?'Buenas tardes':'Buenas noches'
  document.getElementById('h-greet').textContent=g+'.'
  const tv=facturas.filter(f=>f.tipo==='venta').reduce((a,f)=>a+calcIVA(f).total,0)
  const tc=facturas.filter(f=>f.tipo==='compra').reduce((a,f)=>a+calcIVA(f).total,0)
  const timV=timbrados.filter(t=>estTim(t)!=='ven').length
  document.getElementById('h-chips').innerHTML=`
    <div class="chip"><i class="ti ti-arrow-up-right" style="color:var(--green)"></i>Ventas <span class="chipv">Gs. ${fmt(tv)}</span></div>
    <div class="chip"><i class="ti ti-arrow-down-left" style="color:var(--danger)"></i>Compras <span class="chipv">Gs. ${fmt(tc)}</span></div>
    <div class="chip"><i class="ti ti-users"></i><span class="chipv">${clientes.length}</span> clientes</div>
    <div class="chip"><i class="ti ti-file-invoice"></i><span class="chipv">${facturas.length}</span> facturas</div>
    <div class="chip"><i class="ti ti-stamp"></i><span class="chipv">${timV}</span> timbrado${timV!==1?'s':''} vigentes</div>`
}

function enterSection(sec) {
  show('s-app')
  const btn=document.querySelector(`.nb-btn[onclick*="'${sec}'"]`)
  showTab(sec,btn||document.querySelector('.nb-btn'))
}
function goHome(){show('s-home');updateHomeStats()}

// ── Nav ──
function showTab(t,btn) {
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'))
  document.querySelectorAll('.nb-btn').forEach(b=>b.classList.remove('active'))
  document.getElementById('tab-'+t).classList.add('active')
  if(btn)btn.classList.add('active')
  if(t==='dashboard')renderDashboard()
  if(t==='clientes')renderGrid()
  if(t==='timbrados')renderTimbrados()
  if(t==='facturas'){renderFiltroCliente();renderFacturas()}
}

// ── Dashboard ──
function renderDashboard() {
  const vs=facturas.filter(f=>f.tipo==='venta'),cs=facturas.filter(f=>f.tipo==='compra')
  const tot=arr=>arr.reduce((a,f)=>{const c=calcIVA(f);return{g10:a.g10+(f.g10||0),g5:a.g5+(f.g5||0),ex:a.ex+(f.exenta||0),iva:a.iva+c.tot,total:a.total+c.total}},{g10:0,g5:0,ex:0,iva:0,total:0})
  const tv=tot(vs),tc=tot(cs),saldo=tv.total-tc.total,ivaNet=tv.iva-tc.iva
  const timV=timbrados.filter(t=>estTim(t)!=='ven').length
  document.getElementById('metrics').innerHTML=`
    <div class="metric"><div class="mlbl">Total ventas</div><div class="mval mv-g">Gs. ${fmt(tv.total)}</div></div>
    <div class="metric"><div class="mlbl">Total compras</div><div class="mval mv-r">Gs. ${fmt(tc.total)}</div></div>
    <div class="metric"><div class="mlbl">Saldo neto</div><div class="mval ${saldo>=0?'mv-g':'mv-r'}">Gs. ${fmt(saldo)}</div></div>
    <div class="metric"><div class="mlbl">IVA neto</div><div class="mval mv-b">Gs. ${fmt(ivaNet)}</div></div>
    <div class="metric"><div class="mlbl">Facturas</div><div class="mval">${facturas.length}</div></div>
    <div class="metric"><div class="mlbl">Clientes</div><div class="mval">${clientes.length}</div></div>
    <div class="metric"><div class="mlbl">Timbrados vigentes</div><div class="mval">${timV}</div></div>`
  const tbl=t=>`<table class="ivat"><tr><td>Gravada 10%</td><td>Gs. ${fmt(t.g10-iv10(t.g10))}</td></tr><tr><td>IVA 10%</td><td>Gs. ${fmt(iv10(t.g10))}</td></tr><tr><td>Gravada 5%</td><td>Gs. ${fmt(t.g5-iv5(t.g5))}</td></tr><tr><td>IVA 5%</td><td>Gs. ${fmt(iv5(t.g5))}</td></tr><tr><td>Exenta</td><td>Gs. ${fmt(t.ex)}</td></tr><tr class="ivatot"><td>Total IVA</td><td>Gs. ${fmt(t.iva)}</td></tr></table>`
  document.getElementById('iva-ventas').innerHTML=tbl(tv)
  document.getElementById('iva-compras').innerHTML=tbl(tc)
}

// ── Clientes ──
function mostrarForm(){document.getElementById('form-c').style.display='block'}
function ocultarForm(){document.getElementById('form-c').style.display='none'}

async function addCliente() {
  const base=document.getElementById('c-base').value.trim()
  const dv=document.getElementById('c-dv').value.trim()
  const nom=document.getElementById('c-nom').value.trim()
  if(!base||!dv||!nom){alert('RUC y nombre son obligatorios.');return}
  const ruc=base+'-'+dv
  if(clientes.find(c=>c.ruc_base===base)){alert('Ya existe un cliente con ese RUC.');return}
  const {data,error}=await db.from('clientes').insert({ruc,ruc_base:base,dv,nombre:nom}).select().single()
  if(error){alert('Error: '+error.message);return}
  clientes.push(data)
  document.getElementById('c-base').value=''
  document.getElementById('c-dv').value=''
  document.getElementById('c-nom').value=''
  ocultarForm();renderGrid()
}

function renderGrid() {
  document.getElementById('v-lista').style.display='block'
  document.getElementById('v-perfil').style.display='none'
  const el=document.getElementById('cgrid')
  if(!clientes.length){el.innerHTML='<p class="empty">No hay clientes. Creá el primero.</p>';return}
  el.innerHTML=clientes.map(c=>{
    const fs=facturas.filter(f=>f.cliente_id===c.id)
    const nv=fs.filter(f=>f.tipo==='venta').length,nc=fs.filter(f=>f.tipo==='compra').length
    return`<div class="ccard" onclick="abrirPerfil(${c.id})">
      <div class="cava">${inic(c.nombre)}</div>
      <div class="cnom">${c.nombre}</div>
      <div class="cruc">${c.ruc}</div>
      <div class="cstats"><span class="cst csv">↑ ${nv} venta${nv!==1?'s':''}</span><span class="cst csc">↓ ${nc} compra${nc!==1?'s':''}</span></div>
    </div>`
  }).join('')
}

function abrirPerfil(id) {
  activeCliente=clientes.find(c=>c.id===id);if(!activeCliente)return
  hFilter='todos'
  document.getElementById('v-lista').style.display='none'
  document.getElementById('v-perfil').style.display='block'
  document.getElementById('p-ava').textContent=inic(activeCliente.nombre)
  document.getElementById('p-nom').textContent=activeCliente.nombre
  document.getElementById('p-ruc').textContent=activeCliente.ruc
  document.getElementById('h-mes').value=''
  document.querySelectorAll('.ttab').forEach((b,i)=>b.classList.toggle('active',i===0))
  pTab('hist',document.querySelector('.ptab'))
  poblarTim();limpiarForm();renderHist();renderPStats()
}

function volverLista(){activeCliente=null;renderGrid()}

function pTab(tab,btn) {
  document.querySelectorAll('.ptab').forEach(b=>b.classList.remove('active'))
  btn.classList.add('active')
  document.getElementById('p-hist').style.display=tab==='hist'?'block':'none'
  document.getElementById('p-nueva').style.display=tab==='nueva'?'block':'none'
  if(tab==='nueva'){poblarTim();limpiarForm()}
}

function setHFilter(tipo,btn) {
  hFilter=tipo
  document.querySelectorAll('.ttab').forEach(b=>b.classList.remove('active'))
  btn.classList.add('active')
  renderHist()
}

function renderPStats() {
  if(!activeCliente)return
  const fs=facturas.filter(f=>f.cliente_id===activeCliente.id)
  document.getElementById('p-tv').textContent='Gs. '+fmt(fs.filter(f=>f.tipo==='venta').reduce((a,f)=>a+calcIVA(f).total,0))
  document.getElementById('p-tc').textContent='Gs. '+fmt(fs.filter(f=>f.tipo==='compra').reduce((a,f)=>a+calcIVA(f).total,0))
}

function renderHist() {
  if(!activeCliente)return
  const mes=document.getElementById('h-mes').value
  let fs=facturas.filter(f=>f.cliente_id===activeCliente.id)
  if(hFilter!=='todos')fs=fs.filter(f=>f.tipo===hFilter)
  if(mes)fs=fs.filter(f=>f.fecha&&f.fecha.startsWith(mes))
  fs=fs.sort((a,b)=>b.fecha.localeCompare(a.fecha))
  const el=document.getElementById('p-facturas')
  if(!fs.length){el.innerHTML='<p class="empty">No hay facturas para el filtro seleccionado.</p>';return}
  const tot=fs.reduce((a,f)=>{const c=calcIVA(f);return{iva:a.iva+c.tot,total:a.total+c.total}},{iva:0,total:0})
  el.innerHTML=`<div class="rstrip" style="margin-bottom:.75rem">
    <div class="rstrip-it"><p>${fs.length} factura${fs.length!==1?'s':''}</p><p style="color:var(--tu)">${hFilter==='todos'?'todos':hFilter==='venta'?'ventas':'compras'}</p></div>
    <div class="rstrip-it"><p>IVA</p><p>Gs. ${fmt(tot.iva)}</p></div>
    <div class="rstrip-it"><p>Total</p><p style="font-size:15px;color:var(--t)">Gs. ${fmt(tot.total)}</p></div>
  </div>
  <div class="twrap"><table><thead><tr><th>N° Factura</th><th>Tipo</th><th>Fecha</th><th style="text-align:right">Grav.10%</th><th style="text-align:right">Grav.5%</th><th style="text-align:right">Exenta</th><th style="text-align:right">IVA</th><th style="text-align:right">Total</th><th></th></tr></thead>
  <tbody>${fs.map(f=>{const c=calcIVA(f);return`<tr>
    <td style="font-family:var(--mono);font-size:11px">${f.nro}</td>
    <td><span class="badge ${f.tipo==='venta'?'bv':'bc'}">${f.tipo==='venta'?'Venta':'Compra'}</span></td>
    <td style="font-size:12px">${f.fecha}</td>
    <td style="text-align:right">${f.g10?fmt(f.g10-iv10(f.g10)):'—'}</td>
    <td style="text-align:right">${f.g5?fmt(f.g5-iv5(f.g5)):'—'}</td>
    <td style="text-align:right">${f.exenta?fmt(f.exenta):'—'}</td>
    <td style="text-align:right">${fmt(c.tot)}</td>
    <td style="text-align:right;font-weight:700">${fmt(c.total)}</td>
    <td><button class="btn btn-d btn-sm" onclick="delFacturaPerfil(${f.id})"><i class="ti ti-trash"></i></button></td>
  </tr>`}).join('')}</tbody></table></div>`
}

async function delFacturaPerfil(id) {
  if(!confirm('¿Eliminar esta factura?'))return
  const {error}=await db.from('facturas').delete().eq('id',id)
  if(error){alert('Error: '+error.message);return}
  facturas=facturas.filter(f=>f.id!==id)
  renderHist();renderPStats()
}

// ── Nueva factura ──
function limpiarForm() {
  ['pf-nro','pf-tot','pf-ex','pf-g5'].forEach(id=>{const el=document.getElementById(id);el.value='';el.style.fontFamily=''})
  const g10=document.getElementById('pf-g10');g10.value='';g10.classList.remove('afill');g10.placeholder='automático'
  g10Auto=true
  document.getElementById('pf-rst').style.display='none'
  document.getElementById('pf-fecha').value=hoy
  document.getElementById('pf-tipo').value='venta'
  document.getElementById('pf-nrp').textContent=''
  document.getElementById('pf-fb').className='fb'
  document.getElementById('pf-tinl').classList.remove('vis')
  ;['r-ex-g','r-ex-i','r-g10-g','r-g10-i','r-g5-g','r-g5-i'].forEach(id=>document.getElementById(id).textContent='—')
  ;['r-iva','r-dist'].forEach(id=>document.getElementById(id).textContent='Gs. 0')
  document.getElementById('r-tot').textContent='Gs. 0'
}

function onNro(inp) {
  const d=inp.value.replace(/\D/g,''),prev=document.getElementById('pf-nrp')
  if(!d){prev.textContent='';prev.className='nrp';return}
  prev.textContent='→ '+fmtNro(d);prev.className='nrp'+(d.length>=7?' ok':'')
}
function onNroBlur(inp) {
  const d=inp.value.replace(/\D/g,'')
  if(!d){inp.value='';document.getElementById('pf-nrp').textContent='';return}
  inp.value=fmtNro(d);inp.style.fontFamily='var(--mono)';document.getElementById('pf-nrp').textContent=''
}
function onG10(){g10Auto=false;document.getElementById('pf-g10').classList.remove('afill');document.getElementById('pf-rst').style.display='inline';recalc()}
function rstAuto(){g10Auto=true;document.getElementById('pf-rst').style.display='none';recalc()}

function recalc() {
  const tot=parseFloat(document.getElementById('pf-tot').value)||0
  const ex=parseFloat(document.getElementById('pf-ex').value)||0
  const g5=parseFloat(document.getElementById('pf-g5').value)||0
  const g10el=document.getElementById('pf-g10')
  let g10
  if(g10Auto){g10=Math.max(0,tot-ex-g5);g10el.value=tot>0?(g10>0?g10:''):'';g10el.classList.add('afill');document.getElementById('pf-rst').style.display='none'}
  else{g10=parseFloat(g10el.value)||0}
  const dist=Math.round(ex+g5+g10),resto=Math.round(tot-dist)
  const i10=iv10(g10),gr10=g10-i10,i5=iv5(g5),gr5=g5-i5,ivaTot=i10+i5
  document.getElementById('r-ex-g').textContent=ex?fmt(ex):'—'
  document.getElementById('r-ex-i').textContent=ex?'0':'—'
  document.getElementById('r-g10-g').textContent=g10?fmt(gr10):'—'
  document.getElementById('r-g10-i').textContent=g10?fmt(i10):'—'
  document.getElementById('r-g5-g').textContent=g5?fmt(gr5):'—'
  document.getElementById('r-g5-i').textContent=g5?fmt(i5):'—'
  document.getElementById('r-iva').textContent='Gs. '+fmt(ivaTot)
  document.getElementById('r-dist').textContent='Gs. '+fmt(dist)
  document.getElementById('r-tot').textContent='Gs. '+fmt(tot||dist)
  const fb=document.getElementById('pf-fb')
  if(tot>0){
    if(resto===0){fb.className='fb fbo vis';fb.innerHTML='<i class="ti ti-circle-check"></i> Total distribuido correctamente'}
    else if(resto>0){fb.className='fb fbw vis';fb.innerHTML=`<i class="ti ti-alert-circle"></i> Faltan <strong style="margin:0 4px">Gs. ${fmt(resto)}</strong>`}
    else{fb.className='fb fbw vis';fb.innerHTML=`<i class="ti ti-alert-circle"></i> Exceso de <strong style="margin:0 4px">Gs. ${fmt(Math.abs(resto))}</strong>`}
  }else fb.className='fb'
}

function toggleTinl(){document.getElementById('pf-tinl').classList.toggle('vis')}

async function addTinl() {
  const n=document.getElementById('pnt-n').value.trim()
  const i=document.getElementById('pnt-i').value
  const f=document.getElementById('pnt-f').value
  if(!n||!i||!f){alert('Todos los campos son obligatorios.');return}
  if(f<=i){alert('El fin debe ser posterior al inicio.');return}
  if(timbrados.find(t=>t.nro===n)){alert('Ya existe ese timbrado.');return}
  const {data,error}=await db.from('timbrados').insert({nro:n,inicio:i,fin:f}).select().single()
  if(error){alert('Error: '+error.message);return}
  timbrados.push(data)
  ;['pnt-n','pnt-i','pnt-f'].forEach(id=>document.getElementById(id).value='')
  document.getElementById('pf-tinl').classList.remove('vis')
  renderTimbrados();poblarTim()
  document.getElementById('pf-tim').value=n
}

function poblarTim() {
  const sel=document.getElementById('pf-tim'),prev=sel.value
  const vig=timbrados.filter(t=>estTim(t)!=='ven')
  sel.innerHTML='<option value="">— Sin timbrado —</option>'+vig.map(t=>`<option value="${t.nro}">${t.nro} · vence ${t.fin}</option>`).join('')
  if(prev)sel.value=prev
}

async function saveFactura() {
  if(!activeCliente)return
  const nroRaw=document.getElementById('pf-nro').value.trim()
  const digits=nroRaw.replace(/\D/g,'')
  const nro=fmtNro(digits)
  const fecha=document.getElementById('pf-fecha').value
  const tim=document.getElementById('pf-tim').value
  const tot=parseFloat(document.getElementById('pf-tot').value)||0
  const ex=parseFloat(document.getElementById('pf-ex').value)||0
  const g10=parseFloat(document.getElementById('pf-g10').value)||0
  const g5=parseFloat(document.getElementById('pf-g5').value)||0
  if(!nro||digits.length<7){alert('N° de factura inválido.');return}
  if(!fecha){alert('La fecha es obligatoria.');return}
  if(!g10&&!g5&&!ex){alert('Ingresá al menos un monto.');return}
  const dist=ex+g5+g10
  if(tot&&Math.abs(tot-dist)>1){if(!confirm('El total distribuido no coincide. ¿Guardar igual?'))return}
  const {data,error}=await db.from('facturas').insert({tipo:document.getElementById('pf-tipo').value,nro,fecha,cliente_id:activeCliente.id,ruc:activeCliente.ruc,nombre:activeCliente.nombre,total:tot||dist,g10,g5,exenta:ex,timbrado:tim}).select().single()
  if(error){alert('Error: '+error.message);return}
  facturas.unshift(data)
  limpiarForm();renderHist();renderPStats()
  pTab('hist',document.querySelectorAll('.ptab')[0])
  alert('Factura guardada: '+nro)
}

// ── Timbrados ──
async function addTimbrado() {
  const n=document.getElementById('t-n').value.trim()
  const i=document.getElementById('t-i').value
  const f=document.getElementById('t-f').value
  if(!n||!i||!f){alert('Todos los campos son obligatorios.');return}
  if(f<=i){alert('El fin debe ser posterior al inicio.');return}
  if(timbrados.find(t=>t.nro===n)){alert('Ya existe ese timbrado.');return}
  const {data,error}=await db.from('timbrados').insert({nro:n,inicio:i,fin:f}).select().single()
  if(error){alert('Error: '+error.message);return}
  timbrados.push(data);['t-n','t-i','t-f'].forEach(id=>document.getElementById(id).value='')
  renderTimbrados()
}

async function delTimbrado(id) {
  if(!confirm('¿Eliminar timbrado?'))return
  const {error}=await db.from('timbrados').delete().eq('id',id)
  if(error){alert('Error: '+error.message);return}
  timbrados=timbrados.filter(t=>t.id!==id);renderTimbrados();poblarTim()
}

function renderTimbrados() {
  const el=document.getElementById('lista-t')
  if(!timbrados.length){el.innerHTML='<p class="empty">No hay timbrados aún.</p>';return}
  const sorted=[...timbrados].sort((a,b)=>b.fin.localeCompare(a.fin))
  el.innerHTML=`<div class="twrap"><table><thead><tr><th>Número</th><th>Inicio</th><th>Fin</th><th>Estado</th><th></th></tr></thead><tbody>
  ${sorted.map(t=>{const e=estTim(t);const l=e==='vig'?'Vigente':e==='prox'?'Vence pronto':'Vencido';const cl=e==='vig'?'bvig':e==='prox'?'bprox':'bven';return`<tr><td><span class="tag">${t.nro}</span></td><td style="font-size:12px">${t.inicio}</td><td style="font-size:12px">${t.fin}</td><td><span class="badge ${cl}">${l}</span></td><td><button class="btn btn-d btn-sm" onclick="delTimbrado(${t.id})"><i class="ti ti-trash"></i></button></td></tr>`}).join('')}
  </tbody></table></div>`
}

// ── Todas las facturas ──
function renderFiltroCliente() {
  const sel=document.getElementById('ff-cli'),val=sel.value
  sel.innerHTML='<option value="">Todos los clientes</option>'+clientes.map(c=>`<option value="${c.id}">${c.nombre}</option>`).join('')
  sel.value=val
}

function renderFacturas() {
  const tipo=document.getElementById('ff-tipo').value
  const cid=document.getElementById('ff-cli').value
  const mes=document.getElementById('ff-mes').value
  let list=facturas.filter(f=>{
    if(tipo&&f.tipo!==tipo)return false
    if(cid&&f.cliente_id!=cid)return false
    if(mes&&!f.fecha.startsWith(mes))return false
    return true
  })
  const el=document.getElementById('lista-f')
  if(!list.length){el.innerHTML='<p class="empty">No hay facturas para los filtros seleccionados.</p>';document.getElementById('f-resumen').innerHTML='';return}
  el.innerHTML=`<div class="twrap"><table><thead><tr><th>N° Factura</th><th>Tipo</th><th>Fecha</th><th>Cliente</th><th style="text-align:right">Grav.10%</th><th style="text-align:right">Grav.5%</th><th style="text-align:right">Exenta</th><th style="text-align:right">IVA</th><th style="text-align:right">Total</th><th></th></tr></thead>
  <tbody>${list.map(f=>{const c=calcIVA(f);return`<tr>
    <td style="font-family:var(--mono);font-size:11px">${f.nro}</td>
    <td><span class="badge ${f.tipo==='venta'?'bv':'bc'}">${f.tipo==='venta'?'V':'C'}</span></td>
    <td style="font-size:12px">${f.fecha}</td>
    <td style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.nombre||'—'}</td>
    <td style="text-align:right">${f.g10?fmt(f.g10-iv10(f.g10)):'—'}</td>
    <td style="text-align:right">${f.g5?fmt(f.g5-iv5(f.g5)):'—'}</td>
    <td style="text-align:right">${f.exenta?fmt(f.exenta):'—'}</td>
    <td style="text-align:right">${fmt(c.tot)}</td>
    <td style="text-align:right;font-weight:700">${fmt(c.total)}</td>
    <td><button class="btn btn-d btn-sm" onclick="delFacturaGlobal(${f.id})"><i class="ti ti-trash"></i></button></td>
  </tr>`}).join('')}</tbody></table></div>`
  const tot=list.reduce((a,f)=>{const c=calcIVA(f);return{g10:a.g10+(f.g10||0),g5:a.g5+(f.g5||0),ex:a.ex+(f.exenta||0),iva:a.iva+c.tot,total:a.total+c.total}},{g10:0,g5:0,ex:0,iva:0,total:0})
  document.getElementById('f-resumen').innerHTML=`<div class="rstrip">
    <div class="rstrip-it"><p>${list.length} factura${list.length!==1?'s':''}</p><p style="color:var(--tu)">seleccionadas</p></div>
    <div class="rstrip-it"><p>Grav. 10%</p><p>Gs. ${fmt(tot.g10-iv10(tot.g10))}</p></div>
    <div class="rstrip-it"><p>Grav. 5%</p><p>Gs. ${fmt(tot.g5-iv5(tot.g5))}</p></div>
    <div class="rstrip-it"><p>Exenta</p><p>Gs. ${fmt(tot.ex)}</p></div>
    <div class="rstrip-it"><p>IVA total</p><p>Gs. ${fmt(tot.iva)}</p></div>
    <div class="rstrip-it"><p>Total</p><p style="font-size:15px;color:var(--t)">Gs. ${fmt(tot.total)}</p></div>
  </div>`
}

async function delFacturaGlobal(id) {
  if(!confirm('¿Eliminar esta factura?'))return
  const {error}=await db.from('facturas').delete().eq('id',id)
  if(error){alert('Error: '+error.message);return}
  facturas=facturas.filter(f=>f.id!==id);renderFacturas()
}

// ── Usuarios ──
async function crearUsuario() {
  const email=document.getElementById('u-email').value.trim()
  const pass=document.getElementById('u-pass').value
  const msg=document.getElementById('u-msg')
  if(!email||!pass){msg.textContent='Completá email y contraseña.';msg.style.color='var(--danger)';msg.style.display='block';return}
  if(pass.length<6){msg.textContent='La contraseña debe tener al menos 6 caracteres.';msg.style.color='var(--danger)';msg.style.display='block';return}
  const {error}=await db.auth.signUp({email,password:pass})
  if(error){msg.textContent='Error: '+error.message;msg.style.color='var(--danger)';msg.style.display='block';return}
  msg.textContent='✓ Usuario creado: '+email+'. Ya puede iniciar sesión.'
  msg.style.color='var(--green)';msg.style.display='block'
  document.getElementById('u-email').value='';document.getElementById('u-pass').value=''
  setTimeout(()=>{msg.style.display='none'},5000)
}

// ── Start ──
// Listener de cambios de auth — captura SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED
db.auth.onAuthStateChange((event, session) => {
  if(event==='SIGNED_OUT'||event==='USER_DELETED'){
    clientes=[];timbrados=[];facturas=[];activeCliente=null
    show('s-login')
  }
})

init()
