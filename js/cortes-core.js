// =========================================================
// CRUCE CORTES PROGRAMADOS × RED FTTH/ODN (lógica pura, sin interfaz)
// Funciona en el navegador (window.CortesCore) y en Node (pruebas).
// =========================================================
(function (root) {
  const K = (typeof require !== 'undefined' && typeof module !== 'undefined') ? require('./kmz-index.js') : root.KmzIndex;

  // ---------- geometría en metros (proyección local) ----------
  const M_LAT = 110574;
  const mLon = lat => 111320 * Math.cos(lat * Math.PI / 180);
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  }
  function cross(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
  function segSeg(a, b, c, d) {
    const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
    if (d1 * d2 < 0 && d3 * d4 < 0) return 0;
    return Math.min(segDist(a[0], a[1], c[0], c[1], d[0], d[1]), segDist(b[0], b[1], c[0], c[1], d[0], d[1]),
      segDist(c[0], c[1], a[0], a[1], b[0], b[1]), segDist(d[0], d[1], a[0], a[1], b[0], b[1]));
  }
  function inRing(x, y, ring) {
    let ins = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi) ins = !ins;
    }
    return ins;
  }

  // Una "forma" del corte proyectada a metros alrededor de lat0
  function prepFeature(f) {
    const pts = f.p.flat();
    const lat0 = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const kx = mLon(lat0);
    const parts = f.p.map(part => part.map(([la, lo]) => [lo * kx, la * M_LAT]));
    let minLa = 90, maxLa = -90, minLo = 180, maxLo = -180;
    pts.forEach(([la, lo]) => { if (la < minLa) minLa = la; if (la > maxLa) maxLa = la; if (lo < minLo) minLo = lo; if (lo > maxLo) maxLo = lo; });
    const pad = f.r / M_LAT, padLo = f.r / kx;
    return { f, t: f.t, r: f.r, kx, parts, bbox: [minLa - pad, minLo - padLo, maxLa + pad, maxLo + padLo] };
  }
  function distPoint(pf, la, lo) {
    const x = lo * pf.kx, y = la * M_LAT;
    if (pf.t === 'point') { const [px, py] = pf.parts[0][0]; return Math.hypot(x - px, y - py); }
    if (pf.t === 'poly' && pf.parts.some(r => inRing(x, y, r))) return 0;
    let best = Infinity;
    pf.parts.forEach(part => {
      const n = part.length, closed = pf.t === 'poly';
      for (let i = 0; i < n - 1 + (closed ? 1 : 0); i++) {
        const a = part[i], b = part[(i + 1) % n];
        const d = segDist(x, y, a[0], a[1], b[0], b[1]);
        if (d < best) best = d;
      }
      if (n === 1) best = Math.min(best, Math.hypot(x - part[0][0], y - part[0][1]));
    });
    return best;
  }
  function distLine(pf, pts) {
    const P = pts.map(([la, lo]) => [lo * pf.kx, la * M_LAT]);
    if (pf.t === 'poly' && P.some(p => pf.parts.some(r => inRing(p[0], p[1], r)))) return 0;
    let best = Infinity;
    for (let i = 0; i < P.length - 1; i++) {
      pf.parts.forEach(part => {
        const n = part.length, closed = pf.t === 'poly';
        if (n === 1) { best = Math.min(best, segDist(part[0][0], part[0][1], P[i][0], P[i][1], P[i + 1][0], P[i + 1][1])); return; }
        for (let j = 0; j < n - 1 + (closed ? 1 : 0); j++) {
          const d = segSeg(P[i], P[i + 1], part[j], part[(j + 1) % n]);
          if (d < best) best = d;
        }
      });
      if (best === 0) return 0;
    }
    return best;
  }

  // ---------- índice de red ----------
  function decodeNetwork(idx) {
    if (!idx) return null;
    const zones = idx.zones.map((z, i) => ({ i, b: z.b, branch: idx.branches[z.b], n: z.n, bts: z.bts, olt: z.olt,
      site: z.s ? K.dec(z.s)[0] : null, poly: z.c.map(K.dec), naps: 0 }));
    const hubs = idx.hubs.map((h, i) => ({ i, z: h[0], n: h[1], p: h[2] ? K.dec(h[2])[0] : null }));
    const naps = idx.naps.map((n, i) => ({ i, z: n[0], h: n[1], n: n[2], la: n[3] / 1e5, lo: n[4] / 1e5 }));
    naps.forEach(n => zones[n.z].naps++);
    const lines = (idx.lines || []).map((l, i) => {
      const pts = K.dec(l[3]);
      let a = 90, b = 180, c = -90, d = -180;
      pts.forEach(([la, lo]) => { if (la < a) a = la; if (la > c) c = la; if (lo < b) b = lo; if (lo > d) d = lo; });
      return { i, z: l[0], h: l[1], n: l[2], pts, bbox: [a, b, c, d] };
    });
    const others = (idx.others || []).map(o => ({ z: o[0], k: o[1], n: o[2], la: o[3] / 1e5, lo: o[4] / 1e5 }));
    // rejilla para buscar NAP rápido (celdas de ~1 km)
    const CELL = 0.01, grid = new Map();
    naps.forEach(n => { const k = Math.floor(n.la / CELL) + ':' + Math.floor(n.lo / CELL); (grid.get(k) || grid.set(k, []).get(k)).push(n.i); });
    const lgrid = new Map();
    lines.forEach(l => {
      for (let a = Math.floor(l.bbox[0] / CELL); a <= Math.floor(l.bbox[2] / CELL); a++)
        for (let b = Math.floor(l.bbox[1] / CELL); b <= Math.floor(l.bbox[3] / CELL); b++) {
          const k = a + ':' + b; (lgrid.get(k) || lgrid.set(k, []).get(k)).push(l.i);
        }
    });
    const napsPerOlt = {};
    naps.forEach(n => { const o = zones[n.z].olt; if (o) napsPerOlt[o] = (napsPerOlt[o] || 0) + 1; });
    return { tipo: idx.tipo, archivo: idx.archivo, creado: idx.creado, stats: idx.stats, branches: idx.branches,
      zones, hubs, naps, lines, others, grid, lgrid, CELL, napsPerOlt };
  }

  function candidates(net, bbox, grid) {
    const out = new Set(), C = net.CELL;
    for (let a = Math.floor(bbox[0] / C); a <= Math.floor(bbox[2] / C); a++)
      for (let b = Math.floor(bbox[1] / C); b <= Math.floor(bbox[3] / C); b++) {
        const arr = grid.get(a + ':' + b); if (arr) arr.forEach(i => out.add(i));
      }
    return out;
  }

  // ---------- fechas y horas ----------
  const dstr = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return dstr(d); };
  const diffDays = (a, b) => Math.round((new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 864e5);
  const toMin = hhmm => { if (!hhmm) return null; const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  function duracion(ini, fin) {
    const a = toMin(ini), b = toMin(fin);
    if (a === null || b === null) return null;
    return b >= a ? b - a : b + 1440 - a;
  }
  const fmtDur = min => {
    if (min === null || min === undefined) return '—';
    const h = Math.floor(min / 60), m = min % 60;
    return [h ? h + ' h' : '', m || !h ? m + ' min' : ''].filter(Boolean).join(' ');
  };

  // ---------- clientes por OLT (columna Active de la hoja principal) ----------
  function clientsFromSheet(bts) {
    const out = {};
    if (!bts || !bts.headers) return out;
    const H = bts.headers.map(h => String(h).trim().toUpperCase());
    const iO = H.indexOf('OLT'), iA = H.findIndex(h => h === 'ACTIVE' || h === 'ACTIVOS' || h === 'CLIENTES ACTIVOS');
    if (iO < 0 || iA < 0) return out;
    bts.rows.forEach(r => {
      const olt = String(r[iO] || '').trim().toUpperCase().replace(/\s+/g, '');
      const n = parseFloat(String(r[iA]).replace(/[^\d.]/g, ''));
      if (olt && isFinite(n)) out[olt] = (out[olt] || 0) + n;
    });
    return out;
  }

  // ---------- cruce principal ----------
  const BAJA = { distrito: 1, provincia: 1 };   // ubicaciones de confianza baja: solo entran si se pide
  // cortes: data.cortes de cortes.json ; redes: [netFTTH, netODN]
  function cruzar(cortes, redes, opts = {}) {
    const ref = opts.ref || dstr(new Date());
    const res = [];
    cortes.forEach(c => {
      const fechas = (c.fechas || []).slice().sort();
      if (!fechas.length) return;
      const ini = fechas[0], fin = fechas[fechas.length - 1];
      const dif = ini <= ref && ref <= fin ? 0 : (ini > ref ? diffDays(ini, ref) : diffDays(fin, ref));
      const r = { c, dif, fechas, dur: duracion(c.ini, c.fin), activo: c.estado !== 'SUSPENDIDO',
        naps: new Set(), hubs: new Set(), zones: new Set(), lines: new Set(), odn: new Set(), odnLines: new Set(), minDist: Infinity, hit: {} };
      r.soloAprox = (c.f || []).length > 0 && (c.f || []).every(f => BAJA[f.pr]);
      if (r.activo) (c.f || []).forEach(f => {
        if (!f.p || !f.p.length || !f.p[0].length) return;
        if (BAJA[f.pr] && !opts.incluirAprox) return;
        const pf = prepFeature(f);
        redes.forEach(net => {
          if (!net) return;
          const isO = net.tipo === 'ODN';
          candidates(net, pf.bbox, net.grid).forEach(i => {
            const n = net.naps[i];
            const d = distPoint(pf, n.la, n.lo);
            if (d <= pf.r) {
              if (isO) r.odn.add(i); else { r.naps.add(i); r.zones.add(n.z); if (n.h >= 0) r.hubs.add(n.h); }
              r.minDist = Math.min(r.minDist, d);
              r.hit[f.n] = (r.hit[f.n] || 0) + 1;
            }
          });
          candidates(net, pf.bbox, net.lgrid).forEach(i => {
            const l = net.lines[i];
            if (l.bbox[2] < pf.bbox[0] || l.bbox[0] > pf.bbox[2] || l.bbox[3] < pf.bbox[1] || l.bbox[1] > pf.bbox[3]) return;
            const d = distLine(pf, l.pts);
            if (d <= pf.r) { if (isO) r.odnLines.add(i); else { r.lines.add(i); r.zones.add(l.z); if (l.h >= 0) r.hubs.add(l.h); } }
          });
        });
      });
      r.afecta = r.naps.size + r.lines.size + r.odn.size + r.odnLines.size > 0;
      res.push(r);
    });
    return res;
  }

  // resumen de un grupo de resultados (p. ej. los de hoy)
  function resumen(rs, net, clientes) {
    const branches = new Set(), bts = new Set(), olts = new Set(), hubs = new Set(), naps = new Set(), lines = new Set(), odn = new Set();
    const napsPorOlt = {};
    let ini = null, fin = null;
    rs.forEach(r => {
      if (r.c.ini && (ini === null || r.c.ini < ini)) ini = r.c.ini;
      if (r.c.fin && (fin === null || r.c.fin > fin)) fin = r.c.fin;
      if (!net) return;
      r.zones.forEach(z => { const Z = net.zones[z]; if (Z.branch) branches.add(Z.branch); if (Z.bts) bts.add(Z.bts); if (Z.olt) olts.add(Z.olt); });
      r.hubs.forEach(h => hubs.add(h));
      r.naps.forEach(n => { naps.add(n); });
      r.lines.forEach(l => lines.add(l));
      r.odn.forEach(o => odn.add(o));
    });
    if (net) naps.forEach(n => { const o = net.zones[net.naps[n].z].olt; if (o) napsPorOlt[o] = (napsPorOlt[o] || 0) + 1; });
    let cli = 0, cliSinDato = [];
    Object.entries(napsPorOlt).forEach(([o, k]) => {
      const act = clientes ? clientes[o] : undefined, tot = net.napsPerOlt[o] || k;
      if (act === undefined) cliSinDato.push(o); else cli += act * Math.min(1, k / tot);
    });
    return { n: rs.length, branches: [...branches].sort(), bts: [...bts].sort(), olts: [...olts].sort(), hubs: [...hubs], naps: [...naps],
      lines: [...lines], odn: [...odn], ini, fin, dur: duracion(ini, fin), clientes: Math.round(cli), cliSinDato, napsPorOlt };
  }

  const api = { decodeNetwork, cruzar, resumen, clientsFromSheet, duracion, fmtDur, dstr, addDays, diffDays, prepFeature, distPoint, distLine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CortesCore = api;
})(typeof self !== 'undefined' ? self : this);
