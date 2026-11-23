  let allRows = [], currentFilteredRows = [], tableHeaders = [], branchBarChart = null;
  let waHistoryData = [], legalHistoryData = [], tasksData = [];
  let currentCollageBase64 = {}, activeModalBtsName = 'BTS', activeModalLegalId = null, activeModalCollageSrc = null;

  const staffList = [
    "PATROCINIO SUAREZ ALEXIS ADEMIR", "TAPIA HLARIO ARACELY ESMERALDA", "ARTEAGA CASTRO EDGAR JAIRO",
    "ORTEGA CRUZ SAMUEL", "ANCIETA LIVIA CRISTHIAN DANIEL", "RIVERA SOSAYA JHOEL FREDDY",
    "DE LA CRUZ SANDOVAL MARLO", "VARGAS SALDAÑA JUAN JESUS", "CARRANZA LOPEZ JORGE LUIS"
  ];


  let lastFilteredWa = [], lastFilteredTasks = [];

  // ===== UTILIDADES =====
  // callGAS(nombre, ...args) y hasGAS() vienen de js/api.js (ya no se usa Apps Script).

  // Fecha local YYYY-MM-DD (toISOString usa UTC: en Lima, después de las 19:00 daba el día siguiente).
  function localDate(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Escapa texto antes de insertarlo con innerHTML (evita que comillas o "<" rompan la tabla).
  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Convierte "1,234" o "87.5%" a número.
  function num(v) { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isNaN(n) ? 0 : n; }

  function debounce(fn, ms = 250) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
  const filterTableDebounced = debounce(() => filterTable(), 250);

  // Se llama desde index.html después de iniciar sesión.
  function startApp() {
    ['waLoader', 'legLoader', 'taskLoader'].forEach(id => document.getElementById(id).style.display = 'block');
    const hideLoaders = () => ['waLoader', 'legLoader', 'taskLoader'].forEach(id => document.getElementById(id).style.display = 'none');

    try { initStaffDropdown(); toggleDateFinished(); } catch(e) {}
    try { document.getElementById('waDate').value = localDate(); } catch(e) {}
    try { document.getElementById('legDate').value = localDate(); } catch(e) {}
    document.querySelectorAll('.status-checkbox').forEach(cb => cb.addEventListener('change', () => { updateDropdownButtonText(); filterTable(); }));

    // Una sola carga para todo el contenido inicial.
    return callGAS('getInitialData').then(d => {
      hideLoaders();
      if (d.bts) { renderData(d.bts); window.dispatchEvent(new CustomEvent('fbb-bts', { detail: d.bts })); }
      else document.getElementById('loader').innerHTML = '<div class="alert alert-danger">No se pudo cargar la base principal: ' + esc(d.btsError) + '</div>';
      waHistoryData = d.wa || []; renderWaHistory();
      legalHistoryData = d.legal || []; renderLegalHistory();
      tasksData = d.tasks || []; renderTasks();
      DailyReport.init(d.daily || []);
    }).catch(err => {
      hideLoaders();
      document.getElementById('loader').innerHTML = '<div class="alert alert-danger">Error al cargar: ' + esc(err.message) + '</div>';
      // El Reporte Diario no debe quedarse en "Cargando…": se abre igual para poder trabajar.
      try { DailyReport.init([]); } catch (e) {}
      document.getElementById('dailyReportPane').insertAdjacentHTML('afterbegin', '<div class="alert alert-danger">No se pudieron leer los datos de la hoja: ' + esc(err.message) + '</div>');
      throw err;
    });
  }

  function loadMainData() {
    document.getElementById('loader').style.display = 'block';
    document.getElementById('btsTable').style.display = 'none';
    callGAS('getBTSData').then(renderData).catch(err => {
      document.getElementById('loader').innerHTML = '<div class="alert alert-danger">Error: ' + esc(err.message) + '</div>';
    });
  }


  function renderData(response) {
    document.getElementById('loader').style.display = 'none';
    document.getElementById('btsTable').style.display = 'table';
    if (!response || !response.rows) return;
    tableHeaders = response.headers || [];
    allRows = response.rows || [];
    currentFilteredRows = allRows;

    const headTr = document.createElement('tr');
    for (let idx = 1; idx < tableHeaders.length; idx++) {
      const th = document.createElement('th');
      th.textContent = tableHeaders[idx] || '';
      headTr.appendChild(th);
    }
    document.getElementById('tableHead').innerHTML = '';
    document.getElementById('tableHead').appendChild(headTr);

    populateBranchFilter(allRows);
    updateKPIs(allRows);
    renderRows(allRows);
    renderSummary(allRows);
  }

  // Copia al portapapeles. Antes fallaba dentro de las ventanas emergentes (modales):
  // Bootstrap no deja enfocar el cuadro de texto temporal y no se copiaba nada.
  async function copyTextSafe(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        alert('¡Texto copiado al portapapeles!');
        return;
      }
    } catch (e) { /* se intenta el método alternativo */ }
    const host = document.querySelector('.modal.show .modal-content') || document.body;
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
    host.appendChild(el);
    el.focus(); el.select(); el.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) {}
    host.removeChild(el);
    alert(ok ? '¡Texto copiado al portapapeles!' : 'No se pudo copiar automáticamente. Selecciona el texto y usa Ctrl + C.');
  }

  // Descarga una imagen o PDF. Si está en Google Drive, baja el ARCHIVO ORIGINAL (resolución completa),
  // no la miniatura que se muestra en pantalla.
  function downloadMedia(src, fileName) {
    if (!src) return;
    if (src.indexOf('data:') === 0) {
      const a = document.createElement('a'); a.download = fileName; a.href = src;
      document.body.appendChild(a); a.click(); a.remove();
      return;
    }
    const m = /[?&]id=([\w-]+)/.exec(src) || /\/file\/d\/([\w-]+)/.exec(src);
    window.open(m ? `https://drive.google.com/uc?export=download&id=${m[1]}` : src, '_blank');
  }

  // --- COLLAGES ---
  function previewCollage(event, gridId, btsInputId, titleId, titlePrefix) {
    const files = event.target.files;
    const grid = document.getElementById(gridId);
    const titleBar = document.getElementById(titleId);
    const captureAreaId = gridId === 'legalGrid' ? 'legalCaptureArea' : (gridId === 'bitelGrid' ? 'bitelCaptureArea' : 'collageCaptureArea');
    const captureTarget = document.getElementById(captureAreaId) || grid.parentElement;
    const previewWrapper = grid.closest('[id$="PreviewWrapper"]');
    grid.innerHTML = '';

    const rawBts = document.getElementById(btsInputId).value.trim();
    const btsArray = rawBts.split(',').map(b => b.trim()).filter(Boolean);
    titleBar.textContent = titlePrefix + ' ' + (btsArray.length ? btsArray.join(' - ') : 'BTS');

    if (!files.length) {
      currentCollageBase64[gridId] = null;
      if (previewWrapper) previewWrapper.style.display = 'none';
      return;
    }
    if (previewWrapper) previewWrapper.style.display = 'block';

    let loaded = 0;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = document.createElement('img');
        img.src = e.target.result;
        img.className = 'collage-img-item';
        grid.appendChild(img);
        loaded++;
        if (loaded === files.length) {
          setTimeout(() => {
            // Collage en alta resolución: ~2400 px de ancho sin importar el tamaño de la pantalla.
            const hdScale = Math.min(4, Math.max(2, 2400 / (captureTarget.offsetWidth || 1200)));
            html2canvas(captureTarget, { scale: hdScale, useCORS: true }).then(canvas => {
              currentCollageBase64[gridId] = canvas.toDataURL('image/jpeg', 0.92);
            });
          }, 500);
        }
      };
      reader.readAsDataURL(file);
    });
  }

  function downloadCollagePNG(btsInputId, prefix, gridId) {
    const base64 = currentCollageBase64[gridId || 'collageGrid'];
    if (!base64) { alert('No hay collage generado. Sube imágenes y espera 1 segundo.'); return; }
    const btsArray = document.getElementById(btsInputId).value.trim().split(',').map(b => b.trim()).filter(Boolean);
    const link = document.createElement('a');
    link.download = `${prefix}_${btsArray.length ? btsArray.join('_') : 'BTS'}.jpg`;
    link.href = base64;
    link.click();
  }

  // --- WHATSAPP ---
  function autofillWaData() {
    const btsVal = document.getElementById('waBts').value.trim();
    document.getElementById('collageTitleBar').textContent = btsVal ? `PROBLEM ${btsVal.toUpperCase()}` : 'PROBLEM BTS';
    if (!btsVal) { document.getElementById('waBranch').value = ''; document.getElementById('waSubs').value = ''; return; }
    const rec = allRows.find(r => r && r[3] && String(r[3]).trim().toLowerCase() === btsVal.toLowerCase());
    if (rec) {
      document.getElementById('waBranch').value = rec[1] || '';
      document.getElementById('waSubs').value = num(rec[25]) + num(rec[26]);
    }
  }

  function generateWAMessage(event) {
    event.preventDefault();
    const editId = document.getElementById('editWaId').value;
    const bts = document.getElementById('waBts').value.trim(), branch = document.getElementById('waBranch').value.trim();
    const subs = document.getElementById('waSubs').value.trim(), date = document.getElementById('waDate').value;
    const text = `Fecha del incidente: ${date}\n+${bts} || ${branch} || Clientes afectados: ${subs}\n` +
      `- ¿Qué pasó?: ${document.getElementById('waQ1').value.trim()}\n` +
      `- ¿Por qué pasó?: ${document.getElementById('waQ2').value.trim()}\n` +
      `- ¿Por qué falló la protección?: ${document.getElementById('waQ3').value.trim()}\n` +
      `- ¿Autonomía batería?: ${document.getElementById('waQ4').value.trim()}\n` +
      `- ¿Qué acción se tomó?: ${document.getElementById('waQ5').value.trim()}\n` +
      `- ¿Qué se hará para que no se repita?: ${document.getElementById('waQ6').value.trim()}`;

    document.getElementById('waResultOutput').value = text;
    const newCollage = currentCollageBase64['collageGrid'] || '';
    const record = { id: editId || Date.now(), date, bts, branch, subs, text, collage: newCollage };

    const applyLocal = (collageUrl) => {
      const c = collageUrl || newCollage;
      if (editId) {
        waHistoryData = waHistoryData.map(i => String(i.id) === String(editId)
          ? { ...i, ...record, collage: c || i.collage, hasCollage: c ? true : i.hasCollage }
          : i
        );
      } else {
        waHistoryData.unshift({ ...record, collage: c, hasCollage: !!c });
      }
    };

    if (!hasGAS()) { applyLocal(); cancelWaEdit(); renderWaHistory(); return; }

    const btn = document.getElementById('saveWaBtn');
    const originalText = btn.textContent;
    btn.textContent = '⏳ Guardando...'; btn.disabled = true;
    // Solo se actualiza la lista local si el servidor confirmó el guardado.
    callGAS('saveWaHistory', record).then(res => {
      applyLocal(res && res.media && res.media.collage);
      btn.disabled = false;
      cancelWaEdit();
      renderWaHistory();
      alert(editId ? '¡Registro actualizado en la nube!' : '¡Registro guardado en la nube!');
    }).catch(err => {
      btn.textContent = originalText; btn.disabled = false;
      alert('❌ No se pudo guardar: ' + err.message + '\nTus datos siguen en el formulario.');
    });
  }

  function copyWAMessage() {
    const val = document.getElementById('waResultOutput').value;
    if (!val) { alert('Primero genera el mensaje.'); return; }
    copyTextSafe(val);
  }

  function renderWaHistory() {
    const tbody = document.getElementById('waHistoryTableBody');
    if (!tbody) return;
    if (window.DailyReport) DailyReport.refreshOlt();   // el punto 7 del reporte usa este historial
    tbody.innerHTML = '';
    const fBts = document.getElementById('filterWaBts').value.toLowerCase().trim();
    const fBranch = document.getElementById('filterWaBranch').value.toLowerCase().trim();
    const fStart = document.getElementById('filterWaStartDate').value;
    const fEnd = document.getElementById('filterWaEndDate').value;

    const filtered = waHistoryData.filter(item => {
      const mBts = !fBts || (item.bts && item.bts.toLowerCase().includes(fBts));
      const mBranch = !fBranch || (item.branch && item.branch.toLowerCase().includes(fBranch));
      const mStart = !fStart || (item.date && item.date >= fStart);
      const mEnd = !fEnd || (item.date && item.date <= fEnd);
      return mBts && mBranch && mStart && mEnd;
    });

    lastFilteredWa = filtered;
    if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="5" class="text-muted py-3 text-center">No hay registros históricos encontrados.</td></tr>'; return; }
    tbody.innerHTML = filtered.map(item => `<tr><td>${esc(item.date || '-')}</td><td class="fw-bold">${esc(item.bts || '-')}</td><td>${esc(item.branch || '-')}</td><td>${esc(item.subs || '-')}</td>
        <td><button class="btn btn-outline-primary btn-sm py-0 px-1 me-1" onclick="viewWaRecord('${esc(item.id)}')">👁️ Ver</button>
        <button class="btn btn-outline-danger btn-sm py-0 px-1" onclick="deleteWaRecord('${esc(item.id)}')">🗑️ Eliminar</button></td></tr>`).join('');
  }

  function clearWaFilters() {
    ['filterWaBts','filterWaBranch','filterWaStartDate','filterWaEndDate'].forEach(id => document.getElementById(id).value = '');
    renderWaHistory();
  }

  function viewWaRecord(id) {
    const rec = waHistoryData.find(i => String(i.id) === String(id));
    if (!rec) return;
    activeModalBtsName = rec.bts;
    document.getElementById('modalWaText').value = rec.text || '';
    const box = document.getElementById('modalWaCollageBox');

    const renderImg = src => {
      activeModalCollageSrc = src;
      box.innerHTML = src ? `<img src="${src}" style="max-width:100%;max-height:550px;object-fit:contain;border-radius:6px;">` : '<span class="text-muted">Sin collage guardado</span>';
    };

    if (rec.collage && rec.collage.length > 10) {
      renderImg(rec.collage);
    } else if (rec.hasCollage) {
      box.innerHTML = '<div class="spinner-border text-success"></div>';
      callGAS('getWaCollageById', id).then(renderImg).catch(() => renderImg(null));
    } else {
      renderImg(null);
    }

    document.getElementById('mdlWa-editBtn').onclick = () => {
      bootstrap.Modal.getInstance(document.getElementById('waDetailModal')).hide();
      editWaRecord(id);
    };
    new bootstrap.Modal(document.getElementById('waDetailModal')).show();
  }

  function editWaRecord(id) {
    const rec = waHistoryData.find(i => String(i.id) === String(id));
    if (!rec) return;

    document.getElementById('editWaId').value = rec.id;
    document.getElementById('waBts').value = rec.bts || '';
    document.getElementById('waBranch').value = rec.branch || '';
    document.getElementById('waSubs').value = rec.subs || '';
    document.getElementById('waDate').value = rec.date || '';

    const extract = (start, end) => {
      const re = end ? new RegExp(start + '([\\s\\S]*?)(?=\\n' + end + ')') : new RegExp(start + '([\\s\\S]*)$');
      const m = (rec.text || '').match(re);
      return m ? m[1].trim() : '';
    };

    document.getElementById('waQ1').value = extract('- ¿Qué pasó\\?:', '- ¿Por qué pasó\\?:');
    document.getElementById('waQ2').value = extract('- ¿Por qué pasó\\?:', '- ¿Por qué falló la protección\\?:');
    document.getElementById('waQ3').value = extract('- ¿Por qué falló la protección\\?:', '- ¿Autonomía batería\\?:');
    document.getElementById('waQ4').value = extract('- ¿Autonomía batería\\?:', '- ¿Qué acción se tomó\\?:');
    document.getElementById('waQ5').value = extract('- ¿Qué acción se tomó\\?:', '- ¿Qué se hará para que no se repita\\?:');
    document.getElementById('waQ6').value = extract('- ¿Qué se hará para que no se repita\\?:', null);

    document.getElementById('waPhotos').value = '';
    currentCollageBase64['collageGrid'] = null;
    document.getElementById('collagePreviewWrapper').style.display = 'none';

    document.getElementById('saveWaBtn').textContent = '💾 Actualizar Registro';
    document.getElementById('cancelWaBtn').classList.remove('d-none');
    window.scrollTo({ top: document.getElementById('waForm').offsetTop - 100, behavior: 'smooth' });
  }

  function cancelWaEdit() {
    document.getElementById('waForm').reset();
    document.getElementById('editWaId').value = '';
    document.getElementById('waDate').value = localDate();
    currentCollageBase64['collageGrid'] = null;
    document.getElementById('collagePreviewWrapper').style.display = 'none';
    document.getElementById('saveWaBtn').textContent = '💾 Guardar en Histórico y Generar Mensaje';
    document.getElementById('cancelWaBtn').classList.add('d-none');
  }

  function copyModalText() { const v = document.getElementById('modalWaText').value; if (v) copyTextSafe(v); }
  function downloadModalCollage() {
    if (!activeModalCollageSrc) { alert('Sin collage adjunto.'); return; }
    downloadMedia(activeModalCollageSrc, `PROBLEM_${(activeModalBtsName || 'BTS').toUpperCase()}.jpg`);
  }
  function deleteWaRecord(id) {
    if (!confirm('¿Desea eliminar este registro histórico?')) return;
    const removeLocal = () => { waHistoryData = waHistoryData.filter(i => String(i.id) !== String(id)); renderWaHistory(); };
    if (!hasGAS()) { removeLocal(); return; }
    callGAS('deleteWaRecordGAS', id).then(removeLocal).catch(err => alert('❌ No se pudo eliminar: ' + err.message));
  }

  // El PDF ejecutivo está al final de este archivo (sección EXPORTAR PDF EJECUTIVO).
  function exportWaHistoryPDF() { PdfReport.open(); }

  // --- LEGAL ---
  function encodeLegalPdf(event) {
    const file = event.target.files[0];
    if (!file) { document.getElementById('legPdfBase64').value = ''; return; }
    const reader = new FileReader();
    reader.onload = e => { document.getElementById('legPdfBase64').value = e.target.result; };
    reader.readAsDataURL(file);
  }

  function autofillLegalData() {
    const rawBts = document.getElementById('legBts').value.trim();
    if (!rawBts) {
      ['legOlt','legBranch','legSubs'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('legalTitleBar').textContent = 'ANTES BTS';
      document.getElementById('bitelTitleBar').textContent = 'FOTOS DESPUÉS BTS';
      return;
    }
    const btsArray = rawBts.split(',').map(b => b.trim()).filter(Boolean);
    let totalSubs = 0; const olts = new Set(), branches = new Set();
    btsArray.forEach(bts => {
      const rec = allRows.find(r => r && r[3] && String(r[3]).trim().toLowerCase() === bts.toLowerCase());
      if (rec) {
        if (rec[4]) olts.add(String(rec[4]).trim());
        if (rec[1]) branches.add(String(rec[1]).trim());
        totalSubs += num(rec[25]) + num(rec[26]);
      }
    });
    document.getElementById('legOlt').value = Array.from(olts).join(', ');
    document.getElementById('legBranch').value = Array.from(branches).join(', ');
    document.getElementById('legSubs').value = totalSubs;
    const suffix = btsArray.join(' - ').toUpperCase();
    document.getElementById('legalTitleBar').textContent = `ANTES ${suffix}`;
    document.getElementById('bitelTitleBar').textContent = `FOTOS DESPUÉS ${suffix}`;
  }

  function saveLegalIncident(event) {
    event.preventDefault();
    const record = {
      id: Date.now(), date: document.getElementById('legDate').value, bts: document.getElementById('legBts').value.trim(),
      olt: document.getElementById('legOlt').value, branch: document.getElementById('legBranch').value, subs: document.getElementById('legSubs').value,
      srCode: document.getElementById('legSrCode').value.trim(), legalPdf: document.getElementById('legPdfBase64').value,
      legalPhotos: currentCollageBase64['legalGrid'] || '', actions: document.getElementById('legActions').value.trim(),
      deadline: document.getElementById('legDeadline').value, bitelPhotos: currentCollageBase64['bitelGrid'] || ''
    };
    const addLocal = (media = {}) => legalHistoryData.unshift({
      ...record,
      legalPdf: media.legalPdf || record.legalPdf, legalPhotos: media.legalPhotos || record.legalPhotos, bitelPhotos: media.bitelPhotos || record.bitelPhotos,
      hasPdf: !!record.legalPdf, hasLegalPhotos: !!record.legalPhotos, hasBitelPhotos: !!record.bitelPhotos
    });
    if (hasGAS()) {
      const btn = document.getElementById('saveLegalBtn');
      btn.textContent = 'Guardando...'; btn.disabled = true;
      callGAS('saveLegalIncident', record).catch(err => {
        btn.textContent = '💾 Guardar Reporte Legal'; btn.disabled = false;
        alert('❌ No se pudo guardar: ' + err.message + '\nTus datos siguen en el formulario.');
        return null;
      }).then(res => {
        if (!res) return;
        addLocal(res.media);
        btn.textContent = '💾 Guardar Reporte Legal'; btn.disabled = false;
        document.getElementById('legalForm').reset();
        currentCollageBase64['legalGrid'] = null; currentCollageBase64['bitelGrid'] = null;
        document.getElementById('legalPreviewWrapper').style.display = 'none';
        document.getElementById('bitelPreviewWrapper').style.display = 'none';
        document.getElementById('legPdfBase64').value = '';
        renderLegalHistory();
        alert('¡Reporte Legal guardado!');
      });
    } else { addLocal(); renderLegalHistory(); }
  }

  function renderLegalHistory() {
    const tbody = document.getElementById('legalHistoryTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const fBts = document.getElementById('filterLegBts').value.toLowerCase().trim();
    const fBranch = document.getElementById('filterLegBranch').value.toLowerCase().trim();
    const filtered = legalHistoryData.filter(i => (!fBts || (i.bts && i.bts.toLowerCase().includes(fBts))) && (!fBranch || (i.branch && i.branch.toLowerCase().includes(fBranch))));
    if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="7" class="text-muted py-3 text-center">No hay reportes legales registrados.</td></tr>'; return; }
    tbody.innerHTML = filtered.map(item => `<tr><td>${esc(item.date || '-')}</td><td class="fw-bold">${esc(item.bts || '-')}</td><td>${esc(item.olt || '-')}</td><td>${esc(item.branch || '-')}</td>
        <td>${esc(item.srCode || '-')}</td><td class="text-danger fw-bold">${esc(item.deadline || '-')}</td>
        <td><button class="btn btn-outline-danger btn-sm py-0 px-2" onclick="viewLegalRecord('${esc(item.id)}')">👁️ Ver</button></td></tr>`).join('');
  }

  function clearLegFilters() { document.getElementById('filterLegBts').value = ''; document.getElementById('filterLegBranch').value = ''; renderLegalHistory(); }

  function viewLegalRecord(id) {
    const rec = legalHistoryData.find(i => String(i.id) === String(id));
    if (!rec) return;
    activeModalLegalId = id;
    document.getElementById('mdlL-bts').textContent = rec.bts;
    document.getElementById('mdlL-olt').textContent = rec.olt;
    document.getElementById('mdlL-branch').textContent = rec.branch;
    document.getElementById('mdlL-subs').textContent = rec.subs;
    document.getElementById('mdlL-srCode').textContent = rec.srCode || '-';
    document.getElementById('mdlL-actions').textContent = rec.actions;

    const pdfBox = document.getElementById('mdlL-pdfBox');
    const photoCarta = document.getElementById('mdlL-photoCarta');
    const photoBitel = document.getElementById('mdlL-photoBitel');

    const showMedia = (pdf, antes, despues) => {
      pdfBox.innerHTML = pdf ? `<a href="${pdf}" target="_blank" download="Carta_Legal_${rec.bts}.pdf" class="btn btn-sm btn-primary">📄 Ver / Descargar PDF</a>` : '<span class="text-muted small">Sin PDF adjunto</span>';
      photoCarta.innerHTML = antes ? `<img src="${antes}" style="max-width:100%;max-height:300px;object-fit:contain;border-radius:6px;cursor:pointer;" onclick="window.open('${antes}')">` : '<span class="text-muted small">Sin evidencia fotográfica.</span>';
      photoBitel.innerHTML = despues ? `<img src="${despues}" style="max-width:100%;max-height:300px;object-fit:contain;border-radius:6px;cursor:pointer;" onclick="window.open('${despues}')">` : '<span class="text-muted small">Sin evidencia de acciones.</span>';
    };

    if ((rec.hasPdf && !rec.legalPdf) || (rec.hasLegalPhotos && !rec.legalPhotos) || (rec.hasBitelPhotos && !rec.bitelPhotos)) {
      pdfBox.innerHTML = '<div class="spinner-border spinner-border-sm text-primary"></div>';
      photoCarta.innerHTML = '<div class="spinner-border text-danger"></div>';
      photoBitel.innerHTML = '<div class="spinner-border text-success"></div>';
      callGAS('getLegalMediaById', id).then(m => showMedia(m && m.pdf, m && m.legalPhotos, m && m.bitelPhotos)).catch(() => showMedia(null, null, null));
    } else {
      showMedia(rec.legalPdf, rec.legalPhotos, rec.bitelPhotos);
    }

    document.getElementById('mdlL-deleteBtn').onclick = () => {
      if (!confirm('¿Desea eliminar permanentemente este reporte legal?')) return;
      bootstrap.Modal.getInstance(document.getElementById('legalDetailModal')).hide();
      const removeLocal = () => { legalHistoryData = legalHistoryData.filter(i => String(i.id) !== String(id)); renderLegalHistory(); };
      if (!hasGAS()) { removeLocal(); return; }
      callGAS('deleteLegalIncidentGAS', id).then(removeLocal).catch(err => alert('❌ No se pudo eliminar: ' + err.message));
    };
    new bootstrap.Modal(document.getElementById('legalDetailModal')).show();
  }

  function copyLegalWa() {
    const rec = legalHistoryData.find(i => String(i.id) === String(activeModalLegalId));
    if (!rec) return;
    copyTextSafe(`++ Reporte de interferencia\n+ BTS: ${rec.bts}\n+ OLT Bitel: ${rec.olt}\n+ Branch: ${rec.branch}\n+ Clientes afectados: ${rec.subs}\n+ Acciones realizadas: ${rec.actions}`);
  }

  function downloadModalImage(divId, suffix) {
    const img = document.getElementById(divId).querySelector('img');
    if (!img) { alert('No hay imagen para descargar.'); return; }
    const rec = legalHistoryData.find(i => String(i.id) === String(activeModalLegalId));
    const safeBts = rec ? rec.bts.replace(/,/g, '_').replace(/ /g, '') : 'BTS';
    downloadMedia(img.src, `${suffix}_${safeBts}.jpg`);
  }

  function downloadCombinedLegalImage() {
    const rec = legalHistoryData.find(i => String(i.id) === String(activeModalLegalId));
    const safeBts = rec ? rec.bts.replace(/,/g, '_').replace(/ /g, '') : 'BTS';
    html2canvas(document.getElementById('legalModalCaptureArea'), { scale: 2, useCORS: true }).then(canvas => {
      const link = document.createElement('a');
      link.download = `REPORTE_LEGAL_${safeBts}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    });
  }

  // --- TAREAS Y CALENDARIO ---
  function initStaffDropdown() {
    const list = document.getElementById('staffDropdownList');
    if (!list) return;
    list.innerHTML = '';
    staffList.forEach(name => {
      const li = document.createElement('li');
      li.innerHTML = `<label class="dropdown-item px-2 py-1"><input class="form-check-input me-2 staff-cb" type="checkbox" value="${name}"> ${name}</label>`;
      list.appendChild(li);
    });
    document.querySelectorAll('.staff-cb').forEach(cb => cb.addEventListener('change', () => {
      document.getElementById('taskStaff').value = Array.from(document.querySelectorAll('.staff-cb:checked')).map(c => c.value).join(', ');
    }));
  }

  function parseProgressMath(val) {
    if (!val) return 0;
    const str = String(val).trim();
    if (str.startsWith('=')) {
      try { return Math.max(0, Math.min(100, Math.round(new Function('return ' + str.substring(1).replace(/[^0-9+\-*/().]/g, ''))() * 100))); }
      catch(e) { return 0; }
    }
    return Math.max(0, Math.min(100, parseInt(str) || 0));
  }

  function getTaskStatusBadge(status) {
    const map = { 'Finished': 'status-finished', 'In progress': 'status-inprogress', 'Stand-by': 'status-standby' };
    return `<span class="badge ${map[status] || 'status-pending'} w-100">${status}</span>`;
  }

  function getTimeStatus(task) {
    if (!task.deadline) return { text: '-', class: 'text-dark' };
    const dead = new Date(task.deadline + 'T00:00:00');
    const comp = (task.status === 'Finished' && task.dateFinished) ? new Date(task.dateFinished + 'T00:00:00') : new Date();
    comp.setHours(0,0,0,0); dead.setHours(0,0,0,0);
    return comp > dead ? { text: 'Overtime', class: 'text-danger fw-bold' } : { text: 'On Time', class: 'text-primary fw-bold' };
  }

  function toggleDateFinished() {
    const stat = document.getElementById('taskStatus');
    const container = document.getElementById('dateFinishedContainer');
    if (stat.value === 'Finished') { container.classList.remove('d-none'); document.getElementById('taskDateFinished').setAttribute('required', 'true'); }
    else { container.classList.add('d-none'); document.getElementById('taskDateFinished').removeAttribute('required'); document.getElementById('taskDateFinished').value = ''; }
  }

  function renderTasks() {
    const tbody = document.getElementById('taskTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const fCat = document.getElementById('filterTaskCat').value, fStat = document.getElementById('filterTaskStatus').value;
    const fStaff = document.getElementById('filterTaskStaff').value.toLowerCase().trim();
    const fStart = document.getElementById('filterTaskDStart').value, fEnd = document.getElementById('filterTaskDEnd').value;

    const filtered = tasksData.filter(t => (!fCat || t.category === fCat) && (!fStat || t.status === fStat) && (!fStaff || (t.staff && t.staff.toLowerCase().includes(fStaff))) && (!fStart || (t.deadline && t.deadline >= fStart)) && (!fEnd || (t.deadline && t.deadline <= fEnd)));
    lastFilteredTasks = filtered;
    if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="12" class="text-muted py-3 text-center">No hay tareas registradas.</td></tr>'; }
    else {
      tbody.innerHTML = filtered.map(task => {
        const prog = task.progress || 0, barColor = prog == 100 ? 'bg-success' : (prog > 0 ? 'bg-info' : 'bg-secondary'), ts = getTimeStatus(task);
        return `<tr><td>${esc(task.category)}</td><td class="fw-bold text-wrap" style="max-width:200px;">${esc(task.name)}</td><td class="text-wrap" style="max-width:200px;">${esc(task.detail || '-')}</td>
          <td style="width:100px;">${getTaskStatusBadge(task.status)}</td><td class="${ts.class}">${ts.text}</td><td>${esc(task.deadline || '-')}</td><td>${esc(task.dateFinished || '-')}</td>
          <td>${esc(task.target || '-')}</td><td>${esc(task.kpi || '-')}</td><td style="min-width:120px;"><div class="progress" style="height:20px;font-weight:bold;font-size:0.75rem;"><div class="progress-bar ${barColor}" style="width:${prog}%;">${prog}%</div></div></td>
          <td style="font-size:0.7rem;">${esc(task.staff)}</td><td><button class="btn btn-outline-primary btn-sm py-0 px-1 w-100" onclick="viewTaskModal('${esc(task.id)}')">👁️ Ver</button></td></tr>`;
      }).join('');
    }
    renderTaskSummaries(filtered);
    renderTaskCalendar(filtered);
  }

  function renderTaskSummaries(tasks) {
    const upcomingBody = document.getElementById('upcomingTasksBody'), staffSumBody = document.getElementById('staffSummaryBody');
    const today = new Date(); today.setHours(0,0,0,0);
    const limitDay = new Date(today); limitDay.setDate(today.getDate() + 10);
    const upcoming = tasks.filter(t => t.status !== 'Finished' && t.deadline && new Date(t.deadline + 'T00:00:00') >= today && new Date(t.deadline + 'T00:00:00') <= limitDay).sort((a,b) => a.deadline.localeCompare(b.deadline));
    upcomingBody.innerHTML = upcoming.length ? upcoming.map(t => `<tr><td class="fw-bold" style="font-size:0.8rem;white-space:normal;">${t.name}</td><td class="text-danger fw-bold" style="font-size:0.8rem;">${t.deadline}</td><td><span class="badge ${t.progress==100?'bg-success':(t.progress>0?'bg-info':'bg-secondary')}">${t.progress||0}%</span></td><td style="font-size:0.75rem;white-space:normal;">${t.staff}</td></tr>`).join('') : '<tr><td colspan="4" class="text-center text-muted">No hay tareas próximas a vencer.</td></tr>';

    const sMap = new Map();
    tasks.forEach(t => { if (!t.staff) return; t.staff.split(',').map(n => n.trim()).filter(Boolean).forEach(n => { if (!sMap.has(n)) sMap.set(n, { count: 0, sum: 0 }); sMap.get(n).count++; sMap.get(n).sum += (t.progress || 0); }); });
    const sArr = Array.from(sMap.entries()).sort((a,b) => b[1].count - a[1].count);
    staffSumBody.innerHTML = sArr.length ? sArr.map(([name, d]) => { const avg = Math.round(d.sum / d.count); return `<tr><td style="font-size:0.75rem;font-weight:bold;">${name}</td><td class="text-center fw-bold text-primary">${d.count}</td><td><div class="progress" style="height:15px;font-weight:bold;font-size:0.65rem;"><div class="progress-bar ${avg==100?'bg-success':(avg>50?'bg-info':'bg-warning')}" style="width:${avg}%;">${avg}%</div></div></td></tr>`; }).join('') : '<tr><td colspan="3" class="text-center text-muted">No hay datos de staff.</td></tr>';
  }

  function renderTaskCalendar(tasks) {
    const cBody = document.getElementById('calendarBody'); cBody.innerHTML = '';
    const now = new Date(), dayOfW = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const startD = new Date(now); startD.setDate(now.getDate() - dayOfW - 7); startD.setHours(0,0,0,0);
    const todayStr = localDate(now);
    let tr = document.createElement('tr');
    for (let i = 0; i < 21; i++) {
      if (i > 0 && i % 7 === 0) { cBody.appendChild(tr); tr = document.createElement('tr'); }
      const curr = new Date(startD); curr.setDate(startD.getDate() + i);
      const currStr = localDate(curr);
      const td = document.createElement('td');
      td.className = 'calendar-cell' + (currStr === todayStr ? ' today' : '');
      td.innerHTML = `<div class="day-number">${currStr.slice(8,10)}/${currStr.slice(5,7)}</div>`;
      tasks.filter(t => t.deadline === currStr).forEach(t => {
        const bg = { 'Finished': '#d1e7dd', 'In progress': '#fff3cd', 'Stand-by': '#e3f2fd', 'Pending': '#f8d7da' }[t.status] || '#fff';
        const bd = { 'Finished': '#198754', 'In progress': '#ffc107', 'Stand-by': '#0dcaf0', 'Pending': '#dc3545' }[t.status] || '#6c757d';
        const div = document.createElement('div');
        div.className = 'task-badge-cal'; div.style.backgroundColor = bg; div.style.borderLeftColor = bd;
        div.onclick = () => viewTaskModal(t.id);
        div.innerHTML = `<div class="d-flex justify-content-between mb-1"><div class="fw-bold text-dark text-truncate" style="max-width:75%;">${t.name}</div><span class="badge bg-secondary" style="font-size:0.55rem;">${t.progress}%</span></div><div style="font-size:0.65rem;color:#475569;">🎯 ${t.target||'-'}</div><div style="font-size:0.65rem;color:#475569;">📊 ${t.kpi||'-'}</div>`;
        td.appendChild(div);
      });
      tr.appendChild(td);
    }
    cBody.appendChild(tr);
  }

  function copyUpcomingTasksWa() {
    const today = new Date(); today.setHours(0,0,0,0);
    const limitDay = new Date(today); limitDay.setDate(today.getDate() + 10);
    const upcoming = tasksData.filter(t => t.status !== 'Finished' && t.deadline && new Date(t.deadline + 'T00:00:00') >= today && new Date(t.deadline + 'T00:00:00') <= limitDay).sort((a,b) => a.deadline.localeCompare(b.deadline));
    if (!upcoming.length) { alert('No hay tareas próximas a vencer.'); return; }
    copyTextSafe('*Status task por vencerse:*\n' + upcoming.map((t, i) => `${i + 1}. ${t.name} || Deadline ${t.deadline} || Staff: ${t.staff}`).join('\n'));
  }

  function exportTasksExcel() {
    const tasksToExport = lastFilteredTasks;   // respeta los filtros aplicados
    if (!tasksToExport.length) { alert('No hay tareas para exportar con los filtros actuales.'); return; }
    let html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><body><table border="1"><tr style="background:#002266;color:#fff;font-weight:bold;"><th>Category</th><th>Task</th><th>Detail</th><th>Status</th><th>Time Status</th><th>Deadline</th><th>Date Finished</th><th>Target</th><th>KPI Result</th><th>Progress (%)</th><th>Staff</th></tr>`;
    tasksToExport.forEach(t => { html += `<tr><td>${esc(t.category)}</td><td>${esc(t.name)}</td><td>${esc(t.detail||'-')}</td><td>${esc(t.status)}</td><td>${getTimeStatus(t).text}</td><td>${esc(t.deadline||'-')}</td><td>${esc(t.dateFinished||'-')}</td><td>${esc(t.target||'-')}</td><td>${esc(t.kpi||'-')}</td><td>${t.progress||0}%</td><td>${esc(t.staff||'-')}</td></tr>`; });
    html += '</table></body></html>';
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' })); link.download = 'Seguimiento_Tareas.xls'; link.click();
  }

  function clearTaskFilters() { ['filterTaskCat','filterTaskStatus','filterTaskStaff','filterTaskDStart','filterTaskDEnd'].forEach(id => document.getElementById(id).value = ''); renderTasks(); }

  function saveTask(event) {
    event.preventDefault();
    const id = document.getElementById('editTaskId').value, file = document.getElementById('taskPhoto').files[0];
    const proceed = b64 => {
      const taskObj = {
        id: id || Date.now(), category: document.getElementById('taskCategory').value, name: document.getElementById('taskName').value.trim(),
        detail: document.getElementById('taskDetail').value.trim(), deadline: document.getElementById('taskDeadline').value, status: document.getElementById('taskStatus').value,
        dateFinished: document.getElementById('taskDateFinished').value || null, target: document.getElementById('taskTarget').value.trim(), kpi: document.getElementById('taskKpi').value.trim(),
        progress: parseProgressMath(document.getElementById('taskProgress').value), staff: document.getElementById('taskStaff').value.trim(), photo: b64 || ''
      };
      const applyLocal = (photoUrl) => {
        const p = photoUrl || taskObj.photo;
        if (id) tasksData = tasksData.map(t => String(t.id) === String(id) ? { ...t, ...taskObj, photo: p || t.photo, hasPhoto: p ? true : t.hasPhoto } : t);
        else tasksData.push({ ...taskObj, photo: p, hasPhoto: !!p });
      };

      if (hasGAS()) {
        const btn = document.getElementById('saveTaskBtn'), originalText = btn.textContent;
        btn.textContent = 'Guardando...'; btn.disabled = true;
        callGAS('saveTaskToSheet', taskObj).then(res => {
          applyLocal(res && res.media && res.media.photo);
          btn.textContent = '💾 Guardar Tarea'; btn.disabled = false; cancelEditTask(); renderTasks();
        }).catch(err => {
          btn.textContent = originalText; btn.disabled = false;
          alert('❌ No se pudo guardar la tarea: ' + err.message);
        });
      } else { applyLocal(); cancelEditTask(); renderTasks(); }
    };
    if (file) { const r = new FileReader(); r.onload = e => proceed(e.target.result); r.readAsDataURL(file); } else proceed(null);
  }

  function viewTaskModal(id) {
    const t = tasksData.find(x => String(x.id) === String(id)); if (!t) return;
    const ts = getTimeStatus(t);
    document.getElementById('mdlT-category').textContent = t.category; document.getElementById('mdlT-task').textContent = t.name;
    document.getElementById('mdlT-detail').textContent = t.detail || '-'; document.getElementById('mdlT-status').innerHTML = getTaskStatusBadge(t.status);
    document.getElementById('mdlT-time').innerHTML = `<span class="${ts.class}">${ts.text}</span>`; document.getElementById('mdlT-deadline').textContent = t.deadline || '-';
    document.getElementById('mdlT-datefin').textContent = t.dateFinished || '-'; document.getElementById('mdlT-target').textContent = t.target || '-';
    document.getElementById('mdlT-kpi').textContent = t.kpi || '-'; document.getElementById('mdlT-progress').innerHTML = `<div class="progress" style="height:20px;"><div class="progress-bar bg-info" style="width:${t.progress}%">${t.progress}%</div></div>`;
    document.getElementById('mdlT-staff').textContent = t.staff || '-';

    const pb = document.getElementById('mdlT-photoBox');
    const showPhoto = src => { pb.innerHTML = src ? `<img src="${src}" style="max-width:100%;max-height:300px;object-fit:contain;border-radius:6px;cursor:pointer;" onclick="window.open('${src}')">` : '<span class="text-muted">No se adjuntó fotografía.</span>'; };
    if (t.photo && t.photo.length > 10) showPhoto(t.photo);
    else if (t.hasPhoto) { pb.innerHTML = '<div class="spinner-border text-info"></div>'; callGAS('getTaskPhotoById', id).then(showPhoto).catch(() => showPhoto(null)); }
    else showPhoto(null);

    document.getElementById('mdlT-deleteBtn').onclick = () => { bootstrap.Modal.getInstance(document.getElementById('taskDetailModal')).hide(); deleteTask(id); };
    document.getElementById('mdlT-editBtn').onclick = () => { bootstrap.Modal.getInstance(document.getElementById('taskDetailModal')).hide(); editTask(id); };
    new bootstrap.Modal(document.getElementById('taskDetailModal')).show();
  }

  function editTask(id) {
    const t = tasksData.find(x => String(x.id) === String(id)); if (!t) return;
    document.getElementById('editTaskId').value = t.id; document.getElementById('taskCategory').value = t.category;
    document.getElementById('taskName').value = t.name; document.getElementById('taskDetail').value = t.detail || '';
    document.getElementById('taskDeadline').value = t.deadline || ''; document.getElementById('taskStatus').value = t.status || 'Pending';
    document.getElementById('taskDateFinished').value = t.dateFinished || ''; document.getElementById('taskTarget').value = t.target || '';
    document.getElementById('taskKpi').value = t.kpi || ''; document.getElementById('taskProgress').value = t.progress || '';
    document.getElementById('taskStaff').value = t.staff || ''; document.getElementById('taskPhoto').value = '';
    toggleDateFinished();
    const sel = (t.staff || '').split(',').map(s => s.trim());
    document.querySelectorAll('.staff-cb').forEach(cb => { cb.checked = sel.includes(cb.value); });
    document.getElementById('saveTaskBtn').textContent = '💾 Actualizar Tarea';
    document.getElementById('cancelTaskBtn').classList.remove('d-none');
    window.scrollTo({ top: document.getElementById('taskForm').offsetTop - 150, behavior: 'smooth' });
  }

  function cancelEditTask() {
    document.getElementById('taskForm').reset(); document.getElementById('editTaskId').value = '';
    document.querySelectorAll('.staff-cb').forEach(cb => cb.checked = false);
    document.getElementById('taskStaff').value = ''; toggleDateFinished();
    document.getElementById('saveTaskBtn').textContent = '💾 Guardar Tarea';
    document.getElementById('cancelTaskBtn').classList.add('d-none');
  }

  function deleteTask(id) {
    if (!confirm('¿Desea eliminar permanentemente esta tarea?')) return;
    const removeLocal = () => { tasksData = tasksData.filter(t => String(t.id) !== String(id)); renderTasks(); };
    if (!hasGAS()) { removeLocal(); return; }
    callGAS('deleteTaskFromSheet', id).then(removeLocal).catch(err => alert('❌ No se pudo eliminar: ' + err.message));
  }

  // --- DASHBOARD PRINCIPAL, KPIs, FILTROS Y GRÁFICO ---
  function populateBranchFilter(rows) {
    const branches = Array.from(new Set(rows.map(r => r && r[1] ? String(r[1]).trim() : '').filter(Boolean))).sort();
    const list = document.getElementById('branchCheckboxList');
    if (!list) return;
    list.innerHTML = branches.map(b => `<li><label class="dropdown-item px-2 py-1"><input class="form-check-input me-2 branch-checkbox" type="checkbox" value="${b}"> ${b}</label></li>`).join('');
    document.querySelectorAll('.branch-checkbox').forEach(cb => cb.addEventListener('change', () => { updateBranchDropdownText(); filterTable(); }));
  }

  function updateBranchDropdownText() {
    const checked = document.querySelectorAll('.branch-checkbox:checked');
    document.getElementById('dropdownBranchText').textContent = !checked.length ? 'Seleccionar branch...' : (checked.length === 1 ? checked[0].value : `${checked.length} seleccionados`);
  }

  function updateDropdownButtonText() {
    const checked = document.querySelectorAll('.status-checkbox:checked');
    document.getElementById('dropdownButtonText').textContent = !checked.length ? 'Seleccionar estados...' : (checked.length === 1 ? checked[0].value : `${checked.length} seleccionados`);
  }

  function updateKPIs(rows) {
    const btsMap = new Map();
    rows.forEach(r => { if (!Array.isArray(r)) return; const b = r[3] ? String(r[3]).trim() : ''; if (b) { if (!btsMap.has(b)) btsMap.set(b, []); btsMap.get(b).push(r); } });
    let battMon = 0, dcNoMon = 0, needBatt = 0, ipBbu = 0, ipOnly = 0, bbu5g = 0, bbu4g = 0;
    rows.forEach(r => {
      if (!Array.isArray(r)) return;
      const p = r[8] ? String(r[8]).trim().toLowerCase() : '', q = r[9] ? String(r[9]).trim().toUpperCase() : '';
      const yesP = (p === 'yes' || p === 'si' || p === 'sí'), noP = (p === 'no' || p === '');
      if (yesP && (q === '' || q.includes('NO RAD DATA'))) ipOnly++;
      if (yesP && q.startsWith('BBU')) ipBbu++;
      if (noP && q.includes('BBU 4G')) bbu4g++;
      if (noP && q.includes('BBU 5G')) bbu5g++;
    });
    btsMap.forEach(br => {
      if (br.some(r => r[10] && String(r[10]).trim() === 'Batt with mon.')) battMon++;
      if (br.some(r => r[7] && String(r[7]).toLowerCase().includes('without'))) dcNoMon++;
      if (br.some(r => r.some(c => c !== undefined && String(c).trim().toLowerCase() === 'need more batt.'))) needBatt++;
    });
    document.getElementById('kpi-total-bts').textContent = btsMap.size;
    document.getElementById('kpi-total-zones').textContent = new Set(rows.map(r => r && r[2] ? String(r[2]).trim() : '').filter(Boolean)).size;
    document.getElementById('kpi-total-olt').textContent = new Set(rows.map(r => r && r[4] ? String(r[4]).trim() : '').filter(Boolean)).size;
    document.getElementById('kpi-batt').textContent = battMon;
    document.getElementById('kpi-dc').textContent = dcNoMon;
    document.getElementById('kpi-need-batt').textContent = needBatt;
    document.getElementById('kpi-ip-bbu').textContent = ipBbu;
    document.getElementById('kpi-ip-only').textContent = ipOnly;
    document.getElementById('kpi-bbu5g').textContent = bbu5g;
    document.getElementById('kpi-bbu4g').textContent = bbu4g;
  }

  function renderRows(rows) {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    document.getElementById('record-count').textContent = `Mostrando ${rows.length} de ${allRows.length} sitios`;
    rows.forEach(r => {
      if (!Array.isArray(r)) return;
      const tr = document.createElement('tr');
      for (let idx = 1; idx < tableHeaders.length; idx++) {
        const td = document.createElement('td');
        const val = r[idx] !== undefined ? r[idx] : '', valStr = String(val).trim(), valLow = valStr.toLowerCase();
        if (['batt with mon.','dc with mon.','monitored','batt. ok','rectifier ok'].includes(valLow)) td.innerHTML = `<span class="badge badge-mon">${val}</span>`;
        else if (['batt without mon.','dc without mon.','not monitored','bts without batt','need more batt.','need more rectifier'].includes(valLow)) td.innerHTML = `<span class="badge badge-danger">${val}</span>`;
        else if (valLow === 'loss monitored') td.innerHTML = `<span class="badge badge-warn">${val}</span>`;
        else if (valStr.includes('BBU')) td.innerHTML = `<span class="badge bg-info text-dark">${val}</span>`;
        else if (valStr && (idx === 7 || idx === 10)) td.innerHTML = `<span class="badge bg-secondary">${val}</span>`;
        else td.textContent = val;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    });
  }

  function renderSummary(rows) {
    const headTr = document.getElementById('summaryHeadTr'), body = document.getElementById('summaryBody');
    if (!headTr || !body) return;
    const sel = Array.from(document.querySelectorAll('.status-checkbox:checked')).map(cb => cb.value.trim());
    const cols = sel.length ? sel : ['Total Registros'];
    headTr.innerHTML = '<th style="width:120px;">Branch</th>' + cols.map(c => `<th>${c}</th>`).join('');
    const bMap = new Map();
    rows.forEach(r => { const b = r && r[1] ? String(r[1]).trim() : ''; if (b) { if (!bMap.has(b)) bMap.set(b, []); bMap.get(b).push(r); } });
    const data = [];
    bMap.forEach((bRows, branch) => {
      let total = 0;
      const counts = cols.map(opt => {
        const cnt = opt === 'Total Registros' ? bRows.length : bRows.filter(r => r.some(c => c !== undefined && String(c).trim().toLowerCase() === opt.toLowerCase())).length;
        total += cnt; return cnt;
      });
      data.push({ branch, counts, total });
    });
    data.sort((a, b) => b.total - a.total);
    body.innerHTML = data.map(item => `<tr><td class="fw-bold text-start">${item.branch}</td>${item.counts.map(c => `<td>${c}</td>`).join('')}</tr>`).join('');
    renderBarChart(data.map(d => d.branch), data.map(d => d.total));
  }

  function renderBarChart(labels, values) {
    const ctx = document.getElementById('branchBarChart').getContext('2d');
    if (branchBarChart) branchBarChart.destroy();
    branchBarChart = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Quantity', data: values, backgroundColor: '#3b82f6', borderRadius: 4, maxBarThickness: 25 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, datalabels: { anchor: 'end', align: 'right', color: '#1e293b', font: { weight: 'bold', size: 11 }, formatter: v => v > 0 ? v : '' } }, scales: { x: { beginAtZero: true }, y: { grid: { display: false } } } },
      plugins: [ChartDataLabels]
    });
  }

  function filterTable() {
    const queries = document.getElementById('searchInput').value.toLowerCase().trim().split(/[\n,\s]+/).filter(Boolean);
    const branches = Array.from(document.querySelectorAll('.branch-checkbox:checked')).map(cb => cb.value.trim().toLowerCase());
    const statuses = Array.from(document.querySelectorAll('.status-checkbox:checked')).map(cb => cb.value.trim().toLowerCase());
    currentFilteredRows = allRows.filter(r => {
      if (!Array.isArray(r)) return false;
      const mBranch = !branches.length || branches.includes(String(r[1] || '').trim().toLowerCase());
      const mQuery = !queries.length || queries.some(q => r.some(c => String(c || '').toLowerCase().includes(q)));
      const mStatus = !statuses.length || statuses.every(st => r.some(c => String(c || '').trim().toLowerCase() === st));
      return mBranch && mQuery && mStatus;
    });
    updateKPIs(currentFilteredRows); renderRows(currentFilteredRows); renderSummary(currentFilteredRows);
  }

  function clearFilters() {
    document.getElementById('searchInput').value = '';
    document.querySelectorAll('.branch-checkbox, .status-checkbox').forEach(cb => cb.checked = false);
    updateBranchDropdownText(); updateDropdownButtonText(); filterTable();
  }

  function exportToCSV() {
    if (!currentFilteredRows.length) return;
    let csv = [tableHeaders.slice(1).map(h => `"${String(h).replace(/"/g, '""')}"`).join(',')];
    currentFilteredRows.forEach(r => csv.push(r.slice(1).map(c => `"${String(c || '').replace(/"/g, '""')}"`).join(',')));
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(['\uFEFF' + csv.join('\n')], { type: 'text/csv;charset=utf-8;' }));
    link.download = 'Dashboard_KPI_FBB.csv'; link.click();
  }

  function exportFullTablePNG() {
    const tc = document.getElementById('table-scroll-container'), mh = tc.style.maxHeight, ov = tc.style.overflowY;
    tc.style.maxHeight = 'none'; tc.style.overflowY = 'visible';
    html2canvas(document.getElementById('main-capture-area'), { scale: 2, scrollY: -window.scrollY }).then(canvas => {
      tc.style.maxHeight = mh; tc.style.overflowY = ov;
      const link = document.createElement('a'); link.download = 'Dashboard_KPI_FBB_Tabla_Completa.png'; link.href = canvas.toDataURL('image/png'); link.click();
    });
  }

  function exportSummaryCSV() {
    const tbl = document.getElementById('summaryTable'); if (!tbl) return;
    const csv = Array.from(tbl.rows).map(row => Array.from(row.cells).map(c => `"${c.innerText.replace(/"/g, '""')}"`).join(','));
    const link = document.createElement('a'); link.download = 'Resumen_Branch_Filtros.csv';
    link.href = URL.createObjectURL(new Blob(['\uFEFF' + csv.join('\n')], { type: 'text/csv;charset=utf-8;' })); link.click();
  }

  function exportSummaryPNG() {
    html2canvas(document.getElementById('exportable-summary'), { scale: 2 }).then(canvas => {
      const link = document.createElement('a'); link.download = 'Resumen_Branch_Grafico.png'; link.href = canvas.toDataURL('image/png'); link.click();
    });
  }

  // =========================================================
  // --- EXPORTAR PDF EJECUTIVO (historial OLT Down) ---
  // =========================================================
  const PdfReport = (() => {
    const C = { navy: [30, 41, 59], blue: [37, 99, 235], red: [220, 38, 38], text: [15, 23, 42], muted: [100, 116, 139], light: [241, 245, 249], line: [226, 232, 240], white: [255, 255, 255] };
    const QUESTIONS = [
      ['¿Qué pasó?', '- ¿Qué pasó\\?:'],
      ['¿Por qué pasó?', '- ¿Por qué pasó\\?:'],
      ['¿Por qué falló la protección?', '- ¿Por qué falló la protección\\?:'],
      ['Autonomía de batería', '- ¿Autonomía batería\\?:'],
      ['Acción tomada', '- ¿Qué acción se tomó\\?:'],
      ['Acción preventiva (para que no se repita)', '- ¿Qué se hará para que no se repita\\?:']
    ];
    // Helvetica de PDF no tiene emojis: se quitan para que no salgan símbolos raros.
    const clean = t => String(t ?? '').replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF–—‘’“”•]/g, '').replace(/[ \t]+\n/g, '\n').trim();
    const fmtD = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '-'); };
    const numFmt = n => Number(n || 0).toLocaleString('es-PE');

    function parseQA(text) {
      const t = String(text || '');
      const out = QUESTIONS.map(([label, start], i) => {
        const next = QUESTIONS[i + 1];
        const re = next ? new RegExp(start + '([\\s\\S]*?)(?=\\n' + next[1] + ')') : new RegExp(start + '([\\s\\S]*)$');
        const m = t.match(re);
        return [label, m ? clean(m[1]) : ''];
      });
      if (out.every(([, v]) => !v)) {
        const body = t.split('\n').filter(l => !/^Fecha del incidente|^\+/.test(l.trim())).join('\n');
        return [['Detalle', clean(body) || '-']];
      }
      return out.map(([l, v]) => [l, v || '-']);
    }

    // ---------- Imágenes en alta resolución ----------
    const blobToDataUrl = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
    const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src; });

    async function toJpegOrPng(dataUrl) {
      const img = await loadImg(dataUrl);
      const w = img.naturalWidth, h = img.naturalHeight;
      if (/^data:image\/(jpeg|jpg|png)/.test(dataUrl)) return { data: dataUrl, fmt: /png/.test(dataUrl.slice(0, 20)) ? 'PNG' : 'JPEG', w, h };
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0);
      return { data: c.toDataURL('image/jpeg', 0.95), fmt: 'JPEG', w, h };
    }

    async function fetchImage(src) {
      if (!src) return null;
      if (src.indexOf('data:image') === 0) return toJpegOrPng(src);
      const m = /[?&]id=([\w-]+)/.exec(src) || /\/file\/d\/([\w-]+)/.exec(src);
      const urls = m ? [`https://lh3.googleusercontent.com/d/${m[1]}=w2400`, `https://drive.google.com/thumbnail?id=${m[1]}&sz=w2400`] : [src];
      for (const url of urls) {
        try {
          const r = await fetch(url, { mode: 'cors', credentials: 'omit' });
          if (!r.ok) continue;
          const blob = await r.blob();
          if (!/^image\//.test(blob.type)) continue;
          return await toJpegOrPng(await blobToDataUrl(blob));
        } catch (e) { /* se prueba la siguiente fuente */ }
      }
      for (const url of urls) {   // último intento: dibujar la imagen en un canvas
        try {
          const img = await loadImg(url);
          const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          return { data: c.toDataURL('image/jpeg', 0.95), fmt: 'JPEG', w: c.width, h: c.height };
        } catch (e) {}
      }
      return null;
    }

    async function collageFor(rec) {
      if (rec.collage && rec.collage.length > 10) return rec.collage;
      if (rec.hasCollage) { try { return await callGAS('getWaCollageById', rec.id); } catch (e) { return null; } }
      return null;
    }

    // ---------- Ventana de opciones ----------
    function ensureModal() {
      if (document.getElementById('pdfOptModal')) return;
      document.body.insertAdjacentHTML('beforeend', `
      <div class="modal fade" id="pdfOptModal" tabindex="-1"><div class="modal-dialog modal-dialog-centered"><div class="modal-content">
        <div class="modal-header text-white" style="background:#1e293b"><h5 class="modal-title fw-bold">📄 Exportar reporte ejecutivo (PDF)</h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>
        <div class="modal-body">
          <div class="alert alert-light border small mb-3" id="pdfOptCount"></div>
          <label class="form-label fw-bold small mb-1">Orientación</label>
          <div class="d-flex gap-2 mb-3">
            <input type="radio" class="btn-check" name="pdfOrient" id="pdfOrientP" value="p" checked>
            <label class="btn btn-outline-primary flex-fill" for="pdfOrientP">▯ Vertical<br><small>Texto arriba, fotos abajo</small></label>
            <input type="radio" class="btn-check" name="pdfOrient" id="pdfOrientL" value="l">
            <label class="btn btn-outline-primary flex-fill" for="pdfOrientL">▭ Horizontal<br><small>Texto y fotos lado a lado</small></label>
          </div>
          <div class="form-check form-switch mb-2">
            <input class="form-check-input" type="checkbox" id="pdfWithImages" checked>
            <label class="form-check-label small" for="pdfWithImages">Incluir collages fotográficos en alta resolución</label>
          </div>
          <div id="pdfProgress" class="d-none mt-3">
            <div class="small mb-1" id="pdfProgressText">Preparando…</div>
            <div class="progress" style="height:8px"><div class="progress-bar progress-bar-striped progress-bar-animated" id="pdfProgressBar" style="width:0%"></div></div>
          </div>
        </div>
        <div class="modal-footer"><button class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
          <button class="btn btn-danger fw-bold" id="pdfGenerateBtn">Generar PDF</button></div>
      </div></div></div>`);
      document.getElementById('pdfGenerateBtn').addEventListener('click', generate);
    }

    function open() {
      const records = lastFilteredWa;
      if (!records.length) { alert('No hay registros para exportar con los filtros actuales.'); return; }
      ensureModal();
      const withImg = records.filter(r => r.hasCollage || (r.collage && r.collage.length > 10)).length;
      document.getElementById('pdfOptCount').innerHTML = `Se exportarán <b>${records.length}</b> incidentes (según los filtros aplicados), <b>${withImg}</b> con collage fotográfico.`;
      document.getElementById('pdfProgress').classList.add('d-none');
      document.getElementById('pdfGenerateBtn').disabled = false;
      bootstrap.Modal.getOrCreateInstance(document.getElementById('pdfOptModal')).show();
    }

    function progress(txt, pct) {
      document.getElementById('pdfProgress').classList.remove('d-none');
      document.getElementById('pdfProgressText').textContent = txt;
      document.getElementById('pdfProgressBar').style.width = pct + '%';
    }

    // ---------- Generación ----------
    async function generate() {
      const btn = document.getElementById('pdfGenerateBtn');
      btn.disabled = true;
      const orient = document.querySelector('input[name="pdfOrient"]:checked').value;
      const withImages = document.getElementById('pdfWithImages').checked;
      // Orden cronológico (más antiguo primero) para leer el reporte como una línea de tiempo.
      const records = [...lastFilteredWa].sort((a, b) => (a.date + String(a.id)).localeCompare(b.date + String(b.id)));
      try {
        const images = {};
        let failed = 0;
        if (withImages) {
          let i = 0;
          for (const rec of records) {
            i++;
            progress(`Descargando fotos en alta resolución ${i}/${records.length}…`, Math.round(i / records.length * 80));
            const src = await collageFor(rec);
            if (src) { images[rec.id] = await fetchImage(src); if (!images[rec.id]) { failed++; images[rec.id] = { link: src }; } }
          }
        }
        progress('Armando el PDF…', 90);
        await new Promise(r => setTimeout(r, 30));
        const doc = build(records, images, orient);
        const dates = records.map(r => r.date).filter(Boolean).sort();
        doc.save(`Reporte_OLT_Down_${dates[0] || ''}_al_${dates[dates.length - 1] || ''}.pdf`);
        progress(failed ? `PDF listo. ${failed} foto(s) no se pudieron incrustar; quedaron como enlace a Drive.` : 'PDF listo ✅', 100);
        if (!failed) setTimeout(() => bootstrap.Modal.getInstance(document.getElementById('pdfOptModal')).hide(), 900);
      } catch (e) {
        progress('Error: ' + e.message, 100);
      } finally { btn.disabled = false; }
    }

    function build(records, images, orient) {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: orient === 'l' ? 'landscape' : 'portrait', unit: 'mm', format: 'a4', compress: true });
      const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
      const M = 14, CW = W - 2 * M, BOTTOM = H - 16;
      const fill = c => doc.setFillColor(...c), color = c => doc.setTextColor(...c), draw = c => doc.setDrawColor(...c);
      const font = (style, size) => { doc.setFont('helvetica', style); doc.setFontSize(size); };

      const fStart = document.getElementById('filterWaStartDate').value, fEnd = document.getElementById('filterWaEndDate').value;
      const fBts = document.getElementById('filterWaBts').value.trim(), fBranch = document.getElementById('filterWaBranch').value.trim();
      const dates = records.map(r => r.date).filter(Boolean).sort();
      const period = `${fmtD(fStart || dates[0])} al ${fmtD(fEnd || dates[dates.length - 1])}`;
      const now = new Date();
      const stamp = `${fmtD(localDate(now))} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const user = (window.FBB && FBB.Auth.email) || '';

      const totalSubs = records.reduce((s, r) => s + num(r.subs), 0);
      const byBranch = {};
      records.forEach(r => { const b = r.branch || 'Sin branch'; byBranch[b] = byBranch[b] || { n: 0, subs: 0 }; byBranch[b].n++; byBranch[b].subs += num(r.subs); });
      const branches = Object.entries(byBranch).sort((a, b) => b[1].subs - a[1].subs);
      const byBts = {}; records.forEach(r => { byBts[r.bts] = (byBts[r.bts] || 0) + 1; });
      const recurrent = Object.entries(byBts).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);

      function pageHeader(subtitle) {
        fill(C.navy); doc.rect(0, 0, W, 13, 'F');
        color(C.white); font('bold', 9); doc.text('REPORTE DE INCIDENTES OLT DOWN', M, 8.3);
        font('normal', 8.5); doc.text(subtitle || `Periodo: ${period}`, W - M, 8.3, { align: 'right' });
      }

      // ===== PORTADA =====
      const bandH = orient === 'l' ? 60 : 66;
      fill(C.navy); doc.rect(0, 0, W, bandH, 'F');
      fill(C.blue); doc.rect(0, bandH, W, 1.6, 'F');
      color([147, 197, 253]); font('bold', 9); doc.text('FIXED BROADBAND  ·  M&E', M, 18);
      color(C.white); font('bold', orient === 'l' ? 24 : 26); doc.text('Reporte de Incidentes OLT Down', M, orient === 'l' ? 31 : 34);
      font('normal', 11); color([203, 213, 225]); doc.text('Detalle de caídas, causas raíz y acciones correctivas', M, orient === 'l' ? 40 : 44);
      font('normal', 9); color([203, 213, 225]);
      doc.text(`Periodo: ${period}`, M, bandH - 8);
      doc.text(`Generado: ${stamp}${user ? '  ·  ' + user : ''}`, W - M, bandH - 8, { align: 'right' });

      let y = bandH + 10;
      const filters = [fBts && `BTS: ${fBts}`, fBranch && `Branch: ${fBranch}`].filter(Boolean).join('  ·  ');
      if (filters) { color(C.muted); font('italic', 8.5); doc.text('Filtros aplicados: ' + filters, M, y); y += 6; }

      // Tarjetas KPI
      const kpis = [
        ['INCIDENTES', numFmt(records.length)],
        ['CLIENTES AFECTADOS', numFmt(totalSubs)],
        ['BRANCHES AFECTADOS', numFmt(branches.length)],
        ['PROMEDIO CLIENTES / INCIDENTE', numFmt(Math.round(totalSubs / Math.max(1, records.length)))]
      ];
      const gap = 4, kw = (CW - gap * 3) / 4, kh = 24;
      kpis.forEach(([label, val], i) => {
        const x = M + i * (kw + gap);
        fill(C.light); doc.roundedRect(x, y, kw, kh, 2, 2, 'F');
        fill(i === 1 ? C.red : C.blue); doc.rect(x, y, 1.4, kh, 'F');
        color(C.navy); font('bold', 18); doc.text(val, x + 6, y + 12);
        color(C.muted); font('bold', 7); doc.text(label, x + 6, y + 19);
      });
      y += kh + 10;

      // Resumen por branch (con barras)
      color(C.navy); font('bold', 12); doc.text('Impacto por Branch', M, y); y += 2;
      draw(C.line); doc.setLineWidth(0.3); doc.line(M, y + 1, W - M, y + 1); y += 6;
      const maxSubs = Math.max(1, ...branches.map(([, v]) => v.subs));
      const colB = M, colN = M + 32, colS = M + 58, barX = M + 88, barW = CW - 88 - 18;
      color(C.muted); font('bold', 7.5);
      doc.text('BRANCH', colB, y); doc.text('INCIDENTES', colN, y); doc.text('CLIENTES', colS, y); doc.text('% DEL TOTAL DE CLIENTES AFECTADOS', barX, y);
      y += 4;
      const maxRows = Math.max(3, Math.floor((BOTTOM - y - (recurrent.length ? 26 : 4)) / 6.5));
      const shown = branches.slice(0, maxRows);
      shown.forEach(([b, v], i) => {
        if (i % 2 === 0) { fill([248, 250, 252]); doc.rect(M, y - 1, CW, 6.5, 'F'); }
        color(C.text); font('bold', 9); doc.text(clean(b), colB, y + 3.6);
        font('normal', 9); doc.text(String(v.n), colN + 8, y + 3.6, { align: 'right' }); doc.text(numFmt(v.subs), colS + 12, y + 3.6, { align: 'right' });
        fill(C.line); doc.roundedRect(barX, y + 0.8, barW, 3.4, 1, 1, 'F');
        fill(C.blue); doc.roundedRect(barX, y + 0.8, Math.max(1, barW * v.subs / maxSubs), 3.4, 1, 1, 'F');
        color(C.muted); font('normal', 8); doc.text((v.subs / Math.max(1, totalSubs) * 100).toFixed(1) + '%', W - M, y + 3.6, { align: 'right' });
        y += 6.5;
      });
      if (branches.length > shown.length) { color(C.muted); font('italic', 8); doc.text(`+ ${branches.length - shown.length} branches más (ver índice).`, M, y + 3); y += 6; }

      if (recurrent.length) {
        y += 6; color(C.navy); font('bold', 12); doc.text('BTS con incidentes recurrentes', M, y); y += 2;
        draw(C.line); doc.line(M, y + 1, W - M, y + 1); y += 7;
        color(C.text); font('normal', 9);
        const txt = recurrent.slice(0, 12).map(([b, n]) => `${clean(b)} (${n})`).join('   ·   ');
        doc.text(doc.splitTextToSize(txt, CW), M, y);
      }

      // ===== ÍNDICE (las páginas se reservan y se llenan al final) =====
      const rowH = 7, idxTop = 34;
      const rowsPerPage = Math.floor((BOTTOM - idxTop) / rowH);
      const idxPages = Math.ceil(records.length / rowsPerPage);
      const idxPageStart = 2;
      for (let p = 0; p < idxPages; p++) doc.addPage();

      // ===== UNA PÁGINA POR INCIDENTE =====
      const pageOf = {};
      records.forEach((rec, idx) => {
        doc.addPage();
        pageOf[rec.id] = doc.internal.getNumberOfPages();
        pageHeader();
        let yy = 24;
        // Encabezado del incidente
        fill(C.red); doc.roundedRect(M, yy - 4.5, 34, 6.5, 1.5, 1.5, 'F');
        color(C.white); font('bold', 7.5); doc.text(`INCIDENTE ${idx + 1} DE ${records.length}`, M + 17, yy, { align: 'center' });
        color(C.navy); font('bold', 22); doc.text(clean(rec.bts || 'BTS').toUpperCase(), M, yy + 11);
        // Chips de datos
        const chips = [['FECHA', fmtD(rec.date)], ['BRANCH', clean(rec.branch) || '-'], ['CLIENTES AFECTADOS', numFmt(num(rec.subs))]];
        let cx = M; const cy = yy + 16;
        chips.forEach(([l, v]) => {
          font('bold', 6.5); const lw = doc.getTextWidth(l); font('bold', 10); const vw = doc.getTextWidth(v);
          const w = Math.max(lw, vw) + 8;
          fill(C.light); doc.roundedRect(cx, cy, w, 11, 1.5, 1.5, 'F');
          color(C.muted); font('bold', 6.5); doc.text(l, cx + 4, cy + 4.2);
          color(C.text); font('bold', 10); doc.text(v, cx + 4, cy + 9);
          cx += w + 3;
        });
        yy = cy + 17;

        const qa = parseQA(rec.text);
        const img = images[rec.id];
        const landscapeImg = orient === 'l' && img;
        const textW = landscapeImg ? CW * 0.44 : CW;
        const textX = M;

        // Bloques de preguntas y respuestas (con salto de página si no entran)
        const drawQA = (startY, width, onOverflow) => {
          let y2 = startY;
          qa.forEach(([label, val]) => {
            font('normal', 9.2);
            const lines = doc.splitTextToSize(val, width - 8);
            const h = 7 + lines.length * 4.1 + 3;
            if (y2 + h > BOTTOM) y2 = onOverflow();
            fill([248, 250, 252]); doc.roundedRect(textX, y2, width, h, 1.5, 1.5, 'F');
            fill(C.blue); doc.rect(textX, y2, 1.2, h, 'F');
            color(C.blue); font('bold', 7.5); doc.text(label.toUpperCase(), textX + 4.5, y2 + 5);
            color(C.text); font('normal', 9.2); doc.text(lines, textX + 4.5, y2 + 10);
            y2 += h + 2.5;
          });
          return y2;
        };
        const newContPage = () => { doc.addPage(); pageHeader(`${clean(rec.bts)} · continuación`); return 22; };
        yy = drawQA(yy, textW, newContPage);

        // Collage fotográfico
        if (img) {
          const placeImage = (x, y3, maxW, maxH) => {
            color(C.navy); font('bold', 10); doc.text('Evidencia fotográfica', x, y3); y3 += 3;
            if (img.link) {
              fill(C.light); doc.roundedRect(x, y3, maxW, 18, 2, 2, 'F');
              color(C.muted); font('normal', 9); doc.text('No se pudo incrustar la imagen. Ábrela en Drive:', x + 4, y3 + 7);
              color(C.blue); doc.textWithLink('Ver collage en Google Drive', x + 4, y3 + 13, { url: img.link });
              return;
            }
            const r = Math.min(maxW / img.w, (maxH - 3) / img.h);
            const w = img.w * r, h = img.h * r;
            const ix = x + (maxW - w) / 2;
            draw(C.line); doc.setLineWidth(0.3); doc.rect(ix - 0.6, y3 - 0.6, w + 1.2, h + 1.2);
            doc.addImage(img.data, img.fmt, ix, y3, w, h, 'img_' + rec.id, 'NONE');
          };
          if (landscapeImg && doc.internal.getNumberOfPages() === pageOf[rec.id]) {
            const ix = M + textW + 6;
            placeImage(ix, cy + 17 + 4, CW - textW - 6, BOTTOM - (cy + 21));
          } else {
            const minH = 70;
            if (BOTTOM - yy < minH) { yy = newContPage(); }
            placeImage(M, yy + 4, CW, BOTTOM - yy - 4);
          }
        }
      });

      // ===== Llenar el índice =====
      for (let p = 0; p < idxPages; p++) {
        doc.setPage(idxPageStart + p);
        pageHeader();
        color(C.navy); font('bold', 14); doc.text(p === 0 ? 'Índice de incidentes' : 'Índice de incidentes (cont.)', M, 24);
        let yy = idxTop - 4;
        const cols = orient === 'l'
          ? [['#', 8], ['FECHA', 24], ['BTS', 26], ['BRANCH', 20], ['CLIENTES', 22], ['¿QUÉ PASÓ?', CW - 8 - 24 - 26 - 20 - 22 - 14], ['PÁG.', 14]]
          : [['#', 8], ['FECHA', 22], ['BTS', 24], ['BRANCH', 18], ['CLIENTES', 20], ['¿QUÉ PASÓ?', CW - 8 - 22 - 24 - 18 - 20 - 12], ['PÁG.', 12]];
        fill(C.navy); doc.rect(M, yy - 4.6, CW, 6.6, 'F');
        color(C.white); font('bold', 7.5);
        let x = M; cols.forEach(([h, w]) => { doc.text(h, x + 2, yy); x += w; });
        yy += 2;
        records.slice(p * rowsPerPage, (p + 1) * rowsPerPage).forEach((rec, i) => {
          const n = p * rowsPerPage + i + 1;
          if (i % 2 === 0) { fill([248, 250, 252]); doc.rect(M, yy, CW, rowH, 'F'); }
          const what = parseQA(rec.text)[0][1];
          const cells = [String(n), fmtD(rec.date), clean(rec.bts), clean(rec.branch), numFmt(num(rec.subs)), what, String(pageOf[rec.id])];
          let cx = M;
          cells.forEach((v, ci) => {
            const w = cols[ci][1];
            font(ci === 2 ? 'bold' : 'normal', 8.5);
            color(ci === 6 ? C.blue : C.text);
            let t = v;
            if (doc.getTextWidth(t) > w - 4) { while (t.length > 1 && doc.getTextWidth(t + '…') > w - 4) t = t.slice(0, -1); t += '…'; }
            doc.text(t, cx + 2, yy + 4.8);
            cx += w;
          });
          doc.link(M, yy, CW, rowH, { pageNumber: pageOf[rec.id] });   // clic en la fila → va al incidente
          yy += rowH;
        });
      }

      // ===== Pie de página en todas las páginas =====
      const total = doc.internal.getNumberOfPages();
      for (let p = 1; p <= total; p++) {
        doc.setPage(p);
        draw(C.line); doc.setLineWidth(0.3); doc.line(M, H - 11, W - M, H - 11);
        color(C.muted); font('normal', 7.5);
        doc.text('Dashboard KPI FBB (M&E)  ·  Documento de uso interno', M, H - 6.5);
        doc.text(`Página ${p} de ${total}`, W - M, H - 6.5, { align: 'right' });
      }
      return doc;
    }

    return { open, _build: build, _parseQA: parseQA };
  })();
