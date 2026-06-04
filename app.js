// ─────────────────────────────────────────────
//  naberol. Contable — app.js v2
//  Auth + Tabs + Filtro por mes
// ─────────────────────────────────────────────

const SUPABASE_URL = 'https://sxwbfqaufvzbenfvffjl.supabase.co'
const SUPABASE_KEY = 'sb_publishable_752-wqS5XqsKWlqKhqg_MA_v1YAakcf'
const { createClient } = supabase
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── State ──────────────────────────────────
let clientes = []
let timbrados = []
let facturas = []
let clienteActivo = null
let pfAutoMode = true
let historialFiltroTipo = 'todos'
const hoy = new Date().toISOString().split('T')[0]

// ── Helpers ──────────────────────────────────
const fmt = n => Math.round(n).toLocaleString('es-PY')
const iva10 = g => Math.round(g / 11)
const iva5  = g => Math.round(g / 21)
const calcIVA = f => {
  const i10 = iva10(f.g10 || 0), i5 = iva5(f.g5 || 0)
  return { i10, i5, ivaTotal: i10 + i5, total: (f.g10||0) + (f.g5||0) + (f.exenta||0) }
}
const estadoTimbrado = t => {
  if (hoy > t.fin) return 'vencido'
  return (new Date(t.fin) - new Date(hoy)) / 864e5 <= 30 ? 'proximo' : 'vigente'
}
const iniciales = nombre => nombre.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()
const formatearNro = raw => {
  const d = raw.replace(/\D/g,''); if (!d) return ''
  const p1 = d.slice(0,3).padStart(3,'0')
  const p2 = (d.length>3 ? d.slice(3,6) : '001').padStart(3,'0')
  const p3 = d.slice(6,13).padStart(7,'0')
  if (d.length<=3) return p1
  if (d.length<=6) return p1+'-'+p2
  return p1+'-'+p2+'-'+p3
}

// ── AUTH ──────────────────────────────────
async function init() {
  try {
    const { data: { user } } = await db.auth.getUser()
    if (!user) { showLoginScreen(); return }
    document.getElementById('nav-user-email').textContent = user.email
    await cargarDatos()
    document.getElementById('loading').style.display = 'none'
    document.getElementById('app').style.display = 'block'
    renderDashboard()
    renderClientesGrid()
  } catch(err) {
    document.querySelector('.loading-sub').textContent = 'Error al conectar. Recargá la página.'
  }
}

function showLoginScreen() {
  document.getElementById('loading').style.display = 'none'
  document.getElementById('login-screen').style.display = 'block'
}

async function login() {
  const email = document.getElementById('login-email').value.trim()
  const password = document.getElementById('login-password').value
  const errEl = document.getElementById('login-error')
  const btn = document.getElementById('login-btn')
  if (!email || !password) { errEl.textContent = 'Completá email y contraseña.'; errEl.style.display='block'; return }
  btn.textContent = 'Ingresando...'
  btn.disabled = true
  const { error } = await db.auth.signInWithPassword({ email, password })
  if (error) {
    errEl.textContent = 'Email o contraseña incorrectos.'
    errEl.style.display = 'block'
    btn.innerHTML = '<i class="ti ti-login"></i> Ingresar'
    btn.disabled = false
    return
  }
  document.getElementById('login-screen').style.display = 'none'
  document.getElementById('loading').style.display = 'flex'
  await init()
}

async function logout() {
  await db.auth.signOut()
  location.reload()
}

// ── Data ──────────────────────────────────
async function cargarDatos() {
  const [{ data: c }, { data: t }, { data: f }] = await Promise.all([
    db.from('clientes').select('*').order('created_at'),
    db.from('timbrados').select('*').order('created_at'),
    db.from('facturas').select('*').order('fecha', { ascending: false })
  ])
  clientes = c || []
  timbrados = t || []
  facturas = f || []
}

// ── Navigation ──────────────────────────────────
function showTab(t, btn) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'))
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'))
  document.getElementById('tab-'+t).classList.add('active')
  btn.classList.add('active')
  if (t==='dashboard') renderDashboard()
  if (t==='clientes') renderClientesGrid()
  if (t==='timbrados') renderTimbrados()
  if (t==='facturas') { renderFiltroCliente(); renderFacturas() }
  if (t==='usuarios') renderUsuarios()
}

// ── Dashboard ──────────────────────────────────
function renderDashboard() {
  const ventas = facturas.filter(f => f.tipo==='venta')
  const compras = facturas.filter(f => f.tipo==='compra')
  const tot = arr => arr.reduce((a,f) => {
    const c = calcIVA(f)
    return { g10: a.g10+(f.g10||0), g5: a.g5+(f.g5||0), exenta: a.exenta+(f.exenta||0), iva: a.iva+c.ivaTotal, total: a.total+c.total }
  }, { g10:0, g5:0, exenta:0, iva:0, total:0 })
  const tv = tot(ventas), tc = tot(compras)
  const saldo = tv.total - tc.total
  const ivaNeto = tv.iva - tc.iva
  const timV = timbrados.filter(t => estadoTimbrado(t) !== 'vencido').length
  document.getElementById('metrics').innerHTML = `
    <div class="metric"><div class="metric-label">Total ventas</div><div class="metric-value pos">Gs. ${fmt(tv.total)}</div></div>
    <div class="metric"><div class="metric-label">Total compras</div><div class="metric-value neg">Gs. ${fmt(tc.total)}</div></div>
    <div class="metric"><div class="metric-label">Saldo neto</div><div class="metric-value ${saldo>=0?'pos':'neg'}">Gs. ${fmt(saldo)}</div></div>
    <div class="metric"><div class="metric-label">IVA neto</div><div class="metric-value blue">Gs. ${fmt(ivaNeto)}</div></div>
    <div class="metric"><div class="metric-label">Facturas</div><div class="metric-value">${facturas.length}</div></div>
    <div class="metric"><div class="metric-label">Clientes</div><div class="metric-value">${clientes.length}</div></div>
    <div class="metric"><div class="metric-label">Timbrados vigentes</div><div class="metric-value">${timV}</div></div>`
  const tablaIVA = t => `<table class="iva-table">
    <tr><td>Gravada 10%</td><td>Gs. ${fmt(t.g10-iva10(t.g10))}</td></tr>
    <tr><td>IVA 10%</td><td>Gs. ${fmt(iva10(t.g10))}</td></tr>
    <tr><td>Gravada 5%</td><td>Gs. ${fmt(t.g5-iva5(t.g5))}</td></tr>
    <tr><td>IVA 5%</td><td>Gs. ${fmt(iva5(t.g5))}</td></tr>
    <tr><td>Exenta</td><td>Gs. ${fmt(t.exenta)}</td></tr>
    <tr class="iva-total"><td>Total IVA</td><td>Gs. ${fmt(t.iva)}</td></tr></table>`
  document.getElementById('ventas-iva').innerHTML = tablaIVA(tv)
  document.getElementById('compras-iva').innerHTML = tablaIVA(tc)
}

// ── Clientes ──────────────────────────────────
function mostrarFormCliente() { document.getElementById('form-cliente').style.display='block' }
function ocultarFormCliente() { document.getElementById('form-cliente').style.display='none' }

async function agregarCliente() {
  const base = document.getElementById('c-ruc-base').value.trim()
  const dv = document.getElementById('c-ruc-dv').value.trim()
  const nombre = document.getElementById('c-nombre').value.trim()
  if (!base||!dv||!nombre) { alert('RUC (con dígito) y nombre son obligatorios.'); return }
  const ruc = base+'-'+dv
  if (clientes.find(c => c.ruc_base===base)) { alert('Ya existe un cliente con ese RUC.'); return }
  const { data, error } = await db.from('clientes').insert({ ruc, ruc_base:base, dv, nombre }).select().single()
  if (error) { alert('Error al guardar: '+error.message); return }
  clientes.push(data)
  document.getElementById('c-ruc-base').value = ''
  document.getElementById('c-ruc-dv').value = ''
  document.getElementById('c-nombre').value = ''
  ocultarFormCliente()
  renderClientesGrid()
}

function renderClientesGrid() {
  document.getElementById('vista-lista-clientes').style.display = 'block'
  document.getElementById('vista-perfil-cliente').style.display = 'none'
  const el = document.getElementById('clientes-grid')
  if (!clientes.length) { el.innerHTML='<p class="empty-state">No hay clientes aún. Creá el primero.</p>'; return }
  el.innerHTML = clientes.map(c => {
    const fs = facturas.filter(f => f.cliente_id===c.id)
    const nv = fs.filter(f => f.tipo==='venta').length
    const nc = fs.filter(f => f.tipo==='compra').length
    return `<div class="cliente-card" onclick="abrirPerfil(${c.id})">
      <div class="cliente-avatar">${iniciales(c.nombre)}</div>
      <div class="cliente-nombre">${c.nombre}</div>
      <div class="cliente-ruc">${c.ruc}</div>
      <div class="cliente-stats">
        <span class="cliente-stat cs-v">↑ ${nv} venta${nv!==1?'s':''}</span>
        <span class="cliente-stat cs-c">↓ ${nc} compra${nc!==1?'s':''}</span>
      </div>
    </div>`
  }).join('')
}

function abrirPerfil(id) {
  clienteActivo = clientes.find(c => c.id===id)
  if (!clienteActivo) return
  historialFiltroTipo = 'todos'
  document.getElementById('vista-lista-clientes').style.display = 'none'
  document.getElementById('vista-perfil-cliente').style.display = 'block'
  document.getElementById('perfil-avatar').textContent = iniciales(clienteActivo.nombre)
  document.getElementById('perfil-nombre').textContent = clienteActivo.nombre
  document.getElementById('perfil-ruc').textContent = clienteActivo.ruc
  document.getElementById('historial-mes').value = ''
  document.querySelectorAll('.tipo-tab').forEach((b,i) => b.classList.toggle('active', i===0))
  perfilTab('historial', document.querySelector('.perfil-tab'))
  poblarTimbradosPerfil()
  limpiarFormPerfil()
  renderPerfilHistorial()
  renderPerfilResumen()
}

function volverLista() { clienteActivo = null; renderClientesGrid() }

function perfilTab(tab, btn) {
  document.querySelectorAll('.perfil-tab').forEach(b => b.classList.remove('active'))
  btn.classList.add('active')
  document.getElementById('perfil-historial').style.display = tab==='historial' ? 'block' : 'none'
  document.getElementById('perfil-nueva').style.display = tab==='nueva' ? 'block' : 'none'
  if (tab==='nueva') { poblarTimbradosPerfil(); limpiarFormPerfil() }
}

// ── Historial con tabs y filtro ──────────────────────────────────
function setHistorialFilter(tipo, btn) {
  historialFiltroTipo = tipo
  document.querySelectorAll('.tipo-tab').forEach(b => b.classList.remove('active'))
  btn.classList.add('active')
  renderPerfilHistorial()
}

function renderPerfilResumen() {
  if (!clienteActivo) return
  const fs = facturas.filter(f => f.cliente_id===clienteActivo.id)
  const tv = fs.filter(f=>f.tipo==='venta').reduce((a,f) => a+calcIVA(f).total, 0)
  const tc = fs.filter(f=>f.tipo==='compra').reduce((a,f) => a+calcIVA(f).total, 0)
  document.getElementById('perfil-total-ventas').textContent = 'Gs. '+fmt(tv)
  document.getElementById('perfil-total-compras').textContent = 'Gs. '+fmt(tc)
}

function renderPerfilHistorial() {
  if (!clienteActivo) return
  const mes = document.getElementById('historial-mes').value
  let fs = facturas.filter(f => f.cliente_id===clienteActivo.id)
  if (historialFiltroTipo !== 'todos') fs = fs.filter(f => f.tipo===historialFiltroTipo)
  if (mes) fs = fs.filter(f => f.fecha && f.fecha.startsWith(mes))
  fs = fs.sort((a,b) => b.fecha.localeCompare(a.fecha))
  const el = document.getElementById('perfil-facturas-lista')
  if (!fs.length) {
    const msg = historialFiltroTipo==='todos' && !mes
      ? 'No hay facturas. Usá "Nueva factura" para agregar.'
      : 'No hay facturas para el filtro seleccionado.'
    el.innerHTML = `<p class="empty-state">${msg}</p>`
    return
  }
  // Resumen del filtro
  const tot = fs.reduce((a,f) => { const c=calcIVA(f); return { iva: a.iva+c.ivaTotal, total: a.total+c.total } }, {iva:0,total:0})
  el.innerHTML = `
    <div class="resumen-filtrado" style="margin-bottom:.75rem">
      <div class="resumen-filtrado-item"><p>${fs.length} factura${fs.length!==1?'s':''}</p><p style="color:var(--text-subtle)">${historialFiltroTipo==='todos'?'todos':historialFiltroTipo==='venta'?'ventas':'compras'}</p></div>
      <div class="resumen-filtrado-item"><p>IVA total</p><p>Gs. ${fmt(tot.iva)}</p></div>
      <div class="resumen-filtrado-item"><p>Total</p><p style="font-size:15px;color:var(--white)">Gs. ${fmt(tot.total)}</p></div>
    </div>
    <div class="table-wrap"><table>
    <thead><tr>
      <th>N° Factura</th><th>Tipo</th><th>Fecha</th>
      <th style="text-align:right">Grav.10%</th><th style="text-align:right">Grav.5%</th>
      <th style="text-align:right">Exenta</th><th style="text-align:right">IVA</th>
      <th style="text-align:right">Total</th><th></th>
    </tr></thead>
    <tbody>${fs.map(f => {
      const c = calcIVA(f)
      return `<tr>
        <td style="font-family:var(--font-mono);font-size:11px">${f.nro}</td>
        <td><span class="badge badge-${f.tipo}">${f.tipo==='venta'?'Venta':'Compra'}</span></td>
        <td style="font-size:12px">${f.fecha}</td>
        <td style="text-align:right">${f.g10 ? fmt(f.g10-iva10(f.g10)) : '—'}</td>
        <td style="text-align:right">${f.g5 ? fmt(f.g5-iva5(f.g5)) : '—'}</td>
        <td style="text-align:right">${f.exenta ? fmt(f.exenta) : '—'}</td>
        <td style="text-align:right">${fmt(c.ivaTotal)}</td>
        <td style="text-align:right;font-weight:600">${fmt(c.total)}</td>
        <td><button class="btn btn-danger btn-sm" onclick="eliminarFacturaPerfil(${f.id})"><i class="ti ti-trash"></i></button></td>
      </tr>`
    }).join('')}</tbody>
  </table></div>`
}

async function eliminarFacturaPerfil(id) {
  if (!confirm('¿Eliminar esta factura?')) return
  const { error } = await db.from('facturas').delete().eq('id', id)
  if (error) { alert('Error: '+error.message); return }
  facturas = facturas.filter(f => f.id!==id)
  renderPerfilHistorial()
  renderPerfilResumen()
}

// ── Perfil — Nueva factura ──────────────────────────────────
function limpiarFormPerfil() {
  ['pf-nro','pf-total','pf-exenta','pf-g5'].forEach(id => { const el=document.getElementById(id); el.value=''; el.style.fontFamily='' })
  const g10El = document.getElementById('pf-g10')
  g10El.value=''; g10El.classList.remove('auto-fill'); g10El.placeholder='automático'
  pfAutoMode = true
  document.getElementById('pf-btn-reset').style.display = 'none'
  document.getElementById('pf-fecha').value = hoy
  document.getElementById('pf-tipo').value = 'venta'
  document.getElementById('pf-nro-preview').textContent = ''
  document.getElementById('pf-falta-box').className = 'falta-box'
  document.getElementById('pf-timbrado-inline').classList.remove('visible')
  ;['pr-exenta-grav','pr-exenta-iva','pr-g10-grav','pr-g10-iva','pr-g5-grav','pr-g5-iva'].forEach(id => document.getElementById(id).textContent='—')
  ;['pr-iva-total','pr-distribuido'].forEach(id => document.getElementById(id).textContent='Gs. 0')
  document.getElementById('pr-total-final').textContent = 'Gs. 0'
}

function onNroInputPerfil(inp) {
  const d = inp.value.replace(/\D/g,'')
  const prev = document.getElementById('pf-nro-preview')
  if (!d) { prev.textContent=''; prev.className='nro-preview'; return }
  prev.textContent = '→ '+formatearNro(d)
  prev.className = 'nro-preview'+(d.length>=7?' completo':'')
}
function onNroBlurPerfil(inp) {
  const d = inp.value.replace(/\D/g,'')
  if (!d) { inp.value=''; document.getElementById('pf-nro-preview').textContent=''; return }
  inp.value = formatearNro(d)
  inp.style.fontFamily = 'var(--font-mono)'
  document.getElementById('pf-nro-preview').textContent = ''
}

function onPfG10Input() {
  pfAutoMode = false
  document.getElementById('pf-g10').classList.remove('auto-fill')
  document.getElementById('pf-btn-reset').style.display = 'inline'
  recalcularPerfil()
}
function resetAutoPerfil() {
  pfAutoMode = true
  document.getElementById('pf-btn-reset').style.display = 'none'
  recalcularPerfil()
}

function recalcularPerfil() {
  const total = parseFloat(document.getElementById('pf-total').value)||0
  const exenta = parseFloat(document.getElementById('pf-exenta').value)||0
  const g5 = parseFloat(document.getElementById('pf-g5').value)||0
  const g10Inp = document.getElementById('pf-g10')
  let g10
  if (pfAutoMode) {
    g10 = Math.max(0, total-exenta-g5)
    g10Inp.value = total>0 ? (g10>0?g10:'') : ''
    g10Inp.classList.add('auto-fill')
    document.getElementById('pf-btn-reset').style.display = 'none'
  } else { g10 = parseFloat(g10Inp.value)||0 }
  const distribuido = Math.round(exenta+g5+g10)
  const resto = Math.round(total-distribuido)
  const iv10=iva10(g10), grav10=g10-iv10, iv5=iva5(g5), grav5=g5-iv5, ivaTotal=iv10+iv5
  document.getElementById('pr-exenta-grav').textContent = exenta?fmt(exenta):'—'
  document.getElementById('pr-exenta-iva').textContent = exenta?'0':'—'
  document.getElementById('pr-g10-grav').textContent = g10?fmt(grav10):'—'
  document.getElementById('pr-g10-iva').textContent = g10?fmt(iv10):'—'
  document.getElementById('pr-g5-grav').textContent = g5?fmt(grav5):'—'
  document.getElementById('pr-g5-iva').textContent = g5?fmt(iv5):'—'
  document.getElementById('pr-iva-total').textContent = 'Gs. '+fmt(ivaTotal)
  document.getElementById('pr-distribuido').textContent = 'Gs. '+fmt(distribuido)
  document.getElementById('pr-total-final').textContent = 'Gs. '+fmt(total||distribuido)
  const fb = document.getElementById('pf-falta-box')
  if (total>0) {
    if (resto===0) { fb.className='falta-box ok visible'; fb.innerHTML='<i class="ti ti-circle-check"></i> Total distribuido correctamente' }
    else if (resto>0) { fb.className='falta-box warn visible'; fb.innerHTML=`<i class="ti ti-alert-circle"></i> Faltan <strong style="margin:0 4px">Gs. ${fmt(resto)}</strong>` }
    else { fb.className='falta-box warn visible'; fb.innerHTML=`<i class="ti ti-alert-circle"></i> Exceso de <strong style="margin:0 4px">Gs. ${fmt(Math.abs(resto))}</strong>` }
  } else fb.className = 'falta-box'
}

function toggleTimbradoPerfil() { document.getElementById('pf-timbrado-inline').classList.toggle('visible') }

async function agregarTimbradoPerfil() {
  const nro=document.getElementById('pnt-nro').value.trim()
  const inicio=document.getElementById('pnt-inicio').value
  const fin=document.getElementById('pnt-fin').value
  if (!nro||!inicio||!fin) { alert('Todos los campos son obligatorios.'); return }
  if (fin<=inicio) { alert('El fin debe ser posterior al inicio.'); return }
  if (timbrados.find(t=>t.nro===nro)) { alert('Ya existe ese timbrado.'); return }
  const { data, error } = await db.from('timbrados').insert({nro,inicio,fin}).select().single()
  if (error) { alert('Error: '+error.message); return }
  timbrados.push(data)
  ;['pnt-nro','pnt-inicio','pnt-fin'].forEach(id=>document.getElementById(id).value='')
  document.getElementById('pf-timbrado-inline').classList.remove('visible')
  renderTimbrados(); poblarTimbradosPerfil()
  document.getElementById('pf-timbrado').value = nro
}

function poblarTimbradosPerfil() {
  const sel = document.getElementById('pf-timbrado')
  const prev = sel.value
  const vigentes = timbrados.filter(t=>estadoTimbrado(t)!=='vencido')
  sel.innerHTML = '<option value="">— Sin timbrado —</option>'+vigentes.map(t=>`<option value="${t.nro}">${t.nro} · vence ${t.fin}</option>`).join('')
  if (prev) sel.value = prev
}

async function guardarFacturaPerfil() {
  if (!clienteActivo) return
  const nroRaw = document.getElementById('pf-nro').value.trim()
  const digits = nroRaw.replace(/\D/g,'')
  const nro = formatearNro(digits)
  const fecha = document.getElementById('pf-fecha').value
  const timbradoVal = document.getElementById('pf-timbrado').value
  const totalInput = parseFloat(document.getElementById('pf-total').value)||0
  const exenta = parseFloat(document.getElementById('pf-exenta').value)||0
  const g10 = parseFloat(document.getElementById('pf-g10').value)||0
  const g5 = parseFloat(document.getElementById('pf-g5').value)||0
  if (!nro||digits.length<7) { alert('N° de factura inválido.'); return }
  if (!fecha) { alert('La fecha es obligatoria.'); return }
  if (!g10&&!g5&&!exenta) { alert('Ingresá al menos un monto.'); return }
  const distribuido = exenta+g5+g10
  if (totalInput&&Math.abs(totalInput-distribuido)>1) { if (!confirm('El total distribuido no coincide. ¿Guardar igual?')) return }
  const payload = {
    tipo: document.getElementById('pf-tipo').value,
    nro, fecha, cliente_id: clienteActivo.id,
    ruc: clienteActivo.ruc, nombre: clienteActivo.nombre,
    total: totalInput||distribuido, g10, g5, exenta, timbrado: timbradoVal
  }
  const { data, error } = await db.from('facturas').insert(payload).select().single()
  if (error) { alert('Error al guardar: '+error.message); return }
  facturas.unshift(data)
  limpiarFormPerfil()
  renderPerfilHistorial(); renderPerfilResumen()
  perfilTab('historial', document.querySelectorAll('.perfil-tab')[0])
  alert('Factura guardada: '+nro)
}

// ── Timbrados ──────────────────────────────────
async function agregarTimbrado() {
  const nro=document.getElementById('t-nro').value.trim()
  const inicio=document.getElementById('t-inicio').value
  const fin=document.getElementById('t-fin').value
  if (!nro||!inicio||!fin) { alert('Todos los campos son obligatorios.'); return }
  if (fin<=inicio) { alert('El fin debe ser posterior al inicio.'); return }
  if (timbrados.find(t=>t.nro===nro)) { alert('Ya existe ese timbrado.'); return }
  const { data, error } = await db.from('timbrados').insert({nro,inicio,fin}).select().single()
  if (error) { alert('Error: '+error.message); return }
  timbrados.push(data)
  ;['t-nro','t-inicio','t-fin'].forEach(id=>document.getElementById(id).value='')
  renderTimbrados()
}

async function eliminarTimbrado(id) {
  if (!confirm('¿Eliminar timbrado?')) return
  const { error } = await db.from('timbrados').delete().eq('id', id)
  if (error) { alert('Error: '+error.message); return }
  timbrados = timbrados.filter(t=>t.id!==id)
  renderTimbrados(); poblarTimbradosPerfil()
}

function renderTimbrados() {
  const el = document.getElementById('lista-timbrados')
  if (!timbrados.length) { el.innerHTML='<p class="empty-state">No hay timbrados aún.</p>'; return }
  const sorted = [...timbrados].sort((a,b)=>b.fin.localeCompare(a.fin))
  el.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Número</th><th>Inicio</th><th>Fin</th><th>Estado</th><th></th></tr></thead>
    <tbody>${sorted.map(t => {
      const est=estadoTimbrado(t)
      const label=est==='vigente'?'Vigente':est==='proximo'?'Vence pronto':'Vencido'
      return `<tr>
        <td><span class="tag">${t.nro}</span></td>
        <td style="font-size:12px">${t.inicio}</td><td style="font-size:12px">${t.fin}</td>
        <td><span class="badge badge-${est}">${label}</span></td>
        <td><button class="btn btn-danger btn-sm" onclick="eliminarTimbrado(${t.id})"><i class="ti ti-trash"></i></button></td>
      </tr>`
    }).join('')}</tbody></table></div>`
}

// ── Todas las facturas ──────────────────────────────────
function renderFiltroCliente() {
  const sel = document.getElementById('f-filtro-cliente')
  const val = sel.value
  sel.innerHTML = '<option value="">Todos los clientes</option>'+clientes.map(c=>`<option value="${c.id}">${c.nombre}</option>`).join('')
  sel.value = val
}

function renderFacturas() {
  const tipo=document.getElementById('f-filtro-tipo').value
  const cid=document.getElementById('f-filtro-cliente').value
  const mes=document.getElementById('f-filtro-mes').value
  let list = facturas.filter(f => {
    if (tipo&&f.tipo!==tipo) return false
    if (cid&&f.cliente_id!=cid) return false
    if (mes&&!f.fecha.startsWith(mes)) return false
    return true
  })
  const el = document.getElementById('lista-facturas')
  if (!list.length) { el.innerHTML='<p class="empty-state">No hay facturas para los filtros seleccionados.</p>'; document.getElementById('resumen-filtrado').innerHTML=''; return }
  el.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>N° Factura</th><th>Tipo</th><th>Fecha</th><th>Cliente</th>
    <th style="text-align:right">Grav.10%</th><th style="text-align:right">Grav.5%</th>
    <th style="text-align:right">Exenta</th><th style="text-align:right">IVA</th>
    <th style="text-align:right">Total</th><th></th></tr></thead>
    <tbody>${list.map(f => {
      const c=calcIVA(f)
      return `<tr>
        <td style="font-family:var(--font-mono);font-size:11px">${f.nro}</td>
        <td><span class="badge badge-${f.tipo}">${f.tipo==='venta'?'V':'C'}</span></td>
        <td style="font-size:12px">${f.fecha}</td>
        <td style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.nombre||'—'}</td>
        <td style="text-align:right">${f.g10?fmt(f.g10-iva10(f.g10)):'—'}</td>
        <td style="text-align:right">${f.g5?fmt(f.g5-iva5(f.g5)):'—'}</td>
        <td style="text-align:right">${f.exenta?fmt(f.exenta):'—'}</td>
        <td style="text-align:right">${fmt(c.ivaTotal)}</td>
        <td style="text-align:right;font-weight:600">${fmt(c.total)}</td>
        <td><button class="btn btn-danger btn-sm" onclick="eliminarFacturaGlobal(${f.id})"><i class="ti ti-trash"></i></button></td>
      </tr>`
    }).join('')}</tbody></table></div>`
  const tot = list.reduce((a,f) => { const c=calcIVA(f); return { g10:a.g10+(f.g10||0), g5:a.g5+(f.g5||0), exenta:a.exenta+(f.exenta||0), iva:a.iva+c.ivaTotal, total:a.total+c.total } }, {g10:0,g5:0,exenta:0,iva:0,total:0})
  document.getElementById('resumen-filtrado').innerHTML = `<div class="resumen-filtrado">
    <div class="resumen-filtrado-item"><p>${list.length} factura${list.length!==1?'s':''}</p><p style="color:var(--text-subtle)">seleccionadas</p></div>
    <div class="resumen-filtrado-item"><p>Gravada 10%</p><p>Gs. ${fmt(tot.g10-iva10(tot.g10))}</p></div>
    <div class="resumen-filtrado-item"><p>Gravada 5%</p><p>Gs. ${fmt(tot.g5-iva5(tot.g5))}</p></div>
    <div class="resumen-filtrado-item"><p>Exenta</p><p>Gs. ${fmt(tot.exenta)}</p></div>
    <div class="resumen-filtrado-item"><p>IVA total</p><p>Gs. ${fmt(tot.iva)}</p></div>
    <div class="resumen-filtrado-item"><p>Total</p><p style="font-size:15px;color:var(--white)">Gs. ${fmt(tot.total)}</p></div>
  </div>`
}

async function eliminarFacturaGlobal(id) {
  if (!confirm('¿Eliminar esta factura?')) return
  const { error } = await db.from('facturas').delete().eq('id', id)
  if (error) { alert('Error: '+error.message); return }
  facturas = facturas.filter(f=>f.id!==id)
  renderFacturas()
}

// ── Usuarios ──────────────────────────────────
async function crearUsuario() {
  const email = document.getElementById('u-email').value.trim()
  const password = document.getElementById('u-password').value
  const msgEl = document.getElementById('u-msg')
  if (!email||!password) { msgEl.textContent='Completá email y contraseña.'; msgEl.style.color='var(--danger-text)'; msgEl.style.display='block'; return }
  if (password.length<6) { msgEl.textContent='La contraseña debe tener al menos 6 caracteres.'; msgEl.style.color='var(--danger-text)'; msgEl.style.display='block'; return }
  const { error } = await db.auth.signUp({ email, password })
  if (error) {
    msgEl.textContent = 'Error: '+error.message
    msgEl.style.color = 'var(--danger-text)'
    msgEl.style.display = 'block'
    return
  }
  msgEl.textContent = `✓ Usuario creado: ${email}. Ya puede iniciar sesión.`
  msgEl.style.color = 'var(--green)'
  msgEl.style.display = 'block'
  document.getElementById('u-email').value = ''
  document.getElementById('u-password').value = ''
  setTimeout(() => { msgEl.style.display='none' }, 5000)
  renderUsuarios()
}

async function renderUsuarios() {
  const el = document.getElementById('lista-usuarios')
  // Listamos usuarios desde auth (solo disponible con service role, así que mostramos los de nuestra tabla de clientes como referencia)
  el.innerHTML = `<div class="card">
    <p class="card-title">Usuarios con acceso</p>
    <div class="info-box" style="margin-bottom:1rem">
      <i class="ti ti-info-circle"></i>
      Para ver todos los usuarios o eliminarlos, podés gestionarlos desde <strong>Supabase → Authentication → Users</strong>.
    </div>
    <p style="font-size:13px;color:var(--text-soft)">Creá nuevos usuarios arriba con email y contraseña. Cada usuario tendrá acceso completo al sistema.</p>
  </div>`
}

// ── Start ──────────────────────────────────
init()
