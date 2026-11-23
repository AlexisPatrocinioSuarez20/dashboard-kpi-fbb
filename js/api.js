// =========================================================
// CAPA DE DATOS: login con Google + Google Sheets + Google Drive
// Reemplaza al antiguo Código.gs. Mantiene los mismos nombres de funciones
// (getInitialData, saveWaHistory, getTasksFromSheet, ...) para que la interfaz no cambie.
// =========================================================
(function () {
  const CFG = window.APP_CONFIG;
  const DEMO = !CFG.CLIENT_ID || /[?&]demo=1/.test(location.search);
  const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file email';

  // ---------- Tablas (mismo formato de columnas que usaba Apps Script) ----------
  const TABLES = {
    WA_History: {
      headers: ['ID', 'Date', 'BTS', 'Branch', 'Subs', 'Message', 'Collage'],
      fields: ['id', 'date', 'bts', 'branch', 'subs', 'text', 'collage'],
      media: { collage: { flag: 'hasCollage', prefix: 'WA' } },
      dates: ['date'], newestFirst: true
    },
    Tasks: {
      headers: ['ID', 'Category', 'Task Name', 'Detail', 'Deadline', 'Status', 'Date Finished', 'Target', 'KPI Result', 'Progress', 'Staff', 'Photo'],
      fields: ['id', 'category', 'name', 'detail', 'deadline', 'status', 'dateFinished', 'target', 'kpi', 'progress', 'staff', 'photo'],
      media: { photo: { flag: 'hasPhoto', prefix: 'TASK' } },
      dates: ['deadline', 'dateFinished'], numbers: ['progress'], newestFirst: false
    },
    Legal_Incidents: {
      headers: ['ID', 'Date', 'BTS', 'OLT', 'Branch', 'Subs', 'Legal PDF', 'Legal Photos', 'Requested Actions', 'Deadline', 'Bitel Photos', 'SR Code'],
      fields: ['id', 'date', 'bts', 'olt', 'branch', 'subs', 'legalPdf', 'legalPhotos', 'actions', 'deadline', 'bitelPhotos', 'srCode'],
      media: {
        legalPdf: { flag: 'hasPdf', prefix: 'PDF_LEGAL', pdf: true },
        legalPhotos: { flag: 'hasLegalPhotos', prefix: 'LEGAL_ANTES' },
        bitelPhotos: { flag: 'hasBitelPhotos', prefix: 'LEGAL_DESPUES' }
      },
      dates: ['date', 'deadline'], newestFirst: true
    },
    Daily_Report: {
      headers: ['Date', 'Data (JSON - no editar)', 'WhatsApp Text', 'Updated At', 'Updated By'],
      fields: ['id', 'data', 'text', 'updatedAt', 'updatedBy'],
      media: {}, newestFirst: false
    }
  };

  // ---------- Utilidades ----------
  const colLetter = n => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const q = name => `'${String(name).replace(/'/g, "''")}'`;

  // Convierte fechas a YYYY-MM-DD (las fechas antiguas pueden venir como 17/11/2026).
  function normDate(v) {
    const s = String(v ?? '').trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return s;
  }
  const str = v => (v === null || v === undefined) ? '' : String(v);

  const imageUrl = id => `https://drive.google.com/thumbnail?id=${id}&sz=w2000`;
  const pdfUrl = id => `https://drive.google.com/file/d/${id}/view`;
  function normMediaUrl(v, isPdf) {
    const m = /drive\.google\.com\/uc\?export=view&id=([\w-]+)/.exec(v);
    return m ? (isPdf ? pdfUrl(m[1]) : imageUrl(m[1])) : v;
  }

  // =========================================================
  // AUTENTICACIÓN (Google Identity Services)
  // =========================================================
  const Auth = {
    token: null, exp: 0, email: '', client: null,
    restore() {
      try {
        const s = JSON.parse(sessionStorage.getItem('fbb_token') || 'null');
        if (s && s.exp > Date.now() + 60000) { this.token = s.token; this.exp = s.exp; this.email = s.email || ''; return true; }
      } catch (e) {}
      return false;
    },
    signIn() {
      return new Promise((resolve, reject) => {
        if (!window.google || !google.accounts || !google.accounts.oauth2) { reject(new Error('No cargó el servicio de login de Google. Revisa tu conexión.')); return; }
        let hint = ''; try { hint = localStorage.getItem('fbb_email') || ''; } catch (e) {}
        this.client = google.accounts.oauth2.initTokenClient({
          client_id: CFG.CLIENT_ID, scope: SCOPES, hint,
          callback: async resp => {
            if (resp.error) { reject(new Error(resp.error_description || resp.error)); return; }
            this.token = resp.access_token;
            this.exp = Date.now() + (Number(resp.expires_in) || 3600) * 1000;
            try {
              const info = await (await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + this.token } })).json();
              this.email = info.email || '';
              localStorage.setItem('fbb_email', this.email);
            } catch (e) {}
            try { sessionStorage.setItem('fbb_token', JSON.stringify({ token: this.token, exp: this.exp, email: this.email })); } catch (e) {}
            resolve(this.email);
          },
          error_callback: err => reject(new Error(err && err.type === 'popup_closed' ? 'Se cerró la ventana de login.' : 'No se pudo iniciar sesión.'))
        });
        this.client.requestAccessToken({ prompt: this.token ? '' : 'select_account' });
      });
    },
    signOut() {
      if (this.token && window.google && google.accounts) google.accounts.oauth2.revoke(this.token, () => {});
      this.token = null; this.exp = 0;
      try { sessionStorage.removeItem('fbb_token'); } catch (e) {}
    },
    valid() { return this.token && Date.now() < this.exp - 30000; }
  };

  class AuthError extends Error { constructor() { super('Tu sesión de Google expiró. Pulsa "Reconectar".'); this.auth = true; } }

  async function gfetch(url, opts = {}) {
    if (!Auth.valid()) { window.dispatchEvent(new Event('fbb-auth-expired')); throw new AuthError(); }
    const res = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + Auth.token } });
    if (res.status === 401) { Auth.token = null; window.dispatchEvent(new Event('fbb-auth-expired')); throw new AuthError(); }
    if (!res.ok) {
      let msg = res.statusText;
      try { msg = (await res.json()).error.message; } catch (e) {}
      if (res.status === 403 || res.status === 404) msg += ' — ¿La hoja está compartida con tu cuenta como editor?';
      throw new Error(msg);
    }
    return res.status === 204 ? null : res.json();
  }

  // =========================================================
  // ALMACÉN GOOGLE (Sheets API v4 + Drive API v3)
  // =========================================================
  const SHEETS = `https://sheets.googleapis.com/v4/spreadsheets/${CFG.SPREADSHEET_ID}`;
  const GoogleStore = {
    _meta: null,
    async meta(force) {
      if (!this._meta || force) {
        const r = await gfetch(`${SHEETS}?fields=sheets.properties(sheetId,title,index)`);
        this._meta = {};
        r.sheets.sort((a, b) => (a.properties.index || 0) - (b.properties.index || 0))
          .forEach(s => { this._meta[s.properties.title] = s.properties.sheetId; });
      }
      return this._meta;
    },
    async readMany(names, formatted) {
      if (!names.length) return {};
      const qs = names.map(n => 'ranges=' + encodeURIComponent(q(n))).join('&');
      const opt = formatted ? 'valueRenderOption=FORMATTED_VALUE' : 'valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING';
      const r = await gfetch(`${SHEETS}/values:batchGet?${qs}&${opt}`);
      const out = {}; names.forEach((n, i) => { out[n] = (r.valueRanges[i] && r.valueRanges[i].values) || []; });
      return out;
    },
    async readRange(a1) {
      const r = await gfetch(`${SHEETS}/values/${encodeURIComponent(a1)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`);
      return r.values || [];
    },
    async ensureSheet(name, headers) {
      const meta = await this.meta();
      if (meta[name] !== undefined) return;
      await gfetch(`${SHEETS}:batchUpdate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requests: [{ addSheet: { properties: { title: name, gridProperties: { frozenRowCount: 1 } } } }] }) });
      await this.meta(true);
      await this.updateRow(name, 1, headers);
    },
    async appendRow(name, row) {
      await gfetch(`${SHEETS}/values/${encodeURIComponent(q(name) + '!A1')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [row] }) });
    },
    async updateRow(name, rowNum, row) {
      const a1 = `${q(name)}!A${rowNum}:${colLetter(row.length)}${rowNum}`;
      await gfetch(`${SHEETS}/values/${encodeURIComponent(a1)}?valueInputOption=RAW`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [row] }) });
    },
    async deleteRow(name, rowNum) {
      const sheetId = (await this.meta())[name];
      await gfetch(`${SHEETS}:batchUpdate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: rowNum - 1, endIndex: rowNum } } }] }) });
    },
    // Reemplaza todo el contenido de una pestaña por una columna de textos (A1, A2, ...).
    async writeColumn(name, values) {
      await this.ensureSheet(name, [values[0]]);
      await gfetch(`${SHEETS}/values/${encodeURIComponent(q(name))}:clear`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const a1 = `${q(name)}!A1:A${values.length}`;
      await gfetch(`${SHEETS}/values/${encodeURIComponent(a1)}?valueInputOption=RAW`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: values.map(v => [v]) }) });
    },
    async folderId() {
      const key = 'fbb_folder_' + Auth.email;
      let id = null; try { id = localStorage.getItem(key); } catch (e) {}
      if (id) return id;
      const qq = encodeURIComponent(`name='${CFG.DRIVE_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
      const found = await gfetch(`https://www.googleapis.com/drive/v3/files?q=${qq}&fields=files(id)`);
      if (found.files && found.files.length) id = found.files[0].id;
      else id = (await gfetch('https://www.googleapis.com/drive/v3/files?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: CFG.DRIVE_FOLDER, mimeType: 'application/vnd.google-apps.folder' }) })).id;
      try { localStorage.setItem(key, id); } catch (e) {}
      return id;
    },
    async upload(dataUrl, baseName) {
      const [head, b64] = dataUrl.split(',');
      const type = head.split(';')[0].replace('data:', '');
      const isPdf = type === 'application/pdf';
      if (!isPdf && type.indexOf('image/') !== 0) throw new Error('Tipo de archivo no permitido: ' + type);
      const bin = atob(b64); const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const name = baseName + (isPdf ? '.pdf' : (type === 'image/png' ? '.png' : '.jpg'));
      const boundary = 'fbb' + Date.now();
      const body = new Blob([
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [await this.folderId()] })}\r\n--${boundary}\r\nContent-Type: ${type}\r\n\r\n`,
        bytes, `\r\n--${boundary}--`
      ]);
      const file = await gfetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
      // Visible para quien tenga el enlace, igual que en la versión de Apps Script.
      await gfetch(`https://www.googleapis.com/drive/v3/files/${file.id}/permissions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'reader', type: 'anyone' }) });
      return isPdf ? pdfUrl(file.id) : imageUrl(file.id);
    }
  };

  // =========================================================
  // ALMACÉN DEMO (en memoria) — se usa mientras CLIENT_ID esté vacío
  // =========================================================
  const MockStore = {
    data: null,
    seed() {
      if (this.data) return;
      this.data = window.DEMO_DATA ? window.DEMO_DATA() : {};
      Object.keys(TABLES).forEach(n => { if (!this.data[n]) this.data[n] = [TABLES[n].headers.slice()]; });
    },
    async meta() { this.seed(); const m = {}; Object.keys(this.data).forEach((n, i) => m[n] = i); return m; },
    async readMany(names) { this.seed(); const o = {}; names.forEach(n => o[n] = JSON.parse(JSON.stringify(this.data[n] || []))); return o; },
    async readRange(a1) {
      this.seed();
      const m = /^'(.+)'!A(\d+):([A-Z]+)(\d*)$/.exec(a1);
      const name = m[1].replace(/''/g, "'"), start = Number(m[2]), end = m[4] ? Number(m[4]) : Infinity;
      const ncol = m[3].split('').reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0);
      return (this.data[name] || []).slice(start - 1, end === Infinity ? undefined : end).map(r => r.slice(0, ncol));
    },
    async ensureSheet(name, headers) { this.seed(); if (!this.data[name]) this.data[name] = [headers.slice()]; },
    async appendRow(name, row) { this.data[name].push(row.slice()); },
    async updateRow(name, rowNum, row) { this.data[name][rowNum - 1] = row.slice(); },
    async deleteRow(name, rowNum) { this.data[name].splice(rowNum - 1, 1); },
    async upload(dataUrl) { await new Promise(r => setTimeout(r, 300)); return dataUrl; },
    async writeColumn(name, values) { this.seed(); this.data[name] = values.map(v => [v]); }
  };

  const Store = DEMO ? MockStore : GoogleStore;

  // =========================================================
  // CRUD GENÉRICO
  // =========================================================
  function rowsToRecords(table, values) {
    const def = TABLES[table];
    const out = [];
    values.slice(1).forEach(row => {
      if (!row || (!row[0] && !row[2])) return;
      const obj = {};
      def.fields.forEach((f, i) => {
        const media = def.media[f];
        if (media) {
          const v = normMediaUrl(str(row[i]), media.pdf);
          obj[media.flag] = v.length > 10;
          obj[f] = v.length > 500 ? '' : v;      // base64 antiguo: se pide aparte al abrir el detalle
        } else if ((def.numbers || []).includes(f)) obj[f] = Number(row[i]) || 0;
        else if ((def.dates || []).includes(f)) obj[f] = normDate(row[i]);
        else obj[f] = str(row[i]);
      });
      out.push(obj);
    });
    return def.newestFirst ? out.reverse() : out;
  }

  async function findRow(table, id) {
    const ids = await Store.readRange(`${q(table)}!A2:A`);
    const i = ids.findIndex(r => str(r[0]) === str(id));
    return i < 0 ? -1 : i + 2;
  }

  async function saveRecord(table, record) {
    const def = TABLES[table];
    const id = record.id || Date.now();
    const tag = String(record.bts || id).replace(/[^\w,-]/g, '').slice(0, 60);

    const uploaded = {};
    for (const f of Object.keys(def.media)) {
      if (record[f] && String(record[f]).indexOf('data:') === 0) uploaded[f] = await Store.upload(record[f], `${def.media[f].prefix}_${tag}_${Date.now()}`);
    }

    await Store.ensureSheet(table, def.headers);
    const row = await findRow(table, id);
    const existing = row > 0 ? ((await Store.readRange(`${q(table)}!A${row}:${colLetter(def.fields.length)}${row}`))[0] || []) : null;

    const values = def.fields.map((f, i) => {
      if (f === 'id') return id;
      if (def.media[f]) {
        if (uploaded[f]) return uploaded[f];
        if (record[f]) return record[f];
        return existing ? (existing[i] ?? '') : '';
      }
      const v = record[f];
      return (v === undefined || v === null) ? '' : v;
    });

    if (row > 0) await Store.updateRow(table, row, values);
    else await Store.appendRow(table, values);
    return { ok: true, id, media: uploaded };
  }

  async function getRecords(table) {
    const meta = await Store.meta();
    if (meta[table] === undefined) return [];
    return rowsToRecords(table, (await Store.readMany([table]))[table]);
  }

  async function getMedia(table, id) {
    const def = TABLES[table];
    const row = await findRow(table, id);
    if (row < 0) return null;
    const vals = (await Store.readRange(`${q(table)}!A${row}:${colLetter(def.fields.length)}${row}`))[0] || [];
    const res = {};
    Object.keys(def.media).forEach(f => { res[f] = normMediaUrl(str(vals[def.fields.indexOf(f)]), def.media[f].pdf) || null; });
    return res;
  }

  async function deleteRecord(table, id) {
    const row = await findRow(table, id);
    if (row > 0) await Store.deleteRow(table, row);
    return { ok: row > 0 };
  }

  function mainSheetToData(values) {
    if (!values.length) return { headers: [], rows: [] };
    const width = Math.max(...values.map(r => r.length));
    const pad = r => { const a = r.map(str); while (a.length < width) a.push(''); return a; };
    return {
      headers: pad(values[0]),
      rows: values.slice(1).filter(r => r.some(c => str(c) !== '')).map(pad)
    };
  }

  // =========================================================
  // API PÚBLICA (mismos nombres que el antiguo Código.gs)
  // =========================================================
  // Encuentra la pestaña principal aunque el nombre tenga espacios extra o mayúsculas distintas.
  // Si no la encuentra, usa la PRIMERA pestaña de la hoja (igual que hacía Apps Script).
  let mainSheetName = null;
  async function resolveMainSheet() {
    const meta = await Store.meta();
    const names = Object.keys(meta);
    const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
    mainSheetName =
      names.find(n => n === CFG.MAIN_SHEET) ||
      names.find(n => norm(n) === norm(CFG.MAIN_SHEET)) ||
      (CFG.MAIN_SHEET_GID !== undefined ? names.find(n => String(meta[n]) === String(CFG.MAIN_SHEET_GID)) : null) ||
      names.find(n => !TABLES[n]) || null;
    if (!mainSheetName) throw new Error('No se encontró la pestaña principal. Pestañas disponibles: ' + names.join(', '));
    if (mainSheetName !== CFG.MAIN_SHEET) console.warn(`[FBB] Pestaña "${CFG.MAIN_SHEET}" no encontrada; se usa "${mainSheetName}".`);
    return mainSheetName;
  }

  const Backend = {
    async getInitialData() {
      const meta = await Store.meta(true);
      const tables = Object.keys(TABLES).filter(t => meta[t] !== undefined);
      const rest = await Store.readMany(tables);
      const rec = t => rest[t] ? rowsToRecords(t, rest[t]) : [];
      // La base principal se carga aparte: si falla, las demás secciones igual funcionan.
      let bts = null, btsError = null;
      try {
        const name = await resolveMainSheet();
        bts = mainSheetToData((await Store.readMany([name], true))[name]);
      } catch (e) { btsError = e.message; }
      return { bts, btsError, mainSheet: mainSheetName, wa: rec('WA_History'), legal: rec('Legal_Incidents'), tasks: rec('Tasks'), daily: rec('Daily_Report') };
    },
    async getBTSData() {
      const name = mainSheetName || await resolveMainSheet();
      return mainSheetToData((await Store.readMany([name], true))[name]);
    },

    saveWaHistory: r => saveRecord('WA_History', r),
    getWaHistory: () => getRecords('WA_History'),
    getWaCollageById: async id => { const m = await getMedia('WA_History', id); return m ? m.collage : null; },
    deleteWaRecordGAS: id => deleteRecord('WA_History', id),

    saveTaskToSheet: r => saveRecord('Tasks', r),
    getTasksFromSheet: () => getRecords('Tasks'),
    getTaskPhotoById: async id => { const m = await getMedia('Tasks', id); return m ? m.photo : null; },
    deleteTaskFromSheet: id => deleteRecord('Tasks', id),

    saveLegalIncident: r => saveRecord('Legal_Incidents', r),
    getLegalIncidents: () => getRecords('Legal_Incidents'),
    getLegalMediaById: async id => { const m = await getMedia('Legal_Incidents', id); return m ? { pdf: m.legalPdf, legalPhotos: m.legalPhotos, bitelPhotos: m.bitelPhotos } : null; },
    deleteLegalIncidentGAS: id => deleteRecord('Legal_Incidents', id),

    // ----- Coberturas FTTH / ODN para la pestaña Cortes -----
    // Se guardan comprimidas en una pestaña propia ("COB_FTTH" / "COB_ODN"): A1 = datos del archivo, A2… = trozos.
    async saveCoverage(tipo, meta, b64) {
      const CH = 45000, parts = [];
      for (let i = 0; i < b64.length; i += CH) parts.push(b64.slice(i, i + CH));
      const info = { ...meta, tipo, partes: parts.length, subidoPor: Auth.email || 'demo', subidoEl: new Date().toISOString() };
      await Store.writeColumn('COB_' + tipo, [JSON.stringify(info)].concat(parts));
      await Store.ensureSheet('Coberturas_Log', ['Fecha', 'Tipo', 'Archivo', 'Usuario', 'Resumen']);
      await Store.appendRow('Coberturas_Log', [info.subidoEl, tipo, meta.archivo || '', info.subidoPor, JSON.stringify(meta.stats || {})]);
      return info;
    },
    async getCoverage(tipo) {
      const name = 'COB_' + tipo;
      const meta = await Store.meta();
      if (meta[name] === undefined) return null;
      const vals = await Store.readRange(`${q(name)}!A1:A`);
      if (!vals.length || !vals[0][0]) return null;
      return { info: JSON.parse(vals[0][0]), b64: vals.slice(1).map(r => str(r[0])).join('') };
    },

    saveDailyReport: r => saveRecord('Daily_Report', { ...r, updatedAt: new Date().toISOString(), updatedBy: Auth.email || 'demo' }),
    getDailyReports: () => getRecords('Daily_Report'),
    deleteDailyReport: id => deleteRecord('Daily_Report', id)
  };

  // Puente con el código de la interfaz.
  window.hasGAS = () => true;
  window.callGAS = (fnName, ...args) => {
    if (!Backend[fnName]) return Promise.reject(new Error('Función desconocida: ' + fnName));
    return Promise.resolve().then(() => Backend[fnName](...args));
  };
  window.FBB = { Auth, Backend, DEMO, TABLES, normDate, _test: { rowsToRecords, mainSheetToData, colLetter, MockStore } };
})();
