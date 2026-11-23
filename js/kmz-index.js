// =========================================================
// ÍNDICE DE COBERTURA (FTTH / ODN) A PARTIR DE UN KML
// Lee el KML como texto (sirve para archivos de 100 MB) y arma un índice liviano:
// branches → zonas (BTS, OLT, polígono) → HUBBOX → ODB/NAP, más rutas de fibra.
// Funciona en el navegador (Web Worker) y en Node (pruebas).
// =========================================================
(function (root) {
  const RX_OLT = /([A-Z]{3}\d{4,5})\s*[_-]?\s*(?:OLT|0LT)\s*E?\s*(\d{1,2})/;
  const RX_BTS = /^([A-Z]{3}\d{4,5})/;
  const RX_HUB = /^(?:HB|HUB|SB)[\s_-]*\d{1,3}$/i;
  const RX_HUB_POINT = /^(?:HB|HUB)[\s_-]*\d{1,3}$/i;
  const RX_NAP = /^(?:SB|NAP|ODB|CTO|CAJA)[\s_-]*\d/i;
  const RX_COVER = /cover|cobert|zone|zona/i;
  const RX_SKIP_POLY = /no hay casas|borrame/i;
  const TAGS = /<(\/?)(?:kml:)?(Folder|Document|Placemark|name|Point|LineString|Polygon|coordinates|outerBoundaryIs|innerBoundaryIs)\b[^>]*?(\/?)>/g;

  function decode(s) {
    s = s.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1');
    return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim();
  }

  function parseCoords(txt) {
    const out = [];
    const parts = txt.trim().split(/\s+/);
    for (const p of parts) {
      const c = p.split(',');
      if (c.length < 2) continue;
      const lon = +c[0], lat = +c[1];
      if (isFinite(lat) && isFinite(lon) && (lat !== 0 || lon !== 0)) out.push([lat, lon]);
    }
    return out;
  }

  // Douglas-Peucker (en grados; tol ~ 1e-5 = 1 m)
  function simplify(pts, tol) {
    if (pts.length < 3) return pts;
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      const [ax, ay] = pts[a], [bx, by] = pts[b];
      const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-12;
      let mx = 0, ix = -1;
      for (let i = a + 1; i < b; i++) {
        const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / L;
        if (d > mx) { mx = d; ix = i; }
      }
      if (mx > tol && ix > 0) { keep[ix] = 1; stack.push([a, ix], [ix, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  }

  // Coordenadas como enteros (1e-5 grados ≈ 1 m) con deltas: [lat0, lon0, dLat1, dLon1, ...]
  function enc(pts) {
    const out = []; let pa = 0, po = 0;
    for (const [la, lo] of pts) {
      const a = Math.round(la * 1e5), o = Math.round(lo * 1e5);
      out.push(a - pa, o - po); pa = a; po = o;
    }
    return out;
  }
  function dec(arr) {
    const out = []; let a = 0, o = 0;
    for (let i = 0; i + 1 < arr.length; i += 2) { a += arr[i]; o += arr[i + 1]; out.push([a / 1e5, o / 1e5]); }
    return out;
  }

  function lastSeg(n) { return String(n || '').split('/').pop().trim(); }

  function indexKml(text, opts = {}) {
    const tipo = opts.tipo || 'FTTH';
    const progress = opts.progress || (() => {});
    const containers = [{ id: 0, parent: -1, name: '', kids: [], pms: [] }];
    const stack = [0];
    let pm = null, geom = null, inOuter = false, inInner = false;
    TAGS.lastIndex = 0;
    let m, nextReport = 0;
    const total = text.length;
    while ((m = TAGS.exec(text))) {
      const close = m[1] === '/', tag = m[2], selfClose = m[3] === '/';
      if (TAGS.lastIndex > nextReport) { progress(TAGS.lastIndex / total); nextReport += 2e6; }
      if (selfClose) continue;
      if (tag === 'Folder' || tag === 'Document') {
        if (!close) {
          const c = { id: containers.length, parent: stack[stack.length - 1], name: null, kids: [], pms: [] };
          containers.push(c); containers[c.parent].kids.push(c.id); stack.push(c.id);
        } else if (stack.length > 1) stack.pop();
      } else if (tag === 'Placemark') {
        if (!close) pm = { name: null, g: [] };
        else { if (pm && pm.g.length) containers[stack[stack.length - 1]].pms.push(pm); pm = null; }
      } else if (tag === 'name' && !close) {
        const end = text.indexOf('</', TAGS.lastIndex);
        const v = decode(text.slice(TAGS.lastIndex, end));
        if (pm) { if (pm.name === null) pm.name = v; }
        else { const c = containers[stack[stack.length - 1]]; if (c.name === null) c.name = v; }
        TAGS.lastIndex = end;
      } else if (pm && (tag === 'Point' || tag === 'LineString' || tag === 'Polygon')) {
        if (!close) geom = tag; else geom = null;
      } else if (tag === 'outerBoundaryIs') inOuter = !close;
      else if (tag === 'innerBoundaryIs') inInner = !close;
      else if (tag === 'coordinates' && !close && pm && geom) {
        const end = text.indexOf('</', TAGS.lastIndex);
        if (!(geom === 'Polygon' && (inInner || !inOuter))) {
          const pts = parseCoords(text.slice(TAGS.lastIndex, end));
          if (pts.length) pm.g.push({ t: geom, pts });
        }
        TAGS.lastIndex = end;
      }
    }
    progress(1);
    containers.forEach(c => { if (c.name === null) c.name = ''; });

    // ---------- clasificación ----------
    const C = containers;
    const hasSite = c => c.kids.some(k => C[k].name.trim().toUpperCase() === 'SITE');
    const isZone = c => RX_OLT.test(c.name.toUpperCase()) || hasSite(c);
    const anyPm = c => c.pms.length || c.kids.some(k => anyPm(C[k]));
    const anyNap = c => c.pms.some(p => p.g[0].t === 'Point' && RX_NAP.test((p.name || '').trim())) || c.kids.some(k => anyNap(C[k]));

    // branch: carpeta "Branch XXX"; si no hay, el primer nivel con contenido debajo de la carpeta raíz
    const branchOf = new Int32Array(C.length).fill(-1);
    const branches = [];
    function findBranches(id, depth) {
      const c = C[id];
      const isB = /^branch\b/i.test(c.name.trim());
      if (isB) { branches.push(c.name.trim().replace(/^branch\s*/i, '') || c.name); markBranch(id, branches.length - 1); return true; }
      let found = false;
      c.kids.forEach(k => { if (findBranches(k, depth + 1)) found = true; });
      return found;
    }
    function markBranch(id, b) { branchOf[id] = b; C[id].kids.forEach(k => markBranch(k, b)); }
    if (!findBranches(0, 0)) {
      // Sin carpetas "Branch": usar el nivel donde el árbol se abre
      let r = 0;
      while (C[r].kids.length === 1 && !C[r].pms.length) r = C[r].kids[0];
      C[r].kids.forEach(k => { if (anyPm(C[k])) { branches.push(C[k].name || ('Grupo ' + (branches.length + 1))); markBranch(k, branches.length - 1); } });
      if (!branches.length) { branches.push(C[r].name || tipo); markBranch(r, 0); }
    }

    // zonas
    const zoneOf = new Int32Array(C.length).fill(-1);
    const zones = [];
    function findZones(id) {
      const c = C[id];
      if (branchOf[id] >= 0 && isZone(c)) { addZone(id); return; }
      const before = zones.length;
      c.kids.forEach(findZones);
      // contenedor dentro de un branch, sin zonas reconocidas abajo, con elementos: es una zona
      if (zones.length === before && branchOf[id] >= 0 && C[c.parent] && branchOf[c.parent] === branchOf[id] && anyNap(c) && !isZoneAncestorMarked(id)) addZone(id);
    }
    function isZoneAncestorMarked(id) { for (let p = id; p >= 0; p = C[p].parent) if (zoneOf[p] >= 0) return true; return false; }
    function addZone(id) {
      const c = C[id];
      let mm = RX_OLT.exec(c.name.toUpperCase());
      if (!mm) { (function walk(k) { if (mm) return; const x = RX_OLT.exec(C[k].name.toUpperCase()); if (x) { mm = x; return; } C[k].kids.forEach(walk); })(id); }
      let site = null;
      (function walk(k) { if (site) return; if (C[k].name.trim().toUpperCase() === 'SITE') { const p = C[k].pms.find(p => p.g[0].t === 'Point'); if (p) { site = p; return; } } C[k].kids.forEach(walk); })(id);
      const siteBts = site && RX_BTS.exec((site.name || '').toUpperCase().trim());
      const bts = mm ? mm[1] : (siteBts ? siteBts[1] : '');
      const olt = mm ? mm[1] + 'OLT' + mm[2].padStart(2, '0') : '';
      const z = { b: branchOf[id], n: c.name.trim(), bts, olt, c: [], site: site ? site.g[0].pts[0] : null };
      zones.push(z);
      (function mark(k) { zoneOf[k] = zones.length - 1; C[k].kids.forEach(mark); })(id);
    }
    findZones(0);
    // elementos sueltos dentro de un branch pero fuera de zonas → zona "(sin zona)" del branch
    const looseZone = {};
    function zoneFor(cid) {
      if (zoneOf[cid] >= 0) return zoneOf[cid];
      const b = branchOf[cid];
      if (b < 0) return -1;
      if (looseZone[b] === undefined) { zones.push({ b, n: '(fuera de zona) ' + branches[b], bts: '', olt: '', c: [], site: null }); looseZone[b] = zones.length - 1; }
      return looseZone[b];
    }

    // hubs, NAP, rutas, polígonos
    const hubs = [], hubKey = {};
    const naps = [], lines = [], others = [];
    const stats = { puntos: 0, lineas: 0, poligonos: 0, postes: 0, nap: 0, hub: 0, zonas: 0, branches: 0, sinOlt: 0 };
    function hubFor(cid, z) {
      for (let p = cid; p >= 0 && zoneOf[p] === z; p = C[p].parent) {
        const seg = lastSeg(C[p].name);
        if (RX_HUB.test(seg)) {
          const h = hubByName(z, seg);
          if (hubs[h].cid < 0) hubs[h].cid = p;
          return h;
        }
      }
      return -1;
    }
    function normHub(n) { return String(n).toUpperCase().replace(/[\s_-]+/g, '').replace(/^HUB/, 'HB').replace(/^([A-Z]+)0*(\d)/, (m, a, d) => a + d); }
    function hubByName(z, name) {
      const key = z + '|' + normHub(name);
      if (hubKey[key] === undefined) { hubs.push({ z, n: String(name).toUpperCase().replace(/[\s_-]+/g, ''), p: null, cid: -1 }); hubKey[key] = hubs.length - 1; }
      return hubKey[key];
    }
    function inCover(cid, z) { for (let p = cid; p >= 0 && zoneOf[p] === z; p = C[p].parent) if (RX_COVER.test(C[p].name)) return true; return false; }
    function isPoles(cid, z) { for (let p = cid; p >= 0 && zoneOf[p] === z; p = C[p].parent) if (/poste|poles?\b/i.test(C[p].name)) return true; return false; }

    C.forEach(c => {
      if (!c.pms.length) return;
      const z = zoneFor(c.id);
      if (z < 0) return;
      const hb = hubFor(c.id, z);
      const segName = lastSeg(c.name).toUpperCase();
      c.pms.forEach(p => {
        const name = (p.name || '').trim();
        p.g.forEach(g => {
          if (g.t === 'Point') {
            stats.puntos++;
            const pt = g.pts[0];
            if (isPoles(c.id, z)) { stats.postes++; return; }
            if (RX_HUB_POINT.test(name)) {
              const h = hubByName(z, name);
              hubs[h].p = pt;   // un punto llamado HBxx es la ubicación del HUBBOX
              return;
            }
            if (hb >= 0 && c.id === hubs[hb].cid && !hubs[hb].p) { hubs[hb].p = pt; hubs[hb].auto = 1; return; }
            if (RX_NAP.test(name) || (tipo === 'ODN' && hb >= 0)) { naps.push([z, hb, name, pt]); return; }
            if (segName === 'SITE' || segName === 'XBOX' || /XBOX|XB\d/.test(segName) || /^XB\d/i.test(name)) { others.push([z, segName === 'SITE' ? 'SITE' : 'XBOX', name, pt]); return; }
            if (tipo === 'ODN') others.push([z, 'PUNTO', name, pt]);
          } else if (g.t === 'LineString') {
            stats.lineas++;
            if (g.pts.length >= 2) lines.push([z, hb, name, simplify(g.pts, 0.00004)]);
          } else if (g.t === 'Polygon') {
            stats.poligonos++;
            if (g.pts.length >= 3 && !RX_SKIP_POLY.test(name + ' ' + c.name) && (inCover(c.id, z) || c.id === zoneIdCont(z) || tipo === 'ODN'))
              zones[z].c.push(simplify(g.pts, 0.00008));
          }
        });
      });
    });
    function zoneIdCont(z) { for (let i = 0; i < C.length; i++) if (zoneOf[i] === z && (C[i].parent < 0 || zoneOf[C[i].parent] !== z)) return i; return -1; }

    // ubicación del hub = punto propio o centro de sus NAP
    const acc = hubs.map(() => [0, 0, 0]);
    naps.forEach(n => { if (n[1] >= 0) { const a = acc[n[1]]; a[0] += n[3][0]; a[1] += n[3][1]; a[2]++; } });
    hubs.forEach((h, i) => { if (!h.p && acc[i][2]) h.p = [acc[i][0] / acc[i][2], acc[i][1] / acc[i][2]]; });

    stats.nap = naps.length; stats.hub = hubs.filter(h => h.p).length; stats.zonas = zones.length; stats.branches = branches.length;
    stats.sinOlt = zones.filter(z => !z.olt).length;
    stats.bts = new Set(zones.map(z => z.bts).filter(Boolean)).size;
    stats.olt = new Set(zones.map(z => z.olt).filter(Boolean)).size;

    return {
      v: 1, tipo, archivo: opts.archivo || '', creado: new Date().toISOString(), stats,
      branches,
      zones: zones.map(z => ({ b: z.b, n: z.n, bts: z.bts, olt: z.olt, s: z.site ? enc([z.site]) : null, c: z.c.map(enc) })),
      hubs: hubs.map(h => [h.z, h.n, h.p ? enc([h.p]) : null]),
      naps: naps.map(n => [n[0], n[1], n[2], Math.round(n[3][0] * 1e5), Math.round(n[3][1] * 1e5)]),
      lines: lines.map(l => [l[0], l[1], l[2], enc(l[3])]),
      others: others.map(o => [o[0], o[1], o[2], Math.round(o[3][0] * 1e5), Math.round(o[3][1] * 1e5)])
    };
  }

  const api = { indexKml, enc, dec, simplify, RX_OLT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KmzIndex = api;
})(typeof self !== 'undefined' ? self : this);
