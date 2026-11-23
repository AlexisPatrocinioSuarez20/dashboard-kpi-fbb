#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Cortes programados  ->  KMZ  +  cruce con cobertura FTTH
=========================================================

Uso rápido (Windows: doble clic en EJECUTAR.bat):
    python cortes_ftth.py                       # modo preguntas
    python cortes_ftth.py --ftth cobertura.kmz  # usa los links de links.txt
    python cortes_ftth.py --links URL1 URL2 --ftth cobertura.kmz --dias 7 --fecha 2026-11-20

Empresas soportadas (se detectan por el link):
    - Hidrandina / Distriluz  aplicaciones.distriluz.com.pe/Apps/Visits/Home/CortesProgramados
    - SEAL (Arequipa)         www.seal.com.pe/clientes/SitePages/Cortes.aspx
    - Electro Sur Este        www.else.com.pe/else/interrupciones-programadas/?year=2026

Salida (carpeta "salida/<fecha_hora>/"):
    cortes_programados.kmz   todos los cortes, carpetas por fecha
    cruce_ftth.kmz           elementos FTTH afectados (±N días) + los cortes que los tocan
    reporte_cruce.xlsx       detalle del cruce, resumen por elemento FTTH y lista de cortes

La ubicación se obtiene de OpenStreetMap (Nominatim). Se guarda una caché en
"geocache.json" para que las siguientes corridas sean mucho más rápidas.
"""
import argparse, datetime as dt, html, io, json, math, os, re, sys, time, unicodedata, zipfile
import xml.etree.ElementTree as ET
from urllib.parse import urljoin, urlparse, quote, unquote
from xml.sax.saxutils import escape

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("Faltan librerías. Ejecuta primero:  pip install -r requirements.txt")
    sys.exit(1)

BASE = os.path.dirname(os.path.abspath(__file__))
TZ_LIMA = dt.timezone(dt.timedelta(hours=-5))

# ----------------------------------------------------------------------------------
# CONFIGURACIÓN (puedes cambiar estos valores)
# ----------------------------------------------------------------------------------
CONFIG = {
    # Nominatim pide un User-Agent con un contacto real. Pon tu correo aquí.
    "user_agent": "cortes-ftth/1.0 (contacto: %s)" % os.environ.get("NOMINATIM_EMAIL", "tu_correo@empresa.com"),
    "pausa_nominatim_s": 1.1,  # política de uso: máx. 1 consulta por segundo
    # Distancia de influencia (metros) según la precisión con que se ubicó el corte
    "radio_m": {
        "calle": 60,        # línea de la calle
        "area": 30,         # polígono de urbanización / sector
        "sector": 400,      # punto de un sector o urbanización
        "localidad": 700,   # caserío, centro poblado, anexo
        "distrito": 3000,   # solo se conoce el distrito
        "provincia": 12000, # solo se conoce la provincia (p. ej. avisos en imagen)
    },
    "max_km_desde_distrito": {"urbano": 12, "rural": 35},
    "radio_cluster_calles_km": 0.9,
    "area_max_poligono_km2": 8,  # polígonos más grandes que esto se ignoran (se usa punto)
}

MESES = {m: i + 1 for i, m in enumerate(
    "enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre".split())}
MESES["setiembre"] = 9
DIAS_ES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]


def log(*a):
    print(*a, flush=True)


def norm(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9ñ ]", " ", s)).strip()


def clean(s):
    return re.sub(r"\s+", " ", html.unescape(s or "")).strip(" \t\r\n.,;:*-–")


# ----------------------------------------------------------------------------------
# GEOMETRÍA (sin dependencias: proyección local en metros)
# ----------------------------------------------------------------------------------
def to_xy(lat, lon, lat0):
    return (lon * 111320.0 * math.cos(math.radians(lat0)), lat * 110574.0)


def km(a, b):
    lat0 = (a[0] + b[0]) / 2
    ax, ay = to_xy(a[0], a[1], lat0)
    bx, by = to_xy(b[0], b[1], lat0)
    return math.hypot(ax - bx, ay - by) / 1000.0


def _pseg(p, a, b):
    (px, py), (ax, ay), (bx, by) = p, a, b
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)


def _cross(o, a, b):
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])


def _seg_inter(a, b, c, d):
    d1, d2, d3, d4 = _cross(c, d, a), _cross(c, d, b), _cross(a, b, c), _cross(a, b, d)
    return (d1 * d2 < 0) and (d3 * d4 < 0)


def _segseg(a, b, c, d):
    if _seg_inter(a, b, c, d):
        return 0.0
    return min(_pseg(a, c, d), _pseg(b, c, d), _pseg(c, a, b), _pseg(d, a, b))


def _inside(p, ring):
    x, y = p
    ins = False
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-12) + x1:
            ins = not ins
    return ins


class Geom:
    """tipo: 'point' | 'line' | 'poly'. parts: lista de listas de (lat, lon)."""

    def __init__(self, tipo, parts):
        self.tipo, self.parts = tipo, [p for p in parts if p]
        pts = [q for p in self.parts for q in p]
        self.bbox = (min(q[0] for q in pts), min(q[1] for q in pts), max(q[0] for q in pts), max(q[1] for q in pts))

    def center(self):
        pts = [q for p in self.parts for q in p]
        return (sum(q[0] for q in pts) / len(pts), sum(q[1] for q in pts) / len(pts))

    def xy(self, lat0):
        return [[to_xy(a, b, lat0) for a, b in p] for p in self.parts]


def distancia_m(g1, g2):
    lat0 = (g1.bbox[0] + g1.bbox[2] + g2.bbox[0] + g2.bbox[2]) / 4
    A, B = g1.xy(lat0), g2.xy(lat0)
    if g1.tipo == "poly" and any(_inside(p, r) for r in A for part in B for p in part):
        return 0.0
    if g2.tipo == "poly" and any(_inside(p, r) for r in B for part in A for p in part):
        return 0.0

    def segs(parts, tipo):
        out = []
        for p in parts:
            if len(p) == 1:
                out.append((p[0], p[0]))
            else:
                out += [(p[i], p[i + 1]) for i in range(len(p) - 1)]
                if tipo == "poly":
                    out.append((p[-1], p[0]))
        return out

    best = float("inf")
    for a, b in segs(A, g1.tipo):
        for c, d in segs(B, g2.tipo):
            best = min(best, _segseg(a, b, c, d))
            if best == 0:
                return 0.0
    return best


def bbox_cerca(g1, g2, m):
    d = m / 111000.0 + 0.0005
    return not (g1.bbox[2] + d < g2.bbox[0] or g2.bbox[2] + d < g1.bbox[0] or
                g1.bbox[3] + d < g2.bbox[1] or g2.bbox[3] + d < g1.bbox[1])


def area_km2(ring):
    lat0 = sum(p[0] for p in ring) / len(ring)
    pts = [to_xy(a, b, lat0) for a, b in ring]
    s = sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))
    return abs(s) / 2 / 1e6


# ----------------------------------------------------------------------------------
# GEOCODIFICACIÓN (Nominatim + caché)
# ----------------------------------------------------------------------------------
class Geocoder:
    URL = "https://nominatim.openstreetmap.org/search"

    def __init__(self, path=os.path.join(BASE, "geocache.json")):
        self.path = path
        try:
            self.cache = json.load(open(path, encoding="utf-8"))
        except Exception:
            self.cache = {}
        self.s = requests.Session()
        self.s.headers["User-Agent"] = CONFIG["user_agent"]
        self.last = 0
        self.n_red = 0

    def save(self):
        json.dump(self.cache, open(self.path, "w", encoding="utf-8"), ensure_ascii=False)

    def search(self, q, limit=1):
        key = f"{limit}|{q}"
        if key in self.cache:
            return self.cache[key]
        wait = CONFIG["pausa_nominatim_s"] - (time.time() - self.last)
        if wait > 0:
            time.sleep(wait)
        params = dict(q=q, format="jsonv2", countrycodes="pe", limit=limit, polygon_geojson=1,
                      polygon_threshold=0.00005, **{"accept-language": "es"}, dedupe=0 if limit > 1 else 1)
        res = []
        for intento in range(3):
            try:
                r = self.s.get(self.URL, params=params, timeout=30)
                self.last = time.time()
                if r.status_code == 200:
                    res = [dict(lat=float(x["lat"]), lon=float(x["lon"]), cls=x.get("category", x.get("class")),
                                typ=x.get("type"), name=x.get("name") or "", disp=x.get("display_name", ""),
                                g=x.get("geojson")) for x in r.json()]
                    break
                time.sleep(3 * (intento + 1))
            except requests.RequestException:
                time.sleep(3 * (intento + 1))
        self.cache[key] = res
        self.n_red += 1
        if self.n_red % 20 == 0:
            self.save()
        return res


def geojson_parts(g):
    if not g:
        return None, []
    t, c = g.get("type"), g.get("coordinates")
    if t == "Point":
        return "point", [[(c[1], c[0])]]
    if t == "LineString":
        return "line", [[(p[1], p[0]) for p in c]]
    if t == "MultiLineString":
        return "line", [[(p[1], p[0]) for p in l] for l in c]
    if t == "Polygon":
        return "poly", [[(p[1], p[0]) for p in c[0]]]
    if t == "MultiPolygon":
        return "poly", [[(p[1], p[0]) for p in poly[0]] for poly in c]
    return None, []


# ----------------------------------------------------------------------------------
# MODELO
# ----------------------------------------------------------------------------------
class Corte:
    def __init__(self, empresa, region, distrito, fechas, hora, texto, fuente, titulo="", estado="PROGRAMADO",
                 provincia="", contexto_extra=""):
        self.empresa, self.region, self.distrito, self.provincia = empresa, region, distrito, provincia
        self.fechas = fechas  # lista de datetime.date
        self.hora, self.texto, self.fuente, self.titulo, self.estado = hora, texto, fuente, titulo, estado
        self.contexto_extra = contexto_extra
        self.grupos = []      # [(sector, [calles], [localidades])]
        self.features = []    # dicts: nombre, geom(Geom), precision, aprox(bool)
        self.id = ""

    def resumen(self, n=60):
        t = self.titulo or re.split(r"[:\n/]", self.texto.strip(" *"))[0]
        t = clean(t)
        return t if len(t) <= n else t[: n - 1] + "…"


# ----------------------------------------------------------------------------------
# LECTORES POR EMPRESA
# ----------------------------------------------------------------------------------
def http_get(url, **kw):
    h = {"User-Agent": "Mozilla/5.0 (cortes-ftth)", "Accept-Language": "es-PE,es"}
    h.update(kw.pop("headers", {}))
    r = requests.get(url, headers=h, timeout=60, **kw)
    r.raise_for_status()
    return r


RE_FECHA = re.compile(r"(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{4})")
RE_HORA = re.compile(r"(\d{1,2}:\d{2}\s*(?:[ap]\.?\s?m\.?)?)\s*(?:a|-|al|hasta)\s*(\d{1,2}:\d{2}\s*(?:[ap]\.?\s?m\.?|hrs?\.?)?)", re.I)


def tabla_grid(table):
    """Expande rowspan/colspan de una tabla HTML -> lista de filas (lista de celdas)."""
    grid, spans = [], {}
    for tr in table.find_all("tr", recursive=False) or table.select("tr"):
        if tr.find_parent("table") is not table:
            continue
        row, col = [], 0
        cells = tr.find_all(["td", "th"], recursive=False)
        it = iter(cells)
        while True:
            if col in spans and spans[col][0] > 0:
                row.append(spans[col][1])
                spans[col][0] -= 1
                col += 1
                continue
            c = next(it, None)
            if c is None:
                break
            txt = c.get_text("\n")
            rs, cs = int(c.get("rowspan", 1) or 1), int(c.get("colspan", 1) or 1)
            for k in range(cs):
                row.append(txt)
                if rs > 1:
                    spans[col] = [rs - 1, txt]
                col += 1
        while col in spans and spans[col][0] > 0:
            row.append(spans[col][1]); spans[col][0] -= 1; col += 1
        grid.append(row)
    return grid


def leer_distriluz(url):
    txt = http_get(url).text
    soup = BeautifulSoup(txt, "lxml")
    low = txt.lower()
    empresa = next((e for e in ("Hidrandina", "Electronoroeste", "Electronorte", "Electrocentro") if e.lower() in low), "Distriluz")
    # nombre de cada pestaña (región)
    tabs = {}
    for a in soup.select("a[href^='#'], button[data-bs-target], a[data-bs-target]"):
        tgt = (a.get("data-bs-target") or a.get("href") or "").lstrip("#")
        if tgt and a.get_text(strip=True):
            tabs[tgt] = a.get_text(" ", strip=True)
    cortes = []
    for t in soup.find_all("table"):
        if t.find("table"):  # solo tablas más internas
            continue
        cont = t.find_parent(id=True)
        cid = cont.get("id") if cont else ""
        region = tabs.get(cid, cid.replace("pills-", "").upper())
        region = {"LIB": "La Libertad", "ANC": "Áncash", "CAJ": "Cajamarca"}.get(region, region)
        for row in tabla_grid(t):
            row = [c.strip() for c in row]
            if len(row) < 3 or not RE_FECHA.search(row[0]):
                continue
            m = RE_FECHA.search(row[0])
            fecha = dt.date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
            hm = RE_HORA.search(row[0].replace("\n", " "))
            hora = f"{hm.group(1)} a {hm.group(2)}" if hm else clean(row[0][m.end():])
            dist_parts = [clean(p) for p in re.split(r"[/\n]", row[1]) if clean(p)]
            texto = row[2] if len(row) == 3 else "\n".join(row[2:])
            c = Corte(empresa, region, dist_parts[0] if dist_parts else "", [fecha], clean(hora), texto.strip(), url,
                      provincia=", ".join(dist_parts[1:]))
            cortes.append(c)
    return cortes


def leer_seal(url, desde, hasta):
    api = "https://www.seal.com.pe/clientes/_api/web/lists/getbytitle('Calendario')/items"
    params = {"$top": "400", "$orderby": "ID desc", "$select": "Id,Title,EventDate,EndDate,Location,Description"}
    r = http_get(api, params=params, headers={"Accept": "application/json;odata=nometadata"})
    cortes = []
    for it in r.json().get("value", []):
        try:
            ini = dt.datetime.fromisoformat(it["EventDate"].replace("Z", "+00:00")).astimezone(TZ_LIMA)
            fin = dt.datetime.fromisoformat(it["EndDate"].replace("Z", "+00:00")).astimezone(TZ_LIMA)
        except Exception:
            continue
        if fin.date() < desde or ini.date() > hasta:
            continue
        desc = html.unescape(BeautifulSoup(it.get("Description") or "", "lxml").get_text("\n"))
        desc = html.unescape(desc)
        hora = re.search(r"Hora\s*:\s*([^\n]+)", desc)
        circ = re.search(r"Circuito\s*:\s*([^\n]+)", desc)
        motivo = re.search(r"Motivo\s*:\s*([^\n]+)", desc)
        zonas = re.search(r"Zonas afectadas\s*:\s*(.*?)(?:Subestaciones el[eé]ctricas|$)", desc, re.S | re.I)
        zt = zonas.group(1) if zonas else desc
        fechas = [ini.date() + dt.timedelta(days=i) for i in range((fin.date() - ini.date()).days + 1)]
        estado = "SUSPENDIDO" if "SUSPEND" in (it.get("Title") or "").upper() else "PROGRAMADO"
        titulo = clean(it.get("Title"))
        if circ:
            titulo += " – " + clean(circ.group(1))
        partes = re.split(r"del distrito de\s+", zt, flags=re.I)
        found = False
        for p in partes[1:]:
            if ":" not in p:
                continue
            d, rest = p.split(":", 1)
            rest = re.sub(r"\.\s*[A-ZÁÉÍÓÚ][^.]*$", "", rest.strip())
            c = Corte("SEAL", "Arequipa", clean(d).title(), fechas,
                      clean(hora.group(1)) if hora else ini.strftime("%H:%M"), rest.strip(),
                      url, titulo=titulo, estado=estado,
                      contexto_extra=("Motivo: " + clean(motivo.group(1))) if motivo else "")
            c.modo = "localidades"
            cortes.append(c)
            found = True
        if not found:
            c = Corte("SEAL", "Arequipa", clean(it.get("Location") or ""), fechas,
                      clean(hora.group(1)) if hora else "", zt.strip(), url, titulo=titulo, estado=estado)
            c.modo = "localidades"
            cortes.append(c)
    return cortes


def _fechas_titulo(t, anio_def):
    t = norm(t)
    out = []
    m = re.search(r"del (\d{1,2}) al (\d{1,2}) de ([a-z]+)(?: de (\d{4}))?", t)
    if m and m.group(3) in MESES:
        y = int(m.group(4) or anio_def)
        for d in range(int(m.group(1)), int(m.group(2)) + 1):
            out.append(dt.date(y, MESES[m.group(3)], d))
        return out
    for m in re.finditer(r"(\d{1,2})(?: y (\d{1,2}))? de ([a-z]+)(?: de(?:l)? (\d{4}))?", t):
        if m.group(3) in MESES:
            y = int(m.group(4) or anio_def)
            out.append(dt.date(y, MESES[m.group(3)], int(m.group(1))))
            if m.group(2):
                out.append(dt.date(y, MESES[m.group(3)], int(m.group(2))))
    return sorted(set(out))


def ocr_imagen(url):
    try:
        import pytesseract
        from PIL import Image
    except ImportError:
        return None
    try:
        img = Image.open(io.BytesIO(http_get(url).content))
        return pytesseract.image_to_string(img, lang="spa")
    except Exception as e:
        log("   (OCR no disponible:", str(e)[:80], ")")
        return None


def leer_else(url, desde, hasta):
    # el listado es por año: siempre usar el año actual
    url = re.sub(r"year=\d{4}", "year=%d" % dt.datetime.now(TZ_LIMA).year, url)
    anio = int(re.search(r"year=(\d{4})", url).group(1)) if "year=" in url else desde.year
    paginas, links, vistos = [url], [], set()
    while paginas and len(vistos) < 3:
        u = paginas.pop(0)
        if u in vistos:
            continue
        vistos.add(u)
        soup = BeautifulSoup(http_get(u).text, "lxml")
        for a in soup.select("a[href*='/publicaciones/']"):
            h = urljoin(u, a["href"])
            if not re.search(r"/publicaciones/\d{4}/", h):
                continue
            txt = a.get_text(" ", strip=True)
            prev = next((i for i, (l, _) in enumerate(links) if l == h), None)
            if prev is None:
                links.append((h, txt))
            elif txt and not links[prev][1]:
                links[prev] = (h, txt)
        for a in soup.select("a[href*='page=']"):
            paginas.append(urljoin(u, a["href"]))
    cortes = []
    for h, txt in links:
        slug = unquote(h.rstrip("/").split("/")[-1]).replace("-", " ")
        fechas = _fechas_titulo(txt or slug, anio) or _fechas_titulo(slug, anio)
        if not fechas or max(fechas) < desde or min(fechas) > hasta:
            continue
        try:
            soup = BeautifulSoup(http_get(h).text, "lxml")
        except Exception as e:
            log("   no se pudo abrir", h, e)
            continue
        h1 = soup.find(["h1", "h2"])
        titulo = clean(h1.get_text(" ")) if h1 else clean(txt or slug)
        provs = titulo.split(" - ")[-1] if " - " in titulo else ""
        provs = [clean(p).title() for p in re.split(r",| Y ", provs.upper()) if clean(p)]
        body = soup.get_text(" ")
        region = "Cusco"
        for r_ in ("Apurimac", "Apurímac", "Madre de dios", "Madre de Dios"):
            if re.search(r"\b20\d\d\s+" + r_, body):
                region = r_.replace("Apurimac", "Apurímac").title().replace("De", "de")
        img = None
        for im in soup.find_all("img"):
            s = im.get("data-src") or im.get("src") or ""
            if "/media/" in s and not re.search(r"logo|icon|whatsapp|electro-?fono|denuncias", s, re.I):
                img = urljoin(h, s.split("?")[0])
                break
        texto = ""
        if img:
            ocr = ocr_imagen(img)
            if ocr:
                m = re.search(r"Zonas\s+afectadas\s*:?(.*?)(Electro\s+Sur\s+Este,?\s+invoca|$)", ocr, re.S | re.I)
                texto = clean((m.group(1) if m else ocr)).replace("\n", " ")
        hora = ""
        hm = re.search(r"(\d{1,2}:\d{2})\s*a\s*(\d{1,2}:\d{2})", texto)
        if hm:
            hora = f"{hm.group(1)} a {hm.group(2)}"
        c = Corte("Electro Sur Este", region, "", fechas, hora or "ver imagen", texto or
                  "Detalle de zonas solo en la imagen del comunicado: " + (img or h), h, titulo=titulo,
                  provincia=", ".join(provs))
        c.modo = "else"
        c.provincias = provs
        c.imagen = img
        cortes.append(c)
    return cortes


def leer_link(url, desde, hasta):
    host = urlparse(url).netloc.lower()
    if "distriluz" in host or "hidrandina" in host:
        return leer_distriluz(url)
    if "seal.com.pe" in host:
        return leer_seal(url, desde, hasta)
    if "else.com.pe" in host:
        return leer_else(url, desde, hasta)
    raise ValueError("Empresa no reconocida (todavía no hay lector para este sitio): " + host)


# ----------------------------------------------------------------------------------
# INTERPRETAR EL TEXTO DE ZONAS AFECTADAS
# ----------------------------------------------------------------------------------
PREF_CALLE = r"(?:Av(?:enida)?|Ca(?:lle)?|Jr|Jir[oó]n|Pj(?:e|s)?|Psje|Pasaje|Prol(?:ongaci[oó]n)?|Malec[oó]n|Carretera|Carr|Alameda|Ovalo|[OÓ]valo)"
RE_CALLE = re.compile(r"(?<![\wÁÉÍÓÚáéíóú])(" + PREF_CALLE + r")(?:\.|,)?\s+(?!N[º°o]\b)"
                      r"([A-ZÁÉÍÓÚÑ0-9][^;,/\n()–]*?)(?=\s+(?:cdas?\b|cdras?\b|cuadras?\b|N[º°]|No\.|Nro\b|Mzs?a?\b|Lote|U\.?\s?C\b|con\b|s/n\b|-|y\s+(?:Av|Ca|Jr|Pj)\b|Km\b)|\s*[;,/\n()–]|\.\s|\.$|$)",
                      re.I)
PREF_SECTOR = (r"(?:A\.?\s?A\.?\s?H\.?\s?H\.?|AA\.?\s?HH\.?|A\.\s?H\.?|Asentamiento Humano|Urb(?:anizaci[oó]n)?\.?|"
               r"P\.?\s?P\.?\s?J\.?\s?J\.?|Pueblo Joven|Sectores?|C\.?\s?P\.?\s?M\.?|C\.\s?P\.|Centro Poblado(?: Menor)?|"
               r"Caser[ií]o:?|AA\.?\s?VV\.?|Asociaci[oó]n|Barrio|Cooperativa|Comunidad(?: Campesina)?|HUP|Habilitaci[oó]n Urbana|Villa)")
RE_SECTOR = re.compile(r"(?<![\wÁÉÍÓÚáéíóú])(" + PREF_SECTOR + r")\s*:?\s+([A-ZÁÉÍÓÚÑ0-9][^;:,/\n()–]*?)(?=\s*(?::|;|,|/|\n|\(|–|-\s|\.\s|\.$|$|Mz\b))", re.I)
BASURA = re.compile(r"^(mz|mza|mzas|lote|lt|u\.?c|uc|n[º°o]|sector \d.*|\d+|[a-z]\d*|s/?n|cda.*|cdra.*|y otros|entre otros|anexos?|"
                    r"[ivx]+ etapa|etapa.*|[ivx]+|calle \d+|no \d+.*|n[º°o]\.?\s.*|n[º°].*|u\.?\s?c\.?.*|lote.*|mz.*|[a-z]-?\d+|r\.?m\.?.*|cm\..*|s/?n.*)$", re.I)


def _limpia_nombre(n):
    n = re.sub(r"\b(cdas?|cdras?|cuadras?)\b.*$", "", n, flags=re.I)
    n = re.sub(r"\s+(N[º°]|No\.|Nro\b|Lote|U\.?C\b|\d{3,}).*$", "", n, flags=re.I)
    n = re.sub(r"\b(y anexos|y otros|entre otros|y sus comunidades.*|del distrito.*|de la provincia.*)$", "", n, flags=re.I)
    n = re.sub(r"\b(etapa|I+|IV|V)\b\.?$", lambda m: m.group(0), n)
    return clean(n).strip("()")


def interpretar(c):
    """Llena c.grupos = [(sector, calles, localidades)]."""
    modo = getattr(c, "modo", "auto")
    texto = c.texto.replace("\r", "")
    grupos = []
    if modo in ("localidades",):
        locs = [_limpia_nombre(x) for x in re.split(r",|;|\by\b|\n", texto)]
        grupos.append((None, [], [l for l in locs if len(l) > 2 and not BASURA.match(l)]))
        c.grupos = grupos
        return
    if modo == "else":
        locs = []
        if not texto.startswith("Detalle de zonas solo"):
            t = re.sub(r"\bde la provincia de [^;.,]+", "", texto, flags=re.I)
            t = re.sub(r"\bDistritos? de\b", "", t, flags=re.I)
            t = re.sub(r"\(.*?\)", "", t)
            locs = [_limpia_nombre(x) for x in re.split(r",|;|\by\b", t)]
            locs = [l for l in locs if 2 < len(l) < 40 and not re.search(r"clientes|antenas|comunidades|otros", l, re.I)]
        c.grupos = [(None, [], locs)]
        return
    actual = [None, [], []]
    lineas = re.split(r"\n+", texto)
    for ln in lineas:
        ln = ln.strip()
        if not ln:
            continue
        # ¿la línea abre un sector?  "A.A.H.H. La Verónica:"  /  "*Sector Común de Chacras: Mzas A, C."
        msec = re.match(r"^\*?\s*(" + PREF_SECTOR + r")\s*\.?\s*([^:]{2,80}):\s*(.*)$", ln, re.I)
        if msec or re.match(r"^\*?\s*([^:]{3,60}):\s*(.*)$", ln) and not RE_CALLE.match(ln.strip("* ")):
            if actual[0] or actual[1] or actual[2]:
                grupos.append(tuple(actual))
            if msec:
                nombre = clean(msec.group(1) + " " + msec.group(2))
                ln = msec.group(3)
            else:
                m2 = re.match(r"^\*?\s*([^:]{3,60}):\s*(.*)$", ln)
                nombre, ln = clean(m2.group(1)), m2.group(2)
            actual = [nombre, [], []]
        calles, sectores, resto = [], [], ln
        for m in RE_CALLE.finditer(ln):
            n = _limpia_nombre(m.group(2))
            if re.match(r"(?i)(malec|carr|prol|alameda|[oó]valo)", m.group(1)) or len(n.split()) == 1 and len(n) < 6:
                n = clean(m.group(1)) + " " + n
            if n and not re.fullmatch(r"[\d\s]+", n):
                calles.append(n)
            resto = resto.replace(m.group(0), " ; ", 1)
        for m in RE_SECTOR.finditer(resto):
            pref, nom = m.group(1), m.group(2)
            nom = re.split(r"\s+del\s+(?:C\.?\s?P|Centro|distrito)", nom, flags=re.I)[0]
            partes = re.split(r"\s+y\s+|,", nom) if re.match(r"(?i)sectores", pref) else [nom]
            for x in partes:
                x = clean(("Sector " if re.match(r"(?i)sectores", pref) else pref + " ") + x)
                if not re.match(r"(?i)sector(es)? \d", x):
                    sectores.append(x)
            resto = resto.replace(m.group(0), " ; ", 1)
        actual[1] += [x for x in calles if x not in actual[1]]
        for s_ in sectores:
            if not actual[0]:
                actual[0] = s_
            elif norm(s_) != norm(actual[0]) and s_ not in actual[2]:
                actual[2].append(s_)
        resto = re.sub(r"\b(Mzs?a?s?)\b[^;]*", " ", resto, flags=re.I)
        resto = re.sub(r"\bS/N\b", " ", resto, flags=re.I)
        for x in re.split(r",|;|/|\s+y\s+", resto):
            x = _limpia_nombre(x)
            if len(x) > 2 and not BASURA.match(x) and not re.search(r"\d{3,}", x) and x not in actual[2]:
                actual[2].append(x)
    if actual[0] or actual[1] or actual[2]:
        grupos.append(tuple(actual))
    c.grupos = grupos


# ----------------------------------------------------------------------------------
# UBICAR CADA CORTE
# ----------------------------------------------------------------------------------
def _ctx(c):
    parts = [c.distrito] + [p for p in re.split(r",\s*", c.provincia or "") if p] + [c.region, "Peru"]
    return ", ".join(p for p in parts if p)


def _sin_prefijo(s):
    return clean(re.sub(r"^" + PREF_SECTOR + r"\s*\.?\s*", "", s, flags=re.I)) or s


def _median(v):
    s = sorted(v)
    return s[len(s) // 2]


class Ubicador:
    def __init__(self, geo):
        self.geo = geo
        self.distritos = {}

    def centro_distrito(self, c):
        k = (c.distrito, c.provincia, c.region)
        if k in self.distritos:
            return self.distritos[k]
        res = None
        qs = [_ctx(c)] if c.distrito else []
        if c.provincia:
            qs.append(", ".join([c.provincia, c.region, "Peru"]))
        qs.append(c.region + ", Peru")
        for q in qs:
            r = self.geo.search(q)
            if r:
                res = (r[0]["lat"], r[0]["lon"], "distrito" if q == qs[0] and c.distrito else "provincia")
                break
        self.distritos[k] = res
        return res

    def punto(self, nombre, c, centro, max_km, precision):
        qs = []
        for n in (nombre, _sin_prefijo(nombre)):
            q = f"{n}, {_ctx(c)}"
            if q not in qs:
                qs.append(q)
        for q in qs:
            for r in self.geo.search(q):
                if r["cls"] == "boundary" and precision != "localidad":
                    continue
                if centro and km((r["lat"], r["lon"]), centro[:2]) > max_km:
                    continue
                tipo, parts = geojson_parts(r.get("g"))
                if (tipo == "poly" and precision == "sector" and r["cls"] in ("landuse", "place")
                        and area_km2(parts[0]) <= CONFIG["area_max_poligono_km2"]):
                    return dict(nombre=nombre, geom=Geom("poly", parts), precision="area", aprox=False)
                return dict(nombre=nombre, geom=Geom("point", [[(r["lat"], r["lon"])]]), precision=precision, aprox=False)
        return None

    def calles(self, nombres, c, ancla, centro, R):
        cand = []
        for n in nombres:
            for r in self.geo.search(f"{n}, {_ctx(c)}", limit=12):
                if r["cls"] != "highway":
                    continue
                core = [w for w in norm(n).split() if len(w) > 2 and w not in ("del", "los", "las", "san", "santa")]
                if core and not any(w in norm(r["name"] or r["disp"]) for w in core):
                    continue
                tipo, parts = geojson_parts(r.get("g"))
                if tipo != "line":
                    continue
                g = Geom("line", parts)
                if centro and km(g.center(), centro[:2]) > CONFIG["max_km_desde_distrito"]["urbano"]:
                    continue
                cand.append((n, g))
        if not cand:
            return [], ancla
        if not ancla:
            ancla = (_median([g.center()[0] for _, g in cand]), _median([g.center()[1] for _, g in cand]))
            for _ in range(3):
                k = [g for _, g in cand if km(g.center(), ancla) < R * 1.5]
                if k:
                    ancla = (_median([g.center()[0] for g in k]), _median([g.center()[1] for g in k]))
        por = {}
        for n, g in cand:
            if km(g.center(), ancla) < R:
                por.setdefault(n, []).extend(g.parts)
        feats = [dict(nombre=n, geom=Geom("line", p), precision="calle", aprox=False) for n, p in por.items()]
        return feats, ancla

    def ubicar(self, c):
        centro = self.centro_distrito(c)
        rural = getattr(c, "modo", "") in ("localidades", "else") or not any(g[1] for g in c.grupos)
        max_km = CONFIG["max_km_desde_distrito"]["rural" if rural else "urbano"]
        feats = []
        if getattr(c, "modo", "") == "else" and not any(g[2] for g in c.grupos):
            for p in getattr(c, "provincias", []):
                r = None
                for reg in (c.region, "Cusco", "Apurímac", "Madre de Dios"):
                    rr = self.geo.search(f"Provincia de {p}, {reg}, Peru") or self.geo.search(f"{p}, {reg}, Peru")
                    if rr:
                        r = rr[0]
                        break
                if r:
                    feats.append(dict(nombre=f"Provincia {p}", geom=Geom("point", [[(r["lat"], r["lon"])]]),
                                      precision="provincia", aprox=True))
            c.features = feats
            return
        for sector, calles, locs in c.grupos:
            ancla, sfeat = None, None
            if sector:
                sfeat = self.punto(sector, c, centro, max_km, "sector")
                if sfeat:
                    ancla = sfeat["geom"].center()
                    feats.append(sfeat)
            if calles:
                R = CONFIG["radio_cluster_calles_km"] * (1.3 if ancla else 1.0)
                cf, a2 = self.calles(calles, c, ancla, centro, R)
                feats += cf
                if sector and not sfeat and cf:
                    feats.append(dict(nombre=sector, geom=Geom("point", [[a2]]), precision="sector", aprox=False,
                                      nota="ubicado por sus calles"))
            for l in locs:
                f = self.punto(l, c, centro, max_km, "sector" if re.match(PREF_SECTOR, l, re.I) else "localidad")
                if f:
                    feats.append(f)
        if not feats and centro:
            feats.append(dict(nombre=f"{c.distrito or c.provincia} (centro del {centro[2]})",
                              geom=Geom("point", [[centro[:2]]]), precision=centro[2], aprox=True))
        c.features = feats


# ----------------------------------------------------------------------------------
# LEER KMZ/KML FTTH
# ----------------------------------------------------------------------------------
def _coords(txt):
    out = []
    for t in (txt or "").split():
        p = t.split(",")
        if len(p) >= 2:
            try:
                out.append((float(p[1]), float(p[0])))
            except ValueError:
                pass
    return out


def leer_ftth(path):
    if path.lower().endswith(".kmz"):
        z = zipfile.ZipFile(path)
        kmls = [n for n in z.namelist() if n.lower().endswith(".kml")]
        datos = [z.read(n) for n in kmls]
    else:
        datos = [open(path, "rb").read()]
    elems = []

    def tag(e):
        return e.tag.split("}")[-1]

    def walk(e, carpeta):
        for ch in e:
            t = tag(ch)
            if t in ("Folder", "Document"):
                nm = next((x.text for x in ch if tag(x) == "name"), "") or ""
                walk(ch, carpeta + [nm.strip()] if t == "Folder" else carpeta)
            elif t == "Placemark":
                nombre = next((x.text for x in ch if tag(x) == "name"), "") or "(sin nombre)"
                desc = next((x.text for x in ch if tag(x) == "description"), "") or ""
                for g in ch.iter():
                    gt = tag(g)
                    if gt == "Polygon":
                        ob = [x for x in g.iter() if tag(x) == "outerBoundaryIs"]
                        rings = []
                        for o in ob:
                            for cc in o.iter():
                                if tag(cc) == "coordinates":
                                    rings.append(_coords(cc.text))
                        rings = [r for r in rings if len(r) >= 3]
                        if rings:
                            elems.append(dict(nombre=nombre.strip(), carpeta=" / ".join(x for x in carpeta if x),
                                              geom=Geom("poly", rings), desc=desc))
                    elif gt == "LineString":
                        cc = next((x for x in g if tag(x) == "coordinates"), None)
                        pts = _coords(cc.text if cc is not None else "")
                        if len(pts) >= 2:
                            elems.append(dict(nombre=nombre.strip(), carpeta=" / ".join(x for x in carpeta if x),
                                              geom=Geom("line", [pts]), desc=desc))
                    elif gt == "Point":
                        cc = next((x for x in g if tag(x) == "coordinates"), None)
                        pts = _coords(cc.text if cc is not None else "")
                        if pts:
                            elems.append(dict(nombre=nombre.strip(), carpeta=" / ".join(x for x in carpeta if x),
                                              geom=Geom("point", [pts[:1]]), desc=desc))

    for d in datos:
        walk(ET.fromstring(d), [])
    return elems


# ----------------------------------------------------------------------------------
# CRUCE
# ----------------------------------------------------------------------------------
TIPO_ES = {"point": "Punto", "line": "Línea", "poly": "Polígono"}
CONFIANZA = {"calle": "Alta", "area": "Alta", "sector": "Media", "localidad": "Media", "distrito": "Baja", "provincia": "Baja"}


def cruzar(cortes, ftth, ref, dias):
    filas = []
    for c in cortes:
        if c.estado == "SUSPENDIDO":
            continue
        ini, fin = min(c.fechas), max(c.fechas)
        dif = 0 if ini <= ref <= fin else ((ini - ref).days if ini > ref else (fin - ref).days)
        if abs(dif) > dias:
            continue
        for f in c.features:
            radio = CONFIG["radio_m"][f["precision"]]
            for e in ftth:
                if not bbox_cerca(f["geom"], e["geom"], radio):
                    continue
                d = distancia_m(f["geom"], e["geom"])
                if d <= radio:
                    filas.append(dict(corte=c, feat=f, elem=e, dist=round(d), dif=dif))
    return filas


def estado_txt(dif):
    return "HOY" if dif == 0 else (f"Próximo (en {dif} d)" if dif > 0 else f"Pasado (hace {-dif} d)")


# ----------------------------------------------------------------------------------
# SALIDAS
# ----------------------------------------------------------------------------------
COL_EMP = {"Hidrandina": "ff0000ff", "Distriluz": "ff0000ff", "SEAL": "ff00a5ff", "Electro Sur Este": "ffaa00ff"}
ICON_EMP = {"Hidrandina": "red", "Distriluz": "red", "SEAL": "orange", "Electro Sur Este": "purple"}


def _kml_coords(parts_one):
    return " ".join(f"{lon:.6f},{lat:.6f},0" for lat, lon in parts_one)


def _kml_geom(g):
    if g.tipo == "point":
        lat, lon = g.parts[0][0]
        return f"<Point><coordinates>{lon:.6f},{lat:.6f},0</coordinates></Point>"
    if g.tipo == "line":
        ls = "".join(f"<LineString><tessellate>1</tessellate><coordinates>{_kml_coords(p)}</coordinates></LineString>" for p in g.parts)
        return f"<MultiGeometry>{ls}</MultiGeometry>"
    ps = "".join(f"<Polygon><outerBoundaryIs><LinearRing><coordinates>{_kml_coords(p + p[:1])}</coordinates></LinearRing></outerBoundaryIs></Polygon>" for p in g.parts)
    return f"<MultiGeometry>{ps}</MultiGeometry>"


def _estilos():
    s = []
    for emp, col in ICON_EMP.items():
        k = norm(emp).replace(" ", "_")
        s.append(f'<Style id="pt_{k}"><IconStyle><Icon><href>http://maps.google.com/mapfiles/kml/paddle/{col}-circle.png</href></Icon></IconStyle><LabelStyle><scale>0.7</scale></LabelStyle></Style>')
        s.append(f'<Style id="ln_{k}"><LineStyle><color>{COL_EMP[emp]}</color><width>5</width></LineStyle></Style>')
        s.append(f'<Style id="pg_{k}"><LineStyle><color>{COL_EMP[emp]}</color><width>2</width></LineStyle><PolyStyle><color>55{COL_EMP[emp][2:]}</color></PolyStyle></Style>')
    s.append('<Style id="apx"><IconStyle><Icon><href>http://maps.google.com/mapfiles/kml/paddle/wht-circle.png</href></Icon></IconStyle><LabelStyle><scale>0.7</scale></LabelStyle></Style>')
    for k, col in (("prox", "ff0000ff"), ("pas", "ff00a5ff")):
        s.append(f'<Style id="f_{k}"><IconStyle><color>{col}</color><scale>1.2</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/caution.png</href></Icon></IconStyle>'
                 f'<LineStyle><color>{col}</color><width>4</width></LineStyle><PolyStyle><color>66{col[2:]}</color></PolyStyle></Style>')
    return "\n".join(s)


def _desc_corte(c):
    t = escape(c.texto).replace("\n", "<br>")
    extra = f"<br>{escape(c.contexto_extra)}" if c.contexto_extra else ""
    img = f'<br><a href="{escape(c.imagen)}">Ver comunicado (imagen)</a>' if getattr(c, "imagen", None) else ""
    fechas = ", ".join(f.strftime("%d/%m/%Y") for f in c.fechas)
    return (f"<b>{escape(c.empresa)}</b> · {escape(c.estado)}<br><b>Fecha:</b> {fechas}<br><b>Horario:</b> {escape(c.hora)}<br>"
            f"<b>Ubicación:</b> {escape(', '.join(x for x in [c.distrito, c.provincia, c.region] if x))}<br>"
            f"{('<b>' + escape(c.titulo) + '</b><br>') if c.titulo else ''}<b>Zonas afectadas:</b><br>{t}{extra}{img}"
            f'<br><br><i>Fuente: <a href="{escape(c.fuente)}">{escape(c.fuente)}</a>. Ubicación aproximada con OpenStreetMap; '
            "las líneas muestran la calle dentro del sector, no solo las cuadras indicadas.</i>")


def _placemark(nombre, desc, geom, estilo):
    return (f"<Placemark><name>{escape(nombre)}</name><description><![CDATA[{desc}]]></description>"
            f"<styleUrl>#{estilo}</styleUrl>{_kml_geom(geom)}</Placemark>")


def _folder_corte(c):
    k = norm(c.empresa).replace(" ", "_")
    nombre = f"{c.hora} · {c.empresa} · {c.distrito or c.provincia} · {c.resumen(50)}"
    if c.estado == "SUSPENDIDO":
        nombre = "[SUSPENDIDO] " + nombre
    out = [f"<Folder><name>{escape(nombre)}</name><description><![CDATA[{_desc_corte(c)}]]></description>"]
    for f in c.features:
        g = f["geom"]
        etiqueta = f["nombre"] + (" (aprox.)" if f["aprox"] else "")
        if g.tipo == "point":
            est = "apx" if f["aprox"] else f"pt_{k}"
        elif g.tipo == "line":
            est = f"ln_{k}"
        else:
            est = f"pg_{k}"
        out.append(_placemark(etiqueta, _desc_corte(c), g, est))
    out.append("</Folder>")
    return "\n".join(out)


def _kmz(path, nombre_doc, desc_doc, cuerpo):
    kml = ('<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document>'
           f"<name>{escape(nombre_doc)}</name><description><![CDATA[{desc_doc}]]></description>{_estilos()}\n{cuerpo}\n</Document></kml>")
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("doc.kml", kml)


def kmz_cortes(cortes, path, ref):
    porfecha = {}
    for c in cortes:
        for f in c.fechas:
            porfecha.setdefault(f, []).append(c)
    cuerpo = []
    for f in sorted(porfecha):
        tag = " (HOY)" if f == ref else (" (pasado)" if f < ref else "")
        cuerpo.append(f"<Folder><name>{f.isoformat()} – {DIAS_ES[f.weekday()]}{tag}</name><open>{1 if f == ref else 0}</open>")
        for c in sorted(porfecha[f], key=lambda c: (c.empresa, c.region, c.hora)):
            cuerpo.append(_folder_corte(c))
        cuerpo.append("</Folder>")
    _kmz(path, "Cortes programados", "Rojo = Hidrandina/Distriluz, naranja = SEAL, morado = Electro Sur Este. "
         "Pin blanco = ubicación aproximada (solo se encontró el distrito o la provincia).", "\n".join(cuerpo))


def kmz_cruce(filas, path, ref, dias):
    por_elem = {}
    for r in filas:
        por_elem.setdefault(id(r["elem"]), []).append(r)
    cuerpo = ['<Folder><name>Elementos FTTH afectados</name><open>1</open>']
    for rs in sorted(por_elem.values(), key=lambda rs: min(abs(r["dif"]) for r in rs)):
        e = rs[0]["elem"]
        prox = any(r["dif"] >= 0 for r in rs)
        lis = "".join(f"<li>{estado_txt(r['dif'])} · {', '.join(f.strftime('%d/%m') for f in r['corte'].fechas)} · "
                      f"{escape(r['corte'].hora)} · {escape(r['corte'].empresa)} · {escape(r['feat']['nombre'])} "
                      f"(confianza {CONFIANZA[r['feat']['precision']].lower()}, {r['dist']} m)</li>" for r in sorted(rs, key=lambda r: r["dif"]))
        desc = f"<b>{escape(e['nombre'])}</b><br>{escape(e['carpeta'])}<ul>{lis}</ul>"
        cuerpo.append(_placemark(f"{e['nombre']} – {len(rs)} corte(s)", desc, e["geom"], "f_prox" if prox else "f_pas"))
    cuerpo.append("</Folder>")
    cortes = []
    for r in filas:
        if r["corte"] not in cortes:
            cortes.append(r["corte"])
    cuerpo.append("<Folder><name>Cortes que tocan FTTH</name>")
    for c in sorted(cortes, key=lambda c: (min(c.fechas), c.hora)):
        cuerpo.append(_folder_corte(c))
    cuerpo.append("</Folder>")
    _kmz(path, f"Cruce FTTH vs cortes (±{dias} días desde {ref:%d/%m/%Y})",
         "Rojo = corte hoy o próximo; naranja = corte ya ocurrido dentro de la ventana.", "\n".join(cuerpo))


def excel(filas, cortes, ftth, path, ref, dias):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    wb = Workbook()
    hdr_fill = PatternFill("solid", fgColor="1F4E78")

    def hoja(ws, cab, datos, anchos):
        ws.append(cab)
        for c in ws[1]:
            c.font, c.fill = Font(bold=True, color="FFFFFF"), hdr_fill
            c.alignment = Alignment(vertical="center", wrap_text=True)
        for d in datos:
            ws.append(d)
        for i, w in enumerate(anchos, 1):
            ws.column_dimensions[ws.cell(1, i).column_letter].width = w
        ws.freeze_panes = "A2"
        if datos:
            ws.auto_filter.ref = ws.dimensions

    ws = wb.active
    ws.title = "Resumen FTTH"
    agg = {}
    for r in filas:
        a = agg.setdefault(id(r["elem"]), dict(e=r["elem"], n=set(), prox=None, pas=None, emp=set(), conf=set()))
        a["conf"].add(CONFIANZA[r["feat"]["precision"]])
        a["n"].add(id(r["corte"]))
        a["emp"].add(r["corte"].empresa)
        fut = [f for f in r["corte"].fechas if f >= ref]
        pas = [f for f in r["corte"].fechas if f < ref]
        if fut:
            a["prox"] = min([x for x in (a["prox"], min(fut)) if x])
        if pas:
            a["pas"] = max([x for x in (a["pas"], max(pas)) if x])
    datos = []
    for a in sorted(agg.values(), key=lambda a: (a["prox"] or dt.date(2100, 1, 1), a["e"]["nombre"])):
        datos.append([a["e"]["nombre"], TIPO_ES[a["e"]["geom"].tipo], a["e"]["carpeta"], len(a["n"]),
                      a["prox"].strftime("%d/%m/%Y") if a["prox"] else "", a["pas"].strftime("%d/%m/%Y") if a["pas"] else "",
                      ", ".join(sorted(a["emp"])), next(x for x in ("Alta", "Media", "Baja") if x in a["conf"])])
    hoja(ws, ["Elemento FTTH", "Tipo", "Carpeta", "N° cortes", "Próximo corte", "Último corte (pasado)", "Empresa(s)",
              "Mejor confianza"], datos, [34, 10, 30, 10, 14, 18, 22, 14])

    ws = wb.create_sheet("Cruce detalle")
    datos = []
    orden_conf = {"Alta": 0, "Media": 1, "Baja": 2}
    for r in sorted(filas, key=lambda r: (r["dif"] < 0, abs(r["dif"]), orden_conf[CONFIANZA[r["feat"]["precision"]]], r["elem"]["nombre"])):
        c, f, e = r["corte"], r["feat"], r["elem"]
        datos.append([estado_txt(r["dif"]), ", ".join(x.strftime("%d/%m/%Y") for x in c.fechas), c.hora, c.empresa,
                      c.region, c.distrito, e["nombre"], TIPO_ES[e["geom"].tipo], e["carpeta"], f["nombre"],
                      f["precision"] + (" (aprox.)" if f["aprox"] else ""), CONFIANZA[f["precision"]], r["dist"],
                      clean(c.texto)[:500], c.fuente])
    hoja(ws, ["Estado", "Fecha(s)", "Horario", "Empresa", "Región", "Distrito", "Elemento FTTH", "Tipo", "Carpeta FTTH",
              "Zona/calle del corte", "Ubicado por", "Confianza", "Distancia (m)", "Texto del corte", "Fuente"],
         datos, [18, 14, 20, 16, 13, 16, 30, 10, 24, 32, 16, 11, 12, 60, 40])
    red = PatternFill("solid", fgColor="F8CBAD")
    for row in ws.iter_rows(min_row=2):
        if row[0].value == "HOY" or str(row[0].value).startswith("Próximo"):
            for cell in row[:2]:
                cell.fill = red

    ws = wb.create_sheet("Todos los cortes")
    datos = []
    for c in sorted(cortes, key=lambda c: (min(c.fechas), c.empresa)):
        precis = sorted({f["precision"] for f in c.features}) or ["no ubicado"]
        datos.append([", ".join(x.strftime("%d/%m/%Y") for x in c.fechas), c.hora, c.empresa, c.estado, c.region,
                      c.distrito, c.provincia, c.titulo, clean(c.texto)[:800], len(c.features), ", ".join(precis), c.fuente])
    hoja(ws, ["Fecha(s)", "Horario", "Empresa", "Estado", "Región", "Distrito", "Provincia", "Título", "Zonas afectadas",
              "Elementos en mapa", "Precisión", "Fuente"], datos, [14, 20, 16, 13, 13, 16, 16, 30, 70, 10, 18, 40])

    ws = wb.create_sheet("Parámetros")
    for k, v in [("Fecha de referencia", ref.strftime("%d/%m/%Y")), ("Ventana", f"±{dias} días"),
                 ("Elementos FTTH leídos", len(ftth)), ("Cortes leídos", len(cortes))] + \
                [(f"Radio '{k}' (m)", v) for k, v in CONFIG["radio_m"].items()]:
        ws.append([k, v])
    ws.column_dimensions["A"].width = 26
    wb.save(path)


# ----------------------------------------------------------------------------------
# EXPORTAR PARA EL DASHBOARD WEB
# ----------------------------------------------------------------------------------
def _hhmm(txt):
    """'09:30 a.m.' -> '09:30'; '3:00 p.m' -> '15:00'; '16:00 Hrs' -> '16:00'."""
    m = re.search(r"(\d{1,2}):(\d{2})\s*([ap])?", txt or "", re.I)
    if not m:
        return None
    h, mi, ap_ = int(m.group(1)), int(m.group(2)), (m.group(3) or "").lower()
    if ap_ == "p" and h != 12:
        h += 12
    if ap_ == "a" and h == 12:
        h = 0
    return f"{h:02d}:{mi:02d}" if h < 24 else None


def horario(hora):
    """Devuelve (inicio, fin) en HH:MM a partir del texto del horario."""
    t = (hora or "").replace("\n", " ")
    m = re.search(r"(\d{1,2}:\d{2}\s*(?:[ap]\.?\s?m\.?)?)\s*(?:a|-|–|al|hasta)\s*(\d{1,2}:\d{2}\s*(?:[ap]\.?\s?m\.?)?)", t, re.I)
    if not m:
        return None, None
    return _hhmm(m.group(1)), _hhmm(m.group(2))


def exportar_json(cortes, fuentes, path, ref):
    out = []
    for c in cortes:
        ini, fin = horario(c.hora)
        feats = []
        for f in c.features:
            g = f["geom"]
            feats.append(dict(n=f["nombre"], t=g.tipo, p=[[[round(a, 6), round(b, 6)] for a, b in part] for part in g.parts],
                              pr=f["precision"], r=CONFIG["radio_m"][f["precision"]], ap=bool(f["aprox"])))
        out.append(dict(id=c.id, empresa=c.empresa, region=c.region, distrito=c.distrito, provincia=c.provincia,
                        fechas=[x.isoformat() for x in c.fechas], hora=c.hora, ini=ini, fin=fin, titulo=c.titulo,
                        texto=c.texto, estado=c.estado, fuente=c.fuente, extra=c.contexto_extra,
                        imagen=getattr(c, "imagen", None), f=feats))
    data = dict(generado=dt.datetime.now(TZ_LIMA).isoformat(timespec="minutes"), ref=ref.isoformat(),
                fuentes=fuentes, radios=CONFIG["radio_m"], cortes=out)
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))


# ----------------------------------------------------------------------------------
# PRINCIPAL
# ----------------------------------------------------------------------------------
def leer_links_txt(p=None):
    p = p or os.path.join(BASE, "links.txt")
    if not os.path.exists(p):
        return []
    return [l.strip().split()[-1] for l in open(p, encoding="utf-8") if l.strip().startswith("http") or "http" in l
            if not l.strip().startswith("#")]


def main(argv=None):
    ap = argparse.ArgumentParser(description="Cortes programados -> KMZ + cruce FTTH")
    ap.add_argument("--links", nargs="*", help="links de cortes programados (por defecto: links.txt)")
    ap.add_argument("--ftth", help="KMZ/KML de cobertura FTTH (polígonos, puntos y/o líneas)")
    ap.add_argument("--dias", type=int, default=7, help="ventana antes/después de la fecha (defecto 7)")
    ap.add_argument("--fecha", help="fecha de referencia AAAA-MM-DD (defecto: hoy)")
    ap.add_argument("--salida", default=os.path.join(BASE, "salida"))
    ap.add_argument("--json", help="exporta los cortes (con geometrías) a este archivo JSON para el dashboard web")
    ap.add_argument("--links-file", help="archivo con los links (defecto: links.txt junto al programa)")
    a = ap.parse_args(argv)

    interactivo = a.links is None and a.ftth is None and not a.json
    links = a.links or []
    if interactivo:
        print("=== Cortes programados -> KMZ + cruce FTTH ===")
        print("Pega los links (uno por línea). Deja vacío y presiona Enter para usar los de links.txt:")
        while True:
            l = input("> ").strip()
            if not l:
                break
            links.append(l)
        f = input("Arrastra aquí tu KMZ/KML FTTH (Enter para omitir el cruce): ").strip().strip('"').strip("'")
        a.ftth = f or None
        d = input(f"Días antes/después [{a.dias}]: ").strip()
        if d.isdigit():
            a.dias = int(d)
    if not links:
        links = leer_links_txt(a.links_file)
    if not links:
        print("No hay links. Agrégalos en links.txt o con --links.")
        return 1

    ref = dt.date.fromisoformat(a.fecha) if a.fecha else dt.datetime.now(TZ_LIMA).date()
    desde, hasta = ref - dt.timedelta(days=a.dias + 1), ref + dt.timedelta(days=60)
    geo = Geocoder()
    ub = Ubicador(geo)

    cortes, fuentes = [], []
    for url in links:
        log(f"\nLeyendo {url}")
        try:
            cs = leer_link(url, desde, hasta)
            log(f"   {len(cs)} corte(s)")
            cortes += cs
            fuentes.append(dict(url=url, ok=True, cortes=len(cs), empresa=cs[0].empresa if cs else ""))
        except Exception as e:
            log(f"   ERROR: {e}")
            fuentes.append(dict(url=url, ok=False, cortes=0, error=str(e)[:300]))
    if not cortes and not a.json:
        print("No se leyó ningún corte.")
        return 1

    log(f"\nUbicando {len(cortes)} cortes en el mapa (OpenStreetMap; la 1.ª vez demora, luego usa caché)...")
    for i, c in enumerate(cortes, 1):
        interpretar(c)
        try:
            ub.ubicar(c)
        except Exception as e:
            log("   error ubicando:", e)
        c.id = f"C{i:03d}"
        if i % 5 == 0 or i == len(cortes):
            log(f"   {i}/{len(cortes)}")
    geo.save()

    if a.json:
        exportar_json(cortes, fuentes, a.json, ref)
        log(f"\nOK  {a.json}  ({len(cortes)} cortes)")
        if not a.ftth:
            return 0

    carpeta = os.path.join(a.salida, dt.datetime.now(TZ_LIMA).strftime("%Y-%m-%d_%H%M"))
    os.makedirs(carpeta, exist_ok=True)
    kmz_cortes(cortes, os.path.join(carpeta, "cortes_programados.kmz"), ref)
    log(f"\nOK  {os.path.join(carpeta, 'cortes_programados.kmz')}")

    filas, ftth = [], []
    if a.ftth:
        ftth = leer_ftth(a.ftth)
        log(f"FTTH: {len(ftth)} elementos leídos ({', '.join(f'{sum(1 for e in ftth if e['geom'].tipo == t)} {TIPO_ES[t].lower()}s' for t in TIPO_ES)})")
        filas = cruzar(cortes, ftth, ref, a.dias)
        kmz_cruce(filas, os.path.join(carpeta, "cruce_ftth.kmz"), ref, a.dias)
        log(f"OK  {os.path.join(carpeta, 'cruce_ftth.kmz')}")
    excel(filas, cortes, ftth, os.path.join(carpeta, "reporte_cruce.xlsx"), ref, a.dias)
    log(f"OK  {os.path.join(carpeta, 'reporte_cruce.xlsx')}")

    if a.ftth:
        n = len({id(r["elem"]) for r in filas})
        log(f"\n=== {n} elemento(s) FTTH con corte entre {ref - dt.timedelta(days=a.dias):%d/%m} y {ref + dt.timedelta(days=a.dias):%d/%m} ===")
        vis = set()
        for r in sorted(filas, key=lambda r: (r["dif"] < 0, abs(r["dif"]))):
            k = (id(r["elem"]), id(r["corte"]))
            if k in vis:
                continue
            vis.add(k)
            c = r["corte"]
            log(f" - {r['elem']['nombre']}: {estado_txt(r['dif'])} | {c.fechas[0]:%d/%m} {c.hora} | {c.empresa} | "
                f"{c.distrito} | {r['feat']['nombre']} | confianza {CONFIANZA[r['feat']['precision']].lower()}")
    if interactivo:
        try:
            os.startfile(carpeta)  # Windows: abre la carpeta de resultados
        except Exception:
            pass
        input("\nListo. Presiona Enter para cerrar.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
