// Web Worker: abre el KMZ/KML, arma el índice y lo comprime, sin congelar la página.
importScripts('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', 'kmz-index.js');

async function gzipB64(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

self.onmessage = async e => {
  const { file, tipo } = e.data;
  const say = (fase, p) => self.postMessage({ progreso: true, fase, p });
  try {
    say('Leyendo archivo…', 0);
    let text;
    if (/\.kmz$/i.test(file.name)) {
      const zip = await JSZip.loadAsync(file);
      const kmls = Object.keys(zip.files).filter(n => /\.kml$/i.test(n) && !zip.files[n].dir);
      if (!kmls.length) throw new Error('El KMZ no contiene ningún archivo .kml');
      kmls.sort((a, b) => (a === 'doc.kml' ? -1 : b === 'doc.kml' ? 1 : 0));
      say('Descomprimiendo…', 0.05);
      const parts = [];
      for (const n of kmls) parts.push(await zip.files[n].async('string'));
      text = parts.length === 1 ? parts[0] : '<kml><Document>' + parts.join('\n') + '</Document></kml>';
    } else {
      text = await file.text();
    }
    const idx = KmzIndex.indexKml(text, { tipo, archivo: file.name, progress: p => say('Analizando elementos…', 0.1 + p * 0.75) });
    text = null;
    say('Comprimiendo…', 0.9);
    const json = JSON.stringify(idx);
    const b64 = await gzipB64(json);
    self.postMessage({ ok: true, idx, b64, bytes: json.length });
  } catch (err) {
    self.postMessage({ ok: false, error: err.message || String(err) });
  }
};
