// =========================================================
// PESTAÑA ⚡ CORTES: cortes programados de las empresas eléctricas × red FTTH/ODN
// Datos de cortes: data/cortes.json (lo actualiza GitHub Actions).
// Coberturas: se suben aquí (KMZ) y quedan guardadas en la hoja de Google (pestañas COB_FTTH / COB_ODN).
// =========================================================
(function () {
  const $ = id => document.getElementById(id);
  const C = window.CortesCore;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtN = n => Number(n || 0).toLocaleString('es-PE');
  const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const fmtFecha = s => { const d = new Date(s + 'T12:00:00'); return `${DIAS[d.getDay()]} ${s.slice(8, 10)}/${s.slice(5, 7)}`; };
  const COLOR = { hoy: '#dc2626', prox: '#f59e0b', pas: '#64748b' };
  const colorDif = d => d === 0 ? COLOR.hoy : d > 0 ? COLOR.prox : COLOR.pas;
  const CONF = { calle: 'Alta', area: 'Alta', sector: 'Media', localidad: 'Media', distrito: 'Baja', provincia: 'Baja' };

  const S = {
    started: false, data: null, nets: { FTTH: null, ODN: null }, infos: { FTTH: null, ODN: null }, clientes: null,
    res: [], ref: C.dstr(new Date()), dias: 7, soloRed: true, aprox: false, branch: '', sel: null,
    map: null, layers: {}
  };

  // ---------- utilidades ----------
  function b64ToBytes(b64) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  async function gunzipJson(b64) {
    const stream = new Blob([b64ToBytes(b64)]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text());
  }
  function toast(msg, ms = 3500) {
    const t = $('ctToast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms);
  }
  function chips(arr, max = 12, cls = 'ct-chip') {
    if (!arr.length) return '<span class="text-muted small">—</span>';
    const shown = arr.slice(0, max).map(x => `<span class="${cls}">${esc(x)}</span>`).join('');
    return shown + (arr.length > max ? `<span class="ct-chip ct-more" title="${esc(arr.slice(max).join(', '))}">+${arr.length - max}</span>` : '');
  }

  // ---------- carga ----------
  async function cargarCortes() {
    try {
      const r = await fetch('data/cortes.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      S.data = await r.json();
    } catch (e) {
      S.data = { cortes: [], fuentes: [], error: 'No se pudo leer data/cortes.json (' + e.message + ')' };
    }
  }
  async function cargarCobertura(tipo) {
    try {
      const cov = await callGAS('getCoverage', tipo);
      if (!cov) { S.nets[tipo] = null; S.infos[tipo] = null; return; }
      S.infos[tipo] = cov.info;
      S.nets[tipo] = C.decodeNetwork(await gunzipJson(cov.b64));
    } catch (e) {
      S.infos[tipo] = { error: e.message };
      S.nets[tipo] = null;
    }
  }
  async function cargarClientes() {
    if (S.clientes) return;
    try { S.clientes = C.clientsFromSheet(window.__fbbBts || await callGAS('getBTSData')); }
    catch (e) { S.clientes = {}; }
  }
  window.addEventListener('fbb-bts', e => { window.__fbbBts = e.detail; S.clientes = C.clientsFromSheet(e.detail); if (S.started) recalcular(); });

  async function iniciar() {
    if (S.started) return;
    S.started = true;
    $('ctBody').innerHTML = '<div class="text-center text-muted py-5"><div class="spinner-border text-primary mb-2"></div><div>Cargando cortes y coberturas…</div></div>';
    await Promise.all([cargarCortes(), cargarCobertura('FTTH'), cargarCobertura('ODN'), cargarClientes()]);
    construir();
    recalcular();
  }

  // ---------- cálculo ----------
  function recalcular() {
    if (!S.data) return;
    S.res = C.cruzar(S.data.cortes || [], [S.nets.FTTH, S.nets.ODN], { ref: S.ref, incluirAprox: S.aprox });
    pintar();
  }
  function visibles() {
    const net = S.nets.FTTH;
    return S.res.filter(r => {
      if (Math.abs(r.dif) > S.dias) return false;
      if (S.soloRed && net && !r.afecta) return false;
      if (S.branch && net) { if (![...r.zones].some(z => net.zones[z].branch === S.branch)) return false; }
      return true;
    }).sort((a, b) => (a.fechas[0] + (a.c.ini || '')).localeCompare(b.fechas[0] + (b.c.ini || '')));
  }
  function resumenDe(r) { return C.resumen([r], S.nets.FTTH, S.clientes); }

  // ---------- estructura ----------
  function construir() {
    const branches = S.nets.FTTH ? S.nets.FTTH.branches : [];
    $('ctBody').innerHTML = `
      <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
        <div class="me-auto">
          <h4 class="fw-bold mb-0">⚡ Cortes programados</h4>
          <div class="small text-muted" id="ctFuentes"></div>
        </div>
        <div class="d-flex flex-wrap align-items-center gap-2">
          <label class="small text-muted">Fecha</label>
          <input type="date" class="form-control form-control-sm" style="width:150px" id="ctRef" value="${S.ref}">
          <select class="form-select form-select-sm" style="width:130px" id="ctDias">
            ${[3, 7, 15, 30].map(d => `<option value="${d}" ${d === S.dias ? 'selected' : ''}>±${d} días</option>`).join('')}
          </select>
          <select class="form-select form-select-sm" style="width:150px" id="ctBranch">
            <option value="">Todos los branch</option>${branches.map(b => `<option ${b === S.branch ? 'selected' : ''}>${esc(b)}</option>`).join('')}
          </select>
          <div class="form-check form-switch small mb-0" title="Mostrar solo cortes que tocan tu red">
            <input class="form-check-input" type="checkbox" id="ctSoloRed" ${S.soloRed ? 'checked' : ''}><label class="form-check-label" for="ctSoloRed">Solo afectan red</label>
          </div>
          <div class="form-check form-switch small mb-0" title="Incluir cortes ubicados solo a nivel distrito/provincia (confianza baja)">
            <input class="form-check-input" type="checkbox" id="ctAprox" ${S.aprox ? 'checked' : ''}><label class="form-check-label" for="ctAprox">Incluir ubicación aprox.</label>
          </div>
          <button class="btn btn-sm btn-success fw-bold" id="ctKmz">⬇ Descargar KMZ</button>
          <div class="dropdown">
            <button class="btn btn-sm btn-outline-primary fw-bold dropdown-toggle" data-bs-toggle="dropdown">⬆ Subir cobertura</button>
            <ul class="dropdown-menu dropdown-menu-end">
              <li><a class="dropdown-item" href="#" data-subir="FTTH">1. Cobertura FTTH actualizada (.kmz/.kml)</a></li>
              <li><a class="dropdown-item" href="#" data-subir="ODN">2. Cobertura ODN actualizada (.kmz/.kml)</a></li>
            </ul>
          </div>
          <input type="file" id="ctFile" accept=".kmz,.kml" class="d-none">
        </div>
      </div>
      <div class="d-flex flex-wrap gap-2 mb-3 small" id="ctCob"></div>
      <div id="ctAviso"></div>
      <div class="ct-kpis mb-3" id="ctKpis"></div>
      <div class="row g-3 mb-3">
        <div class="col-xl-8"><div class="section-container p-2 mb-0"><div id="ctMap"></div></div></div>
        <div class="col-xl-4"><div class="section-container mb-0 ct-side">
          <div class="fw-bold mb-2">Cortes de hoy <span class="text-muted fw-normal small" id="ctHoyFecha"></span></div>
          <div id="ctHoy"></div>
        </div></div>
      </div>
      <div class="section-container" id="ctDetalle" style="display:none"></div>
      <div class="section-container">
        <div class="d-flex align-items-center mb-2">
          <div class="fw-bold">Próximos cortes</div>
          <div class="small text-muted ms-2" id="ctProxInfo"></div>
        </div>
        <div class="table-responsive"><table class="table table-sm table-hover ct-table mb-0" id="ctProx"></table></div>
      </div>
      <div class="section-container">
        <div class="fw-bold mb-2">Cortes recientes (ya ocurridos dentro de la ventana)</div>
        <div class="table-responsive"><table class="table table-sm table-hover ct-table mb-0" id="ctPas"></table></div>
      </div>`;
    $('ctRef').addEventListener('change', e => { S.ref = e.target.value || C.dstr(new Date()); recalcular(); });
    $('ctDias').addEventListener('change', e => { S.dias = +e.target.value; pintar(); });
    $('ctBranch').addEventListener('change', e => { S.branch = e.target.value; pintar(); });
    $('ctSoloRed').addEventListener('change', e => { S.soloRed = e.target.checked; pintar(); });
    $('ctAprox').addEventListener('change', e => { S.aprox = e.target.checked; recalcular(); });
    $('ctKmz').addEventListener('click', descargarKmz);
    document.querySelectorAll('[data-subir]').forEach(a => a.addEventListener('click', ev => {
      ev.preventDefault(); $('ctFile').dataset.tipo = a.dataset.subir; $('ctFile').value = ''; $('ctFile').click();
    }));
    $('ctFile').addEventListener('change', e => { if (e.target.files[0]) procesarKmz(e.target.files[0], e.target.dataset.tipo); });
    crearMapa();
  }

  // ---------- pintar todo ----------
  function pintar() {
    const net = S.nets.FTTH;
    const vis = visibles();
    const hoy = vis.filter(r => r.dif === 0);
    const prox = vis.filter(r => r.dif > 0);
    const pas = vis.filter(r => r.dif < 0).reverse();

    // fuentes
    const d = S.data;
    const fu = (d.fuentes || []).map(f => `<span class="${f.ok ? 'text-success' : 'text-danger'}" title="${esc(f.error || f.url)}">${f.ok ? '●' : '✕'} ${esc(f.empresa || new URL(f.url).hostname)}${f.ok ? ' (' + f.cortes + ')' : ''}</span>`).join(' · ');
    $('ctFuentes').innerHTML = (d.generado ? `Actualizado: ${esc(d.generado.replace('T', ' '))} · ` : '') + (fu || '') + (d.error ? ` <span class="text-danger">${esc(d.error)}</span>` : '');

    // coberturas
    $('ctCob').innerHTML = ['FTTH', 'ODN'].map(t => {
      const i = S.infos[t], n = S.nets[t];
      if (i && i.error) return `<span class="ct-cob bad">${t}: error al leer (${esc(i.error)})</span>`;
      if (!n) return `<span class="ct-cob off">${t}: sin cargar — usa “⬆ Subir cobertura”</span>`;
      const st = n.stats || {};
      return `<span class="ct-cob ok" title="${esc(n.archivo)}">${t}: <b>${esc(n.archivo)}</b> · ${fmtN(st.branches)} branch · ${fmtN(st.zonas)} zonas · ${fmtN(st.olt)} OLT · ${fmtN(st.hub)} HUBBOX · ${fmtN(st.nap)} ODB/NAP · subido ${i && i.subidoEl ? esc(i.subidoEl.slice(0, 10)) + ' por ' + esc(i.subidoPor) : ''}</span>`;
    }).join('');
    $('ctAviso').innerHTML = !net ? '<div class="alert alert-info py-2 small">Aún no hay cobertura FTTH cargada: se muestran los cortes, pero no qué Branch/BTS/OLT/NAP afectan. Usa <b>⬆ Subir cobertura → Cobertura FTTH</b>.</div>' : '';

    // KPIs del día
    const s = C.resumen(hoy, net, S.clientes);
    const card = (t, v, sub, cls = '') => `<div class="card kpi-card ct-kpi ${cls}"><div class="card-body p-3"><div class="small text-muted fw-semibold">${t}</div><div class="kpi-number">${v}</div><div class="ct-kpi-sub">${sub || ''}</div></div></div>`;
    const sinCli = s.cliSinDato.length ? `<span class="text-warning" title="OLT sin dato Active en la hoja: ${esc(s.cliSinDato.join(', '))}">⚠ ${s.cliSinDato.length} OLT sin dato</span>` : 'según Active por OLT';
    $('ctKpis').innerHTML =
      card('Cortes hoy', fmtN(hoy.length), `${fmtFecha(S.ref)}${S.soloRed && net ? ' · que tocan la red' : ''}`, 'ct-red') +
      card('Branch', fmtN(s.branches.length), chips(s.branches)) +
      card('BTS', fmtN(s.bts.length), chips(s.bts, 8)) +
      card('OLT', fmtN(s.olts.length), chips(s.olts, 6)) +
      card('Duración del día', s.ini ? `${s.ini} – ${s.fin}` : '—', s.dur !== null ? C.fmtDur(s.dur) + ' (primer inicio → último fin)' : 'sin horario') +
      card('Clientes afectados', !net ? '—' : (sinDatoTotal(s) ? '—' : '~' + fmtN(s.clientes)), net ? sinCli : 'sube la cobertura FTTH') +
      card('HUBBOX', fmtN(s.hubs.length), chips(s.hubs.map(h => hubName(h)), 4)) +
      card('ODB (cajas NAP)', fmtN(s.naps.length), s.lines.length ? `${fmtN(s.lines.length)} tramos de fibra cerca` : '') +
      (S.nets.ODN ? card('Elementos ODN', fmtN(s.odn.length), 'puntos ODN dentro del área') : '');

    // lista de hoy
    $('ctHoyFecha').textContent = fmtFecha(S.ref);
    $('ctHoy').innerHTML = hoy.length ? hoy.map(r => {
      const rs = resumenDe(r);
      return `<div class="ct-item" data-id="${esc(r.c.id)}">
        <div class="d-flex justify-content-between"><b>${esc(r.c.ini || '?')}–${esc(r.c.fin || '?')}</b><span class="badge bg-light text-dark border">${esc(r.c.empresa)}</span></div>
        <div class="small">${esc(r.c.distrito || r.c.provincia || r.c.region)} · ${esc(resumenTexto(r.c))}</div>
        ${net ? `<div class="small text-muted">${rs.olts.length ? 'OLT ' + esc(rs.olts.join(', ')) : 'sin red FTTH cerca'} · ${fmtN(rs.naps.length)} NAP · ~${fmtN(rs.clientes)} cli.</div>` : ''}
      </div>`;
    }).join('') : '<div class="text-muted small">No hay cortes para esta fecha con los filtros actuales.</div>';
    document.querySelectorAll('#ctHoy .ct-item').forEach(el => el.addEventListener('click', () => seleccionar(el.dataset.id)));

    // tablas
    tabla('ctProx', prox, true);
    tabla('ctPas', pas, false);
    $('ctProxInfo').textContent = `${prox.length} en los próximos ${S.dias} días`;

    pintarMapa(vis);
    if (S.sel) mostrarDetalle(S.sel, false);
  }

  function sinDatoTotal(s) { const k = Object.keys(s.napsPorOlt).length; return k > 0 && s.cliSinDato.length === k; }
  function resumenTexto(c) {
    const t = (c.titulo || c.texto || '').replace(/\s+/g, ' ').trim();
    return t.length > 90 ? t.slice(0, 89) + '…' : t;
  }
  function hubName(h) {
    const net = S.nets.FTTH; const H = net.hubs[h]; const Z = net.zones[H.z];
    return (Z.olt || Z.n) + ' ' + H.n;
  }

  function tabla(id, rs, futuro) {
    const net = S.nets.FTTH;
    const head = `<thead><tr><th>Fecha</th><th>Horario</th><th>Duración</th><th>Empresa</th><th>Zona del corte</th>${net ? '<th>Branch</th><th>BTS</th><th>OLT</th><th>Clientes</th><th>HUBBOX</th><th>ODB</th>' : ''}<th>Ubicación</th></tr></thead>`;
    if (!rs.length) { $(id).innerHTML = head + `<tbody><tr><td colspan="12" class="text-muted">${futuro ? 'Sin cortes próximos' : 'Sin cortes recientes'} con los filtros actuales.</td></tr></tbody>`; return; }
    $(id).innerHTML = head + '<tbody>' + rs.map(r => {
      const s = resumenDe(r);
      const conf = [...new Set((r.c.f || []).map(f => CONF[f.pr]))];
      const confTxt = conf.includes('Alta') ? 'Alta' : conf.includes('Media') ? 'Media' : conf.length ? 'Baja' : '—';
      return `<tr data-id="${esc(r.c.id)}" class="${r.c.estado === 'SUSPENDIDO' ? 'text-decoration-line-through text-muted' : ''}">
        <td>${fmtFecha(r.fechas[0])}${r.fechas.length > 1 ? ' +' + (r.fechas.length - 1) : ''}<div class="small text-muted">${futuro ? 'en ' + r.dif + ' d' : 'hace ' + (-r.dif) + ' d'}</div></td>
        <td>${esc(r.c.ini && r.c.fin ? r.c.ini + '–' + r.c.fin : r.c.hora)}</td>
        <td>${C.fmtDur(r.dur)}</td>
        <td>${esc(r.c.empresa)}</td>
        <td class="ct-wrap" title="${esc(r.c.texto)}"><b>${esc(r.c.distrito || r.c.provincia || r.c.region)}</b> · ${esc(resumenTexto(r.c))}</td>
        ${net ? `<td>${esc(s.branches.join(', '))}</td><td class="ct-wrap">${esc(s.bts.join(', '))}</td><td class="ct-wrap">${esc(s.olts.join(', '))}</td><td>${s.naps.length && !sinDatoTotal(s) ? '~' + fmtN(s.clientes) : '—'}</td><td>${fmtN(s.hubs.length)}</td><td>${fmtN(s.naps.length)}</td>` : ''}
        <td><span class="ct-conf ct-conf-${confTxt}">${confTxt}</span>${r.c.estado === 'SUSPENDIDO' ? ' <span class="badge bg-secondary">Suspendido</span>' : ''}</td>
      </tr>`;
    }).join('') + '</tbody>';
    $(id).querySelectorAll('tbody tr[data-id]').forEach(tr => tr.addEventListener('click', () => seleccionar(tr.dataset.id)));
  }

  // ---------- detalle ----------
  function seleccionar(id) { S.sel = id; mostrarDetalle(id, true); }
  function mostrarDetalle(id, zoom) {
    const r = S.res.find(x => x.c.id === id);
    const box = $('ctDetalle');
    if (!r) { box.style.display = 'none'; return; }
    const net = S.nets.FTTH, s = resumenDe(r), c = r.c;
    const napList = net ? s.naps.map(i => { const n = net.naps[i]; const Z = net.zones[n.z]; return `${Z.olt || Z.n} ${n.h >= 0 ? net.hubs[n.h].n + '/' : ''}${n.n}`; }).sort() : [];
    const porOlt = Object.entries(s.napsPorOlt).map(([o, k]) => {
      const act = S.clientes && S.clientes[o], tot = net.napsPerOlt[o] || k;
      return `<tr><td>${esc(o)}</td><td>${k} / ${tot}</td><td>${act === undefined ? '<span class="text-warning">sin dato</span>' : fmtN(act)}</td><td>${act === undefined ? '—' : '~' + fmtN(Math.round(act * Math.min(1, k / tot)))}</td></tr>`;
    }).join('');
    box.style.display = '';
    box.innerHTML = `
      <div class="d-flex align-items-start gap-2 mb-2">
        <div class="me-auto">
          <div class="fw-bold fs-6">${esc(c.empresa)} · ${r.fechas.map(fmtFecha).join(', ')} · ${esc(c.ini && c.fin ? c.ini + '–' + c.fin : c.hora)} <span class="text-muted fw-normal">(${C.fmtDur(r.dur)})</span></div>
          <div class="small text-muted">${esc([c.distrito, c.provincia, c.region].filter(Boolean).join(', '))}${c.titulo ? ' · ' + esc(c.titulo) : ''}</div>
        </div>
        <a class="btn btn-sm btn-outline-secondary" href="${esc(c.imagen || c.fuente)}" target="_blank" rel="noopener">Ver fuente</a>
        <button class="btn btn-sm btn-outline-secondary" id="ctCerrarDet">✕</button>
      </div>
      <div class="row g-3">
        <div class="col-lg-5"><div class="small fw-semibold mb-1">Zonas afectadas (texto de la empresa)</div><div class="ct-texto">${esc(c.texto).replace(/\n/g, '<br>')}${c.extra ? '<br><i>' + esc(c.extra) + '</i>' : ''}</div>
          <div class="small mt-2">Ubicado en el mapa como: ${(c.f || []).map(f => `<span class="ct-chip" title="${esc(f.pr)}, radio ${f.r} m">${esc(f.n)} · ${CONF[f.pr]}</span>`).join('') || '<span class="text-muted">no se pudo ubicar</span>'}</div>
          ${r.soloAprox && !S.aprox ? '<div class="alert alert-warning py-1 px-2 small mt-2 mb-0">Este corte solo se ubicó a nivel distrito/provincia. Activa “Incluir ubicación aprox.” para cruzarlo con la red.</div>' : ''}
        </div>
        <div class="col-lg-7">${net ? `
          <div class="row g-2 small mb-2">
            <div class="col-sm-4"><b>Branch:</b> ${chips(s.branches)}</div>
            <div class="col-sm-4"><b>BTS:</b> ${chips(s.bts)}</div>
            <div class="col-sm-4"><b>OLT:</b> ${chips(s.olts)}</div>
          </div>
          <table class="table table-sm ct-mini mb-2"><thead><tr><th>OLT</th><th>NAP afectadas / total</th><th>Activos (hoja)</th><th>Clientes afectados</th></tr></thead><tbody>${porOlt || '<tr><td colspan="4" class="text-muted">Ninguna NAP dentro del área</td></tr>'}</tbody></table>
          <div class="small"><b>HUBBOX (${s.hubs.length}):</b> ${chips(s.hubs.map(hubName), 30)}</div>
          <div class="small mt-1"><b>ODB / NAP (${napList.length}):</b> ${chips(napList, 60)}</div>
          ${s.lines.length ? `<div class="small mt-1 text-muted">${s.lines.length} tramos de fibra (mensajero/ADSS) pasan por el área del corte.</div>` : ''}
          ${S.nets.ODN ? `<div class="small mt-1"><b>Elementos ODN:</b> ${fmtN(r.odn.size)} puntos, ${fmtN(r.odnLines.size)} rutas</div>` : ''}` : '<div class="text-muted small">Sube la cobertura FTTH para ver la red afectada.</div>'}
        </div>
      </div>`;
    $('ctCerrarDet').addEventListener('click', () => { S.sel = null; box.style.display = 'none'; pintarMapa(visibles()); });
    pintarMapa(visibles());
    if (zoom) {
      const b = boundsDe(r);
      if (b && b.isValid()) S.map.fitBounds(b.pad(0.3), { maxZoom: 16 });
      box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  // ---------- mapa ----------
  function crearMapa() {
    if (typeof L === 'undefined') { $('ctMap').innerHTML = '<div class="p-4 text-danger">No cargó la librería del mapa (Leaflet). Revisa tu conexión.</div>'; return; }
    S.map = L.map('ctMap', { preferCanvas: true, zoomControl: true }).setView([-9.3, -75.5], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(S.map);
    S.layers = {
      zonas: L.layerGroup(), todas: L.layerGroup(), cortes: L.layerGroup().addTo(S.map),
      fibra: L.layerGroup().addTo(S.map), hubs: L.layerGroup().addTo(S.map), naps: L.layerGroup().addTo(S.map), odn: L.layerGroup().addTo(S.map)
    };
    L.control.layers(null, {
      'Cortes (rojo hoy · naranja próximos · gris pasados)': S.layers.cortes,
      'ODB/NAP afectadas': S.layers.naps, 'HUBBOX afectados': S.layers.hubs, 'Fibra cerca del corte': S.layers.fibra,
      'Elementos ODN afectados': S.layers.odn, 'Zonas FTTH (cobertura)': S.layers.zonas, 'Todas las NAP': S.layers.todas
    }, { collapsed: true }).addTo(S.map);
    const leyenda = L.control({ position: 'bottomleft' });
    leyenda.onAdd = () => { const d = L.DomUtil.create('div', 'ct-legend'); d.innerHTML = `<span style="background:${COLOR.hoy}"></span>Hoy <span style="background:${COLOR.prox}"></span>Próximo <span style="background:${COLOR.pas}"></span>Pasado <span style="background:#7c3aed"></span>HUBBOX <span style="background:#be123c"></span>NAP`; return d; };
    leyenda.addTo(S.map);
    // la pestaña puede estar oculta al crear el mapa
    setTimeout(() => S.map.invalidateSize(), 200);
    pintarRedBase();
  }
  function pintarRedBase() {
    if (!S.map) return;
    S.layers.zonas.clearLayers(); S.layers.todas.clearLayers();
    const net = S.nets.FTTH; if (!net) return;
    net.zones.forEach(z => z.poly.forEach(p => L.polygon(p, { color: '#2563eb', weight: 1, fillOpacity: 0.05 }).bindTooltip(`${z.branch} · ${z.n}`).addTo(S.layers.zonas)));
    net.naps.forEach(n => L.circleMarker([n.la, n.lo], { radius: 2, color: '#1d4ed8', weight: 0, fillOpacity: 0.6 }).addTo(S.layers.todas));
  }
  function geomLayer(f, color, weight) {
    if (f.t === 'line') return L.polyline(f.p, { color, weight: weight || 5, opacity: 0.85 });
    if (f.t === 'poly') return L.polygon(f.p, { color, weight: 2, fillOpacity: 0.2 });
    return L.circle(f.p[0][0], { radius: f.r, color, weight: f.ap ? 1 : 2, dashArray: f.ap ? '6 6' : null, fillOpacity: f.ap ? 0.05 : 0.18 });
  }
  function boundsDe(r) {
    const pts = [];
    (r.c.f || []).forEach(f => f.p.forEach(part => part.forEach(p => pts.push(p))));
    const net = S.nets.FTTH;
    if (net) r.naps.forEach(i => pts.push([net.naps[i].la, net.naps[i].lo]));
    return pts.length ? L.latLngBounds(pts) : null;
  }
  function pintarMapa(vis) {
    if (!S.map) return;
    ['cortes', 'fibra', 'hubs', 'naps', 'odn'].forEach(k => S.layers[k].clearLayers());
    const net = S.nets.FTTH, odn = S.nets.ODN;
    const solo = S.sel ? vis.filter(r => r.c.id === S.sel) : vis;
    const napSet = new Map(), hubSet = new Map(), lineSet = new Map(), odnSet = new Set();
    solo.forEach(r => {
      const col = colorDif(r.dif);
      const pop = `<b>${esc(r.c.empresa)}</b> · ${r.fechas.map(fmtFecha).join(', ')} ${esc(r.c.ini || '')}–${esc(r.c.fin || '')}<br>${esc(r.c.distrito || r.c.provincia || '')}: ${esc(resumenTexto(r.c))}<br><a href="#" data-ct="${esc(r.c.id)}">Ver detalle</a>`;
      (r.c.f || []).forEach(f => { const lyr = geomLayer(f, col); lyr.bindPopup(pop + `<div class="small text-muted">${esc(f.n)} · confianza ${CONF[f.pr]}</div>`); lyr.addTo(S.layers.cortes); });
      r.naps.forEach(i => napSet.set(i, r.dif)); r.hubs.forEach(i => hubSet.set(i, r.dif)); r.lines.forEach(i => lineSet.set(i, r.dif)); r.odn.forEach(i => odnSet.add(i));
    });
    if (net) {
      lineSet.forEach((d, i) => L.polyline(net.lines[i].pts, { color: '#a21caf', weight: 2, opacity: 0.7 }).addTo(S.layers.fibra));
      hubSet.forEach((d, i) => { const h = net.hubs[i]; if (h.p) L.circleMarker(h.p, { radius: 7, color: '#fff', weight: 2, fillColor: '#7c3aed', fillOpacity: 1 }).bindTooltip(hubName(i)).addTo(S.layers.hubs); });
      napSet.forEach((d, i) => { const n = net.naps[i], Z = net.zones[n.z]; L.circleMarker([n.la, n.lo], { radius: 4, color: '#be123c', weight: 1, fillOpacity: 0.9 }).bindTooltip(`${Z.olt || Z.n} · ${n.h >= 0 ? net.hubs[n.h].n + ' · ' : ''}${n.n}`).addTo(S.layers.naps); });
    }
    if (odn) odnSet.forEach(i => { const n = odn.naps[i]; L.circleMarker([n.la, n.lo], { radius: 4, color: '#0f766e', weight: 1, fillOpacity: 0.9 }).bindTooltip('ODN · ' + n.n).addTo(S.layers.odn); });
  }
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[data-ct]');
    if (a) { e.preventDefault(); seleccionar(a.dataset.ct); }
  });

  // ---------- subir cobertura ----------
  function procesarKmz(file, tipo) {
    const modal = bootstrap.Modal.getOrCreateInstance($('ctModal'));
    $('ctModalTitle').textContent = `Cobertura ${tipo}: ${file.name}`;
    $('ctModalBody').innerHTML = `<div class="mb-2 small" id="ctFase">Preparando…</div><div class="progress"><div class="progress-bar progress-bar-striped progress-bar-animated" id="ctBar" style="width:2%"></div></div>
      <div class="small text-muted mt-2">${(file.size / 1048576).toFixed(1)} MB. Un archivo grande puede tardar un minuto.</div>`;
    $('ctModalOk').classList.add('d-none');
    modal.show();
    const w = new Worker('js/kmz-worker.js');
    w.onmessage = e => {
      const m = e.data;
      if (m.progreso) { $('ctFase').textContent = m.fase; $('ctBar').style.width = Math.round(m.p * 100) + '%'; return; }
      w.terminate();
      if (!m.ok) { $('ctModalBody').innerHTML = `<div class="alert alert-danger mb-0">No se pudo leer el archivo: ${esc(m.error)}</div>`; return; }
      mostrarResumenKmz(m.idx, m.b64, tipo, file.name);
    };
    w.onerror = err => { $('ctModalBody').innerHTML = `<div class="alert alert-danger mb-0">Error: ${esc(err.message)}</div>`; };
    w.postMessage({ file, tipo });
  }
  function mostrarResumenKmz(idx, b64, tipo, nombre) {
    const st = idx.stats;
    const porB = idx.branches.map((b, i) => {
      const zs = idx.zones.filter(z => z.b === i);
      const zi = new Set(zs.map(z => idx.zones.indexOf(z)));
      return `<tr><td>${esc(b)}</td><td>${zs.length}</td><td>${new Set(zs.map(z => z.olt).filter(Boolean)).size}</td><td>${idx.hubs.filter(h => zi.has(h[0])).length}</td><td>${fmtN(idx.naps.filter(n => zi.has(n[0])).length)}</td></tr>`;
    }).join('');
    const sinOlt = idx.zones.filter(z => !z.olt).map(z => z.n);
    $('ctModalBody').innerHTML = `
      <div class="mb-2">Se encontró: <b>${fmtN(st.branches)}</b> branch · <b>${fmtN(st.zonas)}</b> zonas · <b>${fmtN(st.bts)}</b> BTS · <b>${fmtN(st.olt)}</b> OLT · <b>${fmtN(st.hub)}</b> HUBBOX · <b>${fmtN(st.nap)}</b> ODB/NAP · ${fmtN(idx.lines.length)} tramos de fibra.</div>
      <div class="table-responsive" style="max-height:260px"><table class="table table-sm ct-mini"><thead><tr><th>Branch</th><th>Zonas</th><th>OLT</th><th>HUBBOX</th><th>NAP</th></tr></thead><tbody>${porB}</tbody></table></div>
      ${sinOlt.length ? `<div class="alert alert-warning py-2 small mb-2">${sinOlt.length} zona(s) sin OLT en el nombre (sus NAP saldrán sin OLT): ${esc(sinOlt.join(' · '))}</div>` : ''}
      <div class="small text-muted">Al guardar, reemplaza la cobertura ${tipo} anterior para todo el equipo (${(b64.length / 1024).toFixed(0)} KB en la hoja, pestaña COB_${tipo}).</div>`;
    const ok = $('ctModalOk');
    ok.classList.remove('d-none'); ok.disabled = false; ok.textContent = 'Guardar para todo el equipo';
    ok.onclick = async () => {
      ok.disabled = true; ok.textContent = 'Guardando…';
      try {
        const info = await callGAS('saveCoverage', tipo, { archivo: nombre, stats: idx.stats, creado: idx.creado }, b64);
        S.infos[tipo] = info; S.nets[tipo] = C.decodeNetwork(idx);
        bootstrap.Modal.getOrCreateInstance($('ctModal')).hide();
        construir(); recalcular(); pintarRedBase();
        toast(`Cobertura ${tipo} guardada.`);
      } catch (e) {
        ok.disabled = false; ok.textContent = 'Reintentar';
        $('ctModalBody').insertAdjacentHTML('beforeend', `<div class="alert alert-danger py-2 small mt-2 mb-0">No se pudo guardar: ${esc(e.message)}</div>`);
      }
    };
  }

  // ---------- descargar KMZ ----------
  async function descargarKmz() {
    if (typeof JSZip === 'undefined') { alert('No cargó la librería para crear KMZ.'); return; }
    const vis = visibles(), net = S.nets.FTTH;
    const x = s => esc(s);
    const coords = pts => pts.map(([la, lo]) => `${lo.toFixed(6)},${la.toFixed(6)},0`).join(' ');
    const geom = f => f.t === 'point' ? `<Point><coordinates>${coords([f.p[0][0]])}</coordinates></Point>`
      : f.t === 'line' ? `<MultiGeometry>${f.p.map(p => `<LineString><tessellate>1</tessellate><coordinates>${coords(p)}</coordinates></LineString>`).join('')}</MultiGeometry>`
      : `<MultiGeometry>${f.p.map(p => `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coords(p.concat([p[0]]))}</coordinates></LinearRing></outerBoundaryIs></Polygon>`).join('')}</MultiGeometry>`;
    const porFecha = {};
    vis.forEach(r => r.fechas.forEach(f => (porFecha[f] = porFecha[f] || []).push(r)));
    let body = '';
    Object.keys(porFecha).sort().forEach(f => {
      const tag = f === S.ref ? ' (HOY)' : f < S.ref ? ' (pasado)' : '';
      body += `<Folder><name>${f} ${fmtFecha(f)}${tag}</name><open>${f === S.ref ? 1 : 0}</open>`;
      porFecha[f].forEach(r => {
        const c = r.c, s = resumenDe(r), st = r.dif === 0 ? 'hoy' : r.dif > 0 ? 'prox' : 'pas';
        const desc = `<b>${x(c.empresa)}</b> · ${x(c.hora)} (${C.fmtDur(r.dur)})<br>${x([c.distrito, c.provincia, c.region].filter(Boolean).join(', '))}<br>${x(c.texto).replace(/\n/g, '<br>')}`
          + (net ? `<br><br><b>Branch:</b> ${x(s.branches.join(', '))}<br><b>BTS:</b> ${x(s.bts.join(', '))}<br><b>OLT:</b> ${x(s.olts.join(', '))}<br><b>Clientes afectados:</b> ~${s.clientes}<br><b>HUBBOX:</b> ${s.hubs.length} · <b>ODB:</b> ${s.naps.length}` : '');
        body += `<Folder><name>${x((c.ini || '') + '–' + (c.fin || '') + ' · ' + c.empresa + ' · ' + (c.distrito || c.provincia) + ' · ' + resumenTexto(c).slice(0, 50))}</name><description><![CDATA[${desc}]]></description>`;
        (c.f || []).forEach(ft => { body += `<Placemark><name>${x(ft.n)}</name><description><![CDATA[${desc}]]></description><styleUrl>#c_${st}</styleUrl>${geom(ft)}</Placemark>`; });
        if (net && (r.naps.size || r.hubs.size)) {
          body += '<Folder><name>Red FTTH afectada</name>';
          r.hubs.forEach(i => { const h = net.hubs[i]; if (h.p) body += `<Placemark><name>${x(hubName(i))}</name><styleUrl>#hub</styleUrl><Point><coordinates>${coords([h.p])}</coordinates></Point></Placemark>`; });
          r.naps.forEach(i => { const n = net.naps[i], Z = net.zones[n.z]; body += `<Placemark><name>${x(n.n)}</name><description>${x((Z.olt || Z.n) + (n.h >= 0 ? ' / ' + net.hubs[n.h].n : ''))}</description><styleUrl>#nap</styleUrl><Point><coordinates>${coords([[n.la, n.lo]])}</coordinates></Point></Placemark>`; });
          body += '</Folder>';
        }
        body += '</Folder>';
      });
      body += '</Folder>';
    });
    const sty = (id, col, icon) => `<Style id="${id}"><IconStyle><color>${col}</color><Icon><href>${icon}</href></Icon></IconStyle><LineStyle><color>${col}</color><width>5</width></LineStyle><PolyStyle><color>55${col.slice(2)}</color></PolyStyle></Style>`;
    const kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Cortes programados ±${S.dias} días desde ${S.ref}</name>`
      + sty('c_hoy', 'ff2626dc', 'http://maps.google.com/mapfiles/kml/paddle/red-circle.png')
      + sty('c_prox', 'ff0b9ef5', 'http://maps.google.com/mapfiles/kml/paddle/orange-circle.png')
      + sty('c_pas', 'ff8b7464', 'http://maps.google.com/mapfiles/kml/paddle/wht-circle.png')
      + sty('hub', 'ffed3a7c', 'http://maps.google.com/mapfiles/kml/shapes/square.png')
      + sty('nap', 'ff3c12be', 'http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png')
      + body + '</Document></kml>';
    const zip = new JSZip(); zip.file('doc.kml', kml);
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `cortes_${S.ref}.kmz`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // ---------- arranque ----------
  document.addEventListener('shown.bs.tab', e => {
    if (e.target.dataset.bsTarget !== '#tab-cortes') return;
    iniciar().then(() => S.map && setTimeout(() => S.map.invalidateSize(), 50));
  });
  window.Cortes = { iniciar, estado: S };
})();
