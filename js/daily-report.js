// =========================================================
// SECCIÓN: REPORTE DIARIO (comparativa con el día anterior + texto para WhatsApp)
// =========================================================
(function () {
  const STATUS = [
    { v: '🟢', label: '🟢 En control' },
    { v: '🟠', label: '🟠 En atención' },
    { v: '🔴', label: '🔴 Crítico' }
  ];

  // ---------- Plantilla inicial (basada en tu reporte del 17/11) ----------
  // {CLAVE} se reemplaza por el valor del indicador; {CLAVE_DIF} por la variación vs ayer;
  // {CLAVE_AYER} por el valor de ayer; {FECHA} = dd/mm/aa; {DIA} = dd/mm.
  function template() {
    return {
      date: '',
      greeting: 'Buenas noches, @Jose Mendoza BITEL\n\nEnvio el reporte diario del día de hoy',
      title: '📝*Daily Report {FECHA}*',
      metrics: [
        { key: 'TT', label: 'TT al cierre del día', value: 4519, prev: 4176, good: 'down', target: '' },
        { key: 'WO_CREADAS', label: 'WO creadas', value: 207, prev: '', good: 'none', target: '' },
        { key: 'WO_ONLINE', label: 'WO clientes online', value: 313, prev: '', good: 'up', target: '' },
        { key: 'WO_CERRADAS', label: 'WO cerradas por caídas masivas', value: 54, prev: '', good: 'up', target: '' },
        { key: 'OLT_CAIDAS', label: 'OLTs con caída masiva (24 h)', value: 8, prev: '', good: 'down', target: '' },
        { key: 'WO_IMPL', label: 'WO validadas implementación <24h', value: 109, prev: '', good: 'up', target: '' },
        { key: 'ACS', label: 'OLTs con ACS configurado', value: 64, prev: '', good: 'up', target: 404 },
        { key: 'LI4_LINEAS', label: 'Líneas afectadas LI4 (sin vehículos)', value: 16, prev: '', good: 'down', target: '' }
      ],
      items: [
        { id: 'p1', type: 'text', status: '🟢', title: 'Informar CC sobre caidas masivas a fin de evitar generar TT', owners: '@Juan Bitel FBB @Jhoel Bitel',
          body: '+ Acciones: Comunicación rápida entre FBB, CC y Branch (Branch LI1,JUN, LI3)\n+ Problemática: Incidencias a nivel de energía y cortes de cables ADSS\n+ Soluciones: Se comento a encargados de CC y Branch las caídas y se comento que es corte de energia por empresa electrica para no generar TT' },
        { id: 'p2', type: 'text', status: '🟢', title: 'Cerrar TT con servicio Online', owners: '@Juan Bitel FBB',
          body: '+ Acciones: Coordinación con los encargados de Branch para cierre de {WO_CERRADAS} WO para caidas masivas ({OLT_CAIDAS} OLTS en las últimas 24 horas), solo los manuales los cierra NOC,\n- Total de WO creadas {DIA}: {WO_CREADAS} WO\n- Total de WO clientes online {DIA}: {WO_ONLINE} WO\n+ Problemática:\n- Sin soporte aún de personal de monitoreo para fines de semana y horario fuera de oficina.\n- Falta de pago a contratas para atención y cierre de averías pendientes\n+ Soluciones:\n- Se sigue usando herramientas de monitoreo de FBB\n- Se analiza motivo de caídas masivas y busca de solución para evitar que ocurra de nuevo (Energia y Red)' },
        { id: 'p3', type: 'text', status: '🟠', title: 'implementación <24hrs', owners: '@Marlo De La Cruz Bitel @JorgeC🐦 @Cristhiann Ancieta FBB System',
          body: '+ Acciones\n* Se ha validado un total de {WO_IMPL} WO (despliegues) hasta el momento.\n* Operatividad (LI2): Retornaron teams activos en la zona, contando con 4 teams en total (incluyendo el soporte de 2 teams de DIJUSA).\n\n+ Problemática:\n* Alta carga de pendientes (LI2): A pesar del refuerzo con los 2 teams de DIJUSA y los 4 teams activos en terreno, la zona sigue registrando una gran cantidad de despliegues pendientes acumulados.\n\n+ Soluciones:\n* Compromiso de operatividad (Pagos): Los partners comentan que les han indicado que esta semana se realizarán los pagos. Han confirmado que, ni bien se concrete el depósito, sacarán a campo la totalidad de sus cuadrillas para cubrir la carga pendiente.\n* Regularización en Tableau (@Jose Mendoza): Es de suma importancia actualizar los registros en "null" que se están cargando en Tableau. Muchos partners no quieren aceptar pagos incompletos por este motivo, y solucionarlo es vital para que retomen sus labores al 100% y poder llegar a la meta.' },
        { id: 'p4', type: 'text', status: '🟠', title: 'analizar cuentas >15dias con TT', owners: '@Edgar - Número Ahora Sí y yo',
          body: '+ Acciones: Acciones correctivas y plan de mantenimiento (En proceso de mantenimiento: ARE)\n+ Problemática: Aún sin vehículos en LI4 ({LI4_LINEAS} líneas afectadas), se tiene la problematica en rojo debido a la demora, factor importante en a creación de TT, no se encuentra apoyo de ningún departamento porque no los afecta directamente, 03 linea afectadas en LI3, se encuentra en cola de incidencias al no ser prioridad por parte de subdirector.\n+ Soluciones: Constante presión a SOS, LI4 y soporte de admin, tenemos 0 apoyo de las partes involucradas' },
        { id: 'p5', type: 'text', status: '🟠', title: 'Asegurar materiales a todas las branch', owners: '@Aracely Número Bitel',
          body: '+ Implementación ODN\n- LIMA 2 > Material para Plan Mantenimiento correcto por solicitud de MTC > Pendiente recojo en minka (fecha estimada 18/11)\nNuevo despliegue lastmile\n- LI2,: Comando creado 2/11  pendiente de recojo por Branch >  (fecha estimada 18/11)\n+ Incidencias ODN\n- Branch ARE : LXKNOC/26/003261 > salio material 17/11\n- Transferncia de materiales de GPON a NOC_GPON  > APROBADO , pedniente Minka la transferncia en sistema\n+ Problematica\n- No se tiene vehiculos de Branch LI2 >  (fecha estimada 18/11)\n+ Soluciones\n- Materiales enviados según nuevo RoadMap, para evaluar stock y anticipar tiempos' },
        { id: 'p6', type: 'text', status: '🟠', title: 'ACS', owners: '@Jhoel Bitel',
          body: '+ Acciones: Configuración aplicada a {ACS} OLTs. (progreso {ACS}/{ACS_META})\n+ Problemática: ZTE no brinda soporte respecto a realizarlo mediante un parche para las OLTs en operación, se debe realizar por puerto de OLT y requiere supervisión para evitar impactar negativamente en el servicio de los clientes).\n+ Acciones:\n- 12/11: Error de provisionamiento mitigado (Autoresuelto).\n- 18/11: Se agregó configuración a 4 OLTs con alto % de clientes activos.(CAL0056, CAL0121, CAL0073, CAL0071)' },
        { id: 'p7', type: 'oltdown', status: '🟠', title: 'reporte diario de OLT down', owners: 'Detalle: ¿Qué pasó?→ ¿por qué pasó? → ¿por qué falló la protección? → ¿qué acción se tomó? → ¿qué se hará para que no se repita? @Jhoel Bitel @Juan Bitel FBB @Edgar - Número Ahora Sí y yo',
          body: '', waIds: null }
      ],
      summary: '+ Se cierra el día {DIA} con {TT} TT ({TT_DIF}), demasiados TT, aún se busca el promedio progresivo de 200 hasta poder llegar a un maximo de 100TT maximo por día.\n+ Problematica de incidencias ODN en LI4 por falta de vehiculos, presupuesto de alquiler alto.\n+ Respuesta pasiva por parte de NOC, no hay monitoreo fuera de horario de oficina y fines de semana.\n+ Problematica de incidencias lastmile por falta de pagos\n+ Tableau desactualizado\n+ Poco interes de NOC en el monitoreo fines de semana y control de material para incidencias.\n+ Material limitado para optimización de energia electrica.'
    };
  }
  window.DAILY_TEMPLATE = template;

  // ---------- Estado ----------
  const S = { reports: [], cur: null, prev: null, savedJson: '', trendChart: null };
  const clone = o => JSON.parse(JSON.stringify(o));
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const fmtDate = (iso, withYear) => { const [y, m, d] = iso.split('-'); return withYear ? `${d}/${m}/${y.slice(2)}` : `${d}/${m}`; };
  const isNum = v => v !== '' && v !== null && v !== undefined && !isNaN(Number(v));
  const fmtNum = v => isNum(v) ? Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }) : '';
  const keyFrom = label => (label || 'IND').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 20) || 'IND';
  const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const isDirty = () => S.cur && JSON.stringify(S.cur) !== S.savedJson;

  function parseReports(records) {
    return records.map(r => { try { return { id: r.id, data: JSON.parse(r.data), text: r.text }; } catch (e) { return null; } })
      .filter(Boolean).sort((a, b) => a.id.localeCompare(b.id));
  }
  const prevReportOf = date => [...S.reports].reverse().find(r => r.id < date) || null;

  // ---------- Construcción del reporte de un día ----------
  function buildFor(date) {
    const existing = S.reports.find(r => r.id === date);
    const prevRec = prevReportOf(date);
    S.prev = prevRec ? prevRec.data : null;
    let cur;
    if (existing) {
      cur = clone(existing.data);
    } else if (prevRec) {
      // Día nuevo: se copia el reporte anterior; los indicadores de hoy quedan vacíos para llenarlos.
      cur = clone(prevRec.data);
      cur.metrics.forEach(m => { m.value = ''; });
      cur.items.forEach(it => { if (it.type === 'oltdown') it.waIds = null; });
    } else {
      cur = template();
    }
    cur.date = date;
    // El valor "Ayer" siempre se toma del reporte anterior guardado (si existe).
    if (S.prev) cur.metrics.forEach(m => { const pm = S.prev.metrics.find(x => x.key === m.key); if (pm && isNum(pm.value)) m.prev = Number(pm.value); });
    S.cur = cur;
    S.savedJson = existing ? JSON.stringify(cur) : '';
  }

  // ---------- OLT down desde el historial de WhatsApp ----------
  function oltCandidates() {
    const list = (typeof waHistoryData !== 'undefined' ? waHistoryData : []);
    const date = S.cur.date;
    const from = S.prev ? S.prev.date : (() => { const d = new Date(date + 'T00:00:00'); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();
    // Incidentes posteriores al reporte anterior y hasta la fecha de este reporte.
    return list.filter(r => r.date && r.date <= date && (S.prev ? r.date > from : r.date >= from))
      .sort((a, b) => (a.date + a.id).localeCompare(b.date + b.id));
  }
  function selectedOlt(item) {
    const cands = oltCandidates();
    if (item.waIds === null || item.waIds === undefined) return cands;
    const all = (typeof waHistoryData !== 'undefined' ? waHistoryData : []);
    return item.waIds.map(id => all.find(r => String(r.id) === String(id))).filter(Boolean);
  }
  function oltBlock(rec) {
    const lines = String(rec.text || '').split('\n');
    const start = lines.findIndex(l => l.trim().startsWith('- ¿Qué pasó'));
    const detail = (start >= 0 ? lines.slice(start) : lines.filter(l => !/^Fecha del incidente|^\+/.test(l))).join('\n');
    return `_+${rec.bts} || ${rec.branch} || Clientes afectados: ${rec.subs}_\n${detail}`.trim();
  }

  // ---------- Texto final ----------
  function tokens() {
    const t = { FECHA: fmtDate(S.cur.date, true), DIA: fmtDate(S.cur.date, false) };
    S.cur.metrics.forEach(m => {
      t[m.key] = isNum(m.value) ? fmtNum(m.value) : '??';
      t[m.key + '_AYER'] = isNum(m.prev) ? fmtNum(m.prev) : '??';
      t[m.key + '_DIF'] = (isNum(m.value) && isNum(m.prev)) ? ((Number(m.value) - Number(m.prev) >= 0 ? '+' : '') + fmtNum(Number(m.value) - Number(m.prev))) : '??';
      if (isNum(m.target)) {
        t[m.key + '_META'] = fmtNum(m.target);
        t[m.key + '_PCT'] = isNum(m.value) ? (Number(m.value) / Number(m.target) * 100).toFixed(1) + '%' : '??';
      }
    });
    return t;
  }
  const applyTokens = (txt, t) => String(txt || '').replace(/\{([A-Z0-9_]+)\}/g, (all, k) => (k in t ? t[k] : all));

  function itemBody(it) {
    if (it.type !== 'oltdown') return it.body || '';
    const recs = selectedOlt(it);
    const blocks = recs.map(oltBlock);
    if (it.body && it.body.trim()) blocks.push(it.body.trim());
    return blocks.length ? blocks.join('\n\n') : '_Sin OLT down registradas en el periodo._';
  }

  function buildText() {
    const t = tokens();
    const parts = [S.cur.greeting, S.cur.title];
    S.cur.items.forEach((it, i) => {
      parts.push(`${it.status} ${i + 1}. ${it.title}${it.owners ? ' || ' + it.owners : ''}\n\n${itemBody(it)}`);
    });
    parts.push('🚨-> RESUMEN DE PROBLEMATICAS:\n\n' + (S.cur.summary || ''));
    return applyTokens(parts.filter(p => p !== undefined && p !== null).join('\n\n'), t).replace(/\n{3,}/g, '\n\n').trim();
  }

  // ---------- Diferencias por líneas (para "Cambios vs ayer") ----------
  function lineDiff(a, b) {
    const A = String(a || '').split('\n'), B = String(b || '').split('\n');
    const n = A.length, m = B.length, L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const out = []; let i = 0, j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) { out.push({ t: '=', s: B[j] }); i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) out.push({ t: '-', s: A[i++] });
      else out.push({ t: '+', s: B[j++] });
    }
    while (i < n) out.push({ t: '-', s: A[i++] });
    while (j < m) out.push({ t: '+', s: B[j++] });
    return out;
  }
  const prevItem = it => S.prev ? S.prev.items.find(p => p.id === it.id) : null;
  function itemChange(it) {
    if (it.type === 'oltdown') return null;
    const p = prevItem(it);
    if (!S.prev) return null;
    if (!p) return { cls: 'bg-primary', txt: 'Nuevo punto' };
    const same = (p.body || '').trim() === (it.body || '').trim() && p.status === it.status;
    return same ? { cls: 'bg-warning text-dark', txt: '⚠️ Igual que ayer' } : { cls: 'bg-success', txt: '✏️ Actualizado' };
  }

  // ---------- Interfaz ----------
  function skeleton() {
    $('dailyReportPane').innerHTML = `
      <div class="d-flex flex-wrap gap-2 align-items-end mb-3 p-3 bg-white rounded shadow-sm border">
        <div><label class="form-label small fw-bold mb-1">Fecha del reporte</label><input type="date" id="drDate" class="form-control form-control-sm"></div>
        <div class="small text-muted pb-1" id="drPrevInfo"></div>
        <div class="ms-auto d-flex gap-2 flex-wrap">
          <select id="drHistory" class="form-select form-select-sm" style="width:auto"></select>
          <button class="btn btn-outline-danger btn-sm" id="drDeleteBtn" title="Eliminar el reporte guardado de esta fecha">🗑️</button>
          <button class="btn btn-success btn-sm fw-bold" id="drSaveBtn">💾 Guardar</button>
          <button class="btn btn-primary btn-sm fw-bold" id="drCopyBtn">📋 Copiar para WhatsApp</button>
        </div>
      </div>
      <div class="row g-3">
        <div class="col-xl-7">
          <div class="dr-card"><div class="dr-card-h">✉️ Encabezado</div>
            <label class="form-label small fw-bold mb-1">Saludo</label><textarea class="form-control form-control-sm mb-2" rows="3" data-f="greeting"></textarea>
            <label class="form-label small fw-bold mb-1">Título <span class="text-muted fw-normal">({FECHA} = fecha del reporte)</span></label><input class="form-control form-control-sm" data-f="title">
          </div>
          <div class="dr-card"><div class="dr-card-h d-flex justify-content-between align-items-center">
              <span>📈 Indicadores del día vs ayer</span>
              <button class="btn btn-outline-primary btn-sm py-0" id="drAddMetric">+ Indicador</button></div>
            <div class="table-responsive"><table class="table table-sm align-middle mb-1 dr-metrics">
              <thead><tr><th>Indicador</th><th style="width:95px">Ayer</th><th style="width:95px">Hoy</th><th style="width:150px">Variación</th><th style="width:70px">Meta</th><th style="width:55px">Mejor</th><th style="width:30px"></th></tr></thead>
              <tbody id="drMetricsBody"></tbody></table></div>
            <div class="small text-muted">Usa los códigos en el texto: <code>{TT}</code> valor de hoy, <code>{TT_DIF}</code> variación, <code>{TT_AYER}</code> valor de ayer, <code>{ACS_META}</code> meta. Clic en un código para copiarlo.</div>
          </div>
          <div class="dr-card"><div class="dr-card-h">📉 Tendencia</div>
            <select id="drTrendSel" class="form-select form-select-sm mb-2" style="max-width:320px"></select>
            <div style="height:200px;position:relative"><canvas id="drTrendChart"></canvas></div>
          </div>
          <div id="drItems"></div>
          <button class="btn btn-outline-secondary btn-sm mb-3" id="drAddItem">+ Agregar punto</button>
          <div class="dr-card"><div class="dr-card-h">🚨 Resumen de problemáticas</div>
            <textarea class="form-control form-control-sm" rows="7" data-f="summary"></textarea>
          </div>
        </div>
        <div class="col-xl-5">
          <div class="dr-sticky">
            <div class="dr-card" id="drWarnings"></div>
            <div class="dr-card p-0 overflow-hidden">
              <div class="dr-card-h m-0 px-3 py-2 d-flex justify-content-between align-items-center"><span>👁️ Vista previa WhatsApp</span><span class="small text-muted" id="drCharCount"></span></div>
              <div class="wa-bg"><div class="wa-bubble" id="drPreview"></div></div>
            </div>
          </div>
        </div>
      </div>`;

    $('drDate').addEventListener('change', e => {
      if (isDirty() && !confirm('Tienes cambios sin guardar en este reporte. ¿Cambiar de fecha igualmente?')) { e.target.value = S.cur.date; return; }
      open(e.target.value || today());
    });
    $('drHistory').addEventListener('change', e => { if (e.target.value) { $('drDate').value = e.target.value; $('drDate').dispatchEvent(new Event('change')); } });
    $('drSaveBtn').addEventListener('click', save);
    $('drCopyBtn').addEventListener('click', copy);
    $('drDeleteBtn').addEventListener('click', removeReport);
    $('drAddMetric').addEventListener('click', () => { S.cur.metrics.push({ key: 'NUEVO_' + (S.cur.metrics.length + 1), label: 'Nuevo indicador', value: '', prev: '', good: 'up', target: '' }); renderMetrics(); refresh(); });
    $('drAddItem').addEventListener('click', () => { S.cur.items.push({ id: newId(), type: 'text', status: '🟠', title: 'Nuevo punto', owners: '', body: '+ Acciones:\n+ Problemática:\n+ Soluciones:' }); renderItems(); refresh(); });
    $('drTrendSel').addEventListener('change', renderTrend);

    document.querySelectorAll('#dailyReportPane [data-f]').forEach(el => el.addEventListener('input', () => { S.cur[el.dataset.f] = el.value; refresh(); }));
    window.addEventListener('beforeunload', e => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });
  }

  function renderHead() {
    $('drDate').value = S.cur.date;
    const exists = S.reports.some(r => r.id === S.cur.date);
    $('drPrevInfo').innerHTML = (S.prev ? `Comparando con el reporte del <b>${fmtDate(S.prev.date, true)}</b>` : 'Sin reporte anterior guardado: escribe el valor de "Ayer" a mano')
      + (exists ? ' · <span class="badge bg-success">Guardado</span>' : ' · <span class="badge bg-secondary">Nuevo (sin guardar)</span>');
    $('drDeleteBtn').style.display = exists ? '' : 'none';
    $('drHistory').innerHTML = '<option value="">📚 Reportes guardados…</option>' + [...S.reports].reverse().map(r => `<option value="${r.id}">${fmtDate(r.id, true)}</option>`).join('');
    document.querySelectorAll('#dailyReportPane [data-f]').forEach(el => { el.value = S.cur[el.dataset.f] || ''; });
  }

  function deltaHtml(m) {
    if (!isNum(m.value) || !isNum(m.prev)) return '<span class="text-muted small">—</span>';
    const d = Number(m.value) - Number(m.prev);
    const pct = Number(m.prev) !== 0 ? ` (${d >= 0 ? '+' : ''}${(d / Math.abs(Number(m.prev)) * 100).toFixed(1)}%)` : '';
    let cls = 'bg-secondary';
    if (d !== 0) cls = m.good === 'none' ? 'bg-light text-dark border' : ((d > 0) === (m.good === 'up') ? 'bg-success' : 'bg-danger');
    const arrow = d > 0 ? '▲' : (d < 0 ? '▼' : '＝');
    let bar = '';
    if (isNum(m.target) && Number(m.target) > 0) {
      const p = Math.min(100, Number(m.value) / Number(m.target) * 100);
      bar = `<div class="progress mt-1" style="height:6px" title="${p.toFixed(1)}% de la meta"><div class="progress-bar bg-primary" style="width:${p}%"></div></div>`;
    }
    return `<span class="badge ${cls}">${arrow} ${d >= 0 ? '+' : ''}${fmtNum(d)}${pct}</span>${bar}`;
  }

  function renderMetrics() {
    $('drMetricsBody').innerHTML = S.cur.metrics.map((m, i) => `
      <tr data-i="${i}">
        <td><input class="form-control form-control-sm border-0 px-1 fw-semibold" data-m="label" value="${esc(m.label)}">
            <code class="dr-token" title="Copiar código">{${esc(m.key)}}</code></td>
        <td><input type="number" step="any" class="form-control form-control-sm" data-m="prev" value="${esc(m.prev)}" ${S.prev && S.prev.metrics.some(x => x.key === m.key) ? 'readonly title="Tomado del reporte anterior"' : 'placeholder="Ayer"'}></td>
        <td><input type="number" step="any" class="form-control form-control-sm ${isNum(m.value) ? '' : 'border-warning'}" data-m="value" value="${esc(m.value)}" placeholder="${esc(m.prev)}"></td>
        <td class="dr-delta">${deltaHtml(m)}</td>
        <td><input type="number" step="any" class="form-control form-control-sm" data-m="target" value="${esc(m.target)}" placeholder="—"></td>
        <td><select class="form-select form-select-sm px-1" data-m="good">
          <option value="up" ${m.good === 'up' ? 'selected' : ''}>▲</option><option value="down" ${m.good === 'down' ? 'selected' : ''}>▼</option><option value="none" ${m.good === 'none' ? 'selected' : ''}>—</option></select></td>
        <td><button class="btn btn-sm btn-link text-danger p-0" data-del="1" title="Quitar">✕</button></td>
      </tr>`).join('');

    $('drMetricsBody').querySelectorAll('tr').forEach(tr => {
      const m = S.cur.metrics[tr.dataset.i];
      tr.querySelectorAll('[data-m]').forEach(el => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
        const f = el.dataset.m;
        m[f] = (f === 'label' || f === 'good') ? el.value : (el.value === '' ? '' : Number(el.value));
        if (f === 'value') el.classList.toggle('border-warning', !isNum(m.value));
        if (f !== 'label') tr.querySelector('.dr-delta').innerHTML = deltaHtml(m);
        refresh();
      }));
      tr.querySelector('[data-del]').addEventListener('click', () => {
        if (!confirm(`¿Quitar el indicador "${m.label}"? Los códigos {${m.key}} en el texto quedarán sin reemplazar.`)) return;
        S.cur.metrics.splice(tr.dataset.i, 1); renderMetrics(); renderTrendOptions(); refresh();
      });
      tr.querySelector('.dr-token').addEventListener('click', () => copyPlain(`{${m.key}}`, false));
      // Nombre de código editable con doble clic (solo para indicadores nuevos).
      tr.querySelector('.dr-token').addEventListener('dblclick', () => {
        const k = prompt('Código del indicador (solo letras, números y _):', m.key);
        if (k) { m.key = keyFrom(k); renderMetrics(); renderTrendOptions(); refresh(); }
      });
    });
  }

  function renderItems() {
    $('drItems').innerHTML = S.cur.items.map((it, i) => {
      const ch = itemChange(it);
      const isOlt = it.type === 'oltdown';
      let oltHtml = '';
      if (isOlt) {
        const cands = oltCandidates();
        const sel = new Set(selectedOlt(it).map(r => String(r.id)));
        oltHtml = `<div class="small fw-bold mb-1">OLT down registradas en "💬 OLT Down" (${S.prev ? 'desde el ' + fmtDate(S.prev.date) : 'ayer y hoy'} hasta el ${fmtDate(S.cur.date)}):</div>` +
          (cands.length ? cands.map(r => `<label class="d-block small"><input type="checkbox" class="form-check-input me-1" data-wa="${esc(r.id)}" ${sel.has(String(r.id)) ? 'checked' : ''}>
            <b>${esc(r.bts)}</b> · ${esc(r.branch)} · ${esc(r.subs)} clientes · <span class="text-muted">${esc(r.date)}</span></label>`).join('')
            : '<div class="small text-muted mb-1">No hay incidentes en ese periodo. Regístralos en la pestaña "💬 OLT Down" y aparecerán aquí.</div>') +
          '<label class="form-label small fw-bold mt-2 mb-1">Texto adicional (opcional)</label>';
      }
      const p = prevItem(it);
      const diffBtn = (!isOlt && p) ? `<button class="btn btn-link btn-sm p-0 ms-2" data-diff="1">Ver cambios vs ayer</button>` : '';
      return `<div class="dr-card dr-item" data-i="${i}">
        <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
          <span class="fw-bold text-secondary">${i + 1}.</span>
          <select class="form-select form-select-sm" style="width:auto" data-k="status">${STATUS.map(s => `<option value="${s.v}" ${s.v === it.status ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
          <input class="form-control form-control-sm fw-bold flex-grow-1" style="min-width:200px;width:auto" data-k="title" value="${esc(it.title)}">
          ${ch ? `<span class="badge ${ch.cls}">${ch.txt}</span>` : ''}${diffBtn}
          <div class="ms-auto btn-group btn-group-sm">
            <button class="btn btn-outline-secondary" data-mv="-1" title="Subir">↑</button><button class="btn btn-outline-secondary" data-mv="1" title="Bajar">↓</button>
            <button class="btn btn-outline-danger" data-rm="1" title="Eliminar punto">✕</button></div>
        </div>
        <input class="form-control form-control-sm mb-2 text-muted" data-k="owners" value="${esc(it.owners)}" placeholder="Responsables (@...)">
        ${oltHtml}
        <textarea class="form-control form-control-sm font-monospace dr-body" rows="${isOlt ? 2 : Math.min(14, Math.max(4, (it.body || '').split('\n').length + 1))}" data-k="body" placeholder="${isOlt ? '' : 'Pega aquí lo que te compartieron…'}">${esc(it.body)}</textarea>
        <div class="dr-diff mt-2" style="display:none"></div>
      </div>`;
    }).join('');

    $('drItems').querySelectorAll('.dr-item').forEach(card => {
      const i = Number(card.dataset.i), it = S.cur.items[i];
      card.querySelectorAll('[data-k]').forEach(el => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
        it[el.dataset.k] = el.value;
        if (el.dataset.k !== 'owners' && it.type !== 'oltdown') {   // actualiza el indicador "Igual que ayer / Actualizado"
          const ch = itemChange(it), b = card.querySelector('.badge');
          if (ch && b) { b.className = 'badge ' + ch.cls; b.textContent = ch.txt; }
        }
        refresh();
      }));
      card.querySelectorAll('[data-wa]').forEach(cb => cb.addEventListener('change', () => {
        it.waIds = Array.from(card.querySelectorAll('[data-wa]:checked')).map(c => c.dataset.wa);
        refresh();
      }));
      card.querySelectorAll('[data-mv]').forEach(b => b.addEventListener('click', () => {
        const j = i + Number(b.dataset.mv); if (j < 0 || j >= S.cur.items.length) return;
        [S.cur.items[i], S.cur.items[j]] = [S.cur.items[j], S.cur.items[i]]; renderItems(); refresh();
      }));
      card.querySelector('[data-rm]').addEventListener('click', () => {
        if (!confirm(`¿Eliminar el punto "${it.title}" del reporte?`)) return;
        S.cur.items.splice(i, 1); renderItems(); refresh();
      });
      const db = card.querySelector('[data-diff]');
      if (db) db.addEventListener('click', () => {
        const box = card.querySelector('.dr-diff');
        if (box.style.display === 'none') {
          box.innerHTML = lineDiff(prevItem(it).body, it.body).map(d => `<div class="dr-diff-${d.t === '+' ? 'add' : d.t === '-' ? 'del' : 'eq'}">${d.t === '=' ? '&nbsp;' : d.t} ${esc(d.s) || '&nbsp;'}</div>`).join('');
          box.style.display = 'block'; db.textContent = 'Ocultar cambios';
        } else { box.style.display = 'none'; db.textContent = 'Ver cambios vs ayer'; }
      });
    });
  }

  function waToHtml(t) {
    return esc(t)
      .replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
      .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,:])/gm, '$1<i>$2</i>')
      .replace(/~([^~\n]+)~/g, '<s>$1</s>')
      .replace(/\?\?/g, '<span class="dr-missing">??</span>')
      .replace(/\n/g, '<br>');
  }

  function renderWarnings() {
    const w = [];
    const missing = S.cur.metrics.filter(m => !isNum(m.value));
    if (missing.length) w.push(`<li>Faltan <b>${missing.length}</b> indicadores de hoy: ${missing.map(m => esc(m.label)).join(', ')}</li>`);
    const noPrev = S.cur.metrics.filter(m => isNum(m.value) && !isNum(m.prev));
    if (noPrev.length && !S.prev) w.push(`<li>Escribe el valor de "Ayer" para calcular la variación (${noPrev.map(m => esc(m.label)).join(', ')}).</li>`);
    const same = S.cur.items.filter(it => { const c = itemChange(it); return c && c.txt.includes('Igual'); });
    if (same.length) w.push(`<li>Puntos con el mismo texto que ayer: ${same.map(it => `<b>${S.cur.items.indexOf(it) + 1}</b>`).join(', ')}. ¿Ya los actualizaste?</li>`);
    const olt = S.cur.items.find(it => it.type === 'oltdown');
    if (olt) w.push(`<li class="text-muted">OLT down incluidas: <b>${selectedOlt(olt).length}</b></li>`);
    if (isDirty()) w.push('<li class="text-danger fw-bold">Cambios sin guardar</li>');
    const big = S.cur.metrics.filter(m => isNum(m.value) && isNum(m.prev) && m.good !== 'none' && ((Number(m.value) - Number(m.prev) > 0) !== (m.good === 'up')) && Number(m.value) !== Number(m.prev));
    const head = big.length ? `<div class="small mb-1">🔻 Empeoraron vs ayer: ${big.map(m => `<span class="badge bg-danger-subtle text-danger-emphasis">${esc(m.label)}</span>`).join(' ')}</div>` : '';
    $('drWarnings').innerHTML = `<div class="dr-card-h">✅ Revisión antes de enviar</div>${head}` + (w.length ? `<ul class="small mb-0 ps-3">${w.join('')}</ul>` : '<div class="small text-success">Todo listo.</div>');
  }

  let refreshT;
  function refresh() {
    clearTimeout(refreshT);
    refreshT = setTimeout(() => {
      const txt = buildText();
      $('drPreview').innerHTML = waToHtml(txt);
      $('drCharCount').textContent = txt.length.toLocaleString() + ' caracteres';
      renderWarnings();
    }, 120);
  }

  function renderTrendOptions() {
    const sel = $('drTrendSel'), old = sel.value;
    sel.innerHTML = S.cur.metrics.map(m => `<option value="${esc(m.key)}">${esc(m.label)}</option>`).join('');
    if (S.cur.metrics.some(m => m.key === old)) sel.value = old;
    renderTrend();
  }
  function renderTrend() {
    const key = $('drTrendSel').value;
    if (typeof Chart === 'undefined' || !key) return;
    const pts = S.reports.filter(r => r.id !== S.cur.date).map(r => ({ d: r.id, m: r.data.metrics.find(x => x.key === key) })).filter(p => p.m && isNum(p.m.value)).map(p => ({ d: p.d, v: Number(p.m.value) }));
    const cm = S.cur.metrics.find(x => x.key === key);
    if (cm && isNum(cm.value)) pts.push({ d: S.cur.date, v: Number(cm.value) });
    pts.sort((a, b) => a.d.localeCompare(b.d));
    const last = pts.slice(-14);
    if (S.trendChart) S.trendChart.destroy();
    S.trendChart = new Chart($('drTrendChart').getContext('2d'), {
      type: 'line',
      data: { labels: last.map(p => fmtDate(p.d)), datasets: [{ data: last.map(p => p.v), borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,.08)', fill: true, tension: .25, pointRadius: 3 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, datalabels: { display: false } }, scales: { y: { beginAtZero: false } } }
    });
  }

  function renderAll() { renderHead(); renderMetrics(); renderItems(); renderTrendOptions(); refresh(); }
  function open(date) { buildFor(date); renderAll(); }

  // ---------- Acciones ----------
  async function save() {
    const btn = $('drSaveBtn'); const txt = buildText();
    const payload = { id: S.cur.date, data: JSON.stringify(S.cur), text: txt };
    if (payload.data.length > 48000) { alert('El reporte es demasiado largo para una celda de Google Sheets (máx. 50.000 caracteres). Acorta algunos textos.'); return; }
    btn.disabled = true; btn.textContent = '⏳ Guardando…';
    try {
      await callGAS('saveDailyReport', payload);
      const rec = { id: S.cur.date, data: clone(S.cur), text: txt };
      const i = S.reports.findIndex(r => r.id === rec.id);
      if (i >= 0) S.reports[i] = rec; else { S.reports.push(rec); S.reports.sort((a, b) => a.id.localeCompare(b.id)); }
      S.savedJson = JSON.stringify(S.cur);
      renderHead(); refresh();
      btn.textContent = '✅ Guardado'; setTimeout(() => { btn.textContent = '💾 Guardar'; }, 1500);
    } catch (e) {
      alert('❌ No se pudo guardar: ' + e.message); btn.textContent = '💾 Guardar';
    } finally { btn.disabled = false; }
  }

  async function removeReport() {
    if (!confirm(`¿Eliminar el reporte guardado del ${fmtDate(S.cur.date, true)}? No se puede deshacer.`)) return;
    try {
      await callGAS('deleteDailyReport', S.cur.date);
      S.reports = S.reports.filter(r => r.id !== S.cur.date);
      open(S.cur.date);
    } catch (e) { alert('❌ No se pudo eliminar: ' + e.message); }
  }

  async function copyPlain(text, announce = true) {
    try { await navigator.clipboard.writeText(text); if (announce) toast('📋 Copiado. Pégalo en WhatsApp.'); else toast('Copiado: ' + text); }
    catch (e) { if (typeof copyTextSafe === 'function') copyTextSafe(text); }
  }
  function copy() {
    const txt = buildText();
    if (txt.includes('??') && !confirm('Hay valores sin completar (aparecen como ??). ¿Copiar igualmente?')) return;
    copyPlain(txt);
  }
  function toast(msg) {
    let t = $('drToast');
    if (!t) { t = document.createElement('div'); t.id = 'drToast'; t.className = 'dr-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2000);
  }

  // ---------- API del módulo ----------
  window.DailyReport = {
    init(records) {
      S.reports = parseReports(records || []);
      skeleton();
      open(today());
    },
    refreshOlt() { if (S.cur) { renderItems(); refresh(); } },   // se llama cuando cambia el historial de OLT down
    resizeChart() { if (S.trendChart) S.trendChart.resize(); },
    _state: S, _buildText: buildText, _lineDiff: lineDiff
  };
})();
