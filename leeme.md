# Dashboard KPI FBB (M&E) — versión web

Página web que lee y escribe directamente en tu Google Sheet. Cada persona entra con su cuenta de Google y no se necesita Apps Script.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La página (pestañas: Dashboard, Reporte Diario, OLT Down, Legal, Tareas) |
| `js/config.js` | **Lo único que editas**: Client ID, ID de la hoja y nombre de la pestaña principal |
| `js/api.js` | Login con Google y lectura/escritura en Sheets y Drive |
| `js/daily-report.js` | Sección Reporte Diario |
| `js/app.js` | Lógica del dashboard y las demás secciones |
| `js/demo-data.js` | Datos de ejemplo del modo demo |

## Probarla antes de configurar nada (modo demo)

Mientras `CLIENT_ID` esté vacío en `js/config.js`, la página funciona con datos de ejemplo y no toca tu hoja. Para verla en tu computadora:

1. Abre una terminal en esta carpeta.
2. Ejecuta `python -m http.server 8000`.
3. Abre `http://localhost:8000` en el navegador.

Hacer doble clic en `index.html` también funciona en la mayoría de navegadores.

---

## Publicarla para tu equipo (unos 20 minutos, una sola vez)

### Paso 1 — Publicar la página (Netlify, gratis)

1. Crea una cuenta gratis en https://app.netlify.com. Sin cuenta, el sitio se borra en 1 hora.
2. Ve a **Sites → Add new site → Deploy manually**.
3. Arrastra **toda esta carpeta** (la que contiene `index.html`).
4. Netlify te da una dirección como `https://nombre-raro-123.netlify.app`. Puedes cambiarla en **Site configuration → Change site name**, por ejemplo `https://fbb-dashboard.netlify.app`.
5. **Anota esa dirección**: la necesitas en el paso 3.

### Paso 2 — Crear el proyecto en Google Cloud

1. Entra a https://console.cloud.google.com con tu Gmail.
2. Arriba, en el selector de proyectos, elige **Proyecto nuevo**, nómbralo `Dashboard FBB` y pulsa **Crear**.
3. Menú **APIs y servicios → Biblioteca**. Busca y **habilita** estas dos APIs:
   - **Google Sheets API**
   - **Google Drive API**
4. Menú **Google Auth Platform** (puede aparecer como *Pantalla de consentimiento de OAuth*) → **Comenzar**:
   - Nombre de la app: `Dashboard FBB`
   - Correo de asistencia: tu Gmail
   - Público: **Externo**
   - Correo de contacto: tu Gmail. Acepta y pulsa **Crear**.
5. En **Público** (*Audience*) → **Usuarios de prueba** → **Agregar usuarios**: escribe los **8 Gmail del equipo** (incluido el tuyo).
   Deja la app en estado **Prueba**. No hace falta publicarla.

### Paso 3 — Crear el Client ID

1. En **Google Auth Platform → Clientes** → **Crear cliente**.
2. Tipo de aplicación: **Aplicación web**.
3. En **Orígenes autorizados de JavaScript** agrega la dirección del paso 1, **sin barra al final**: `https://fbb-dashboard.netlify.app`.
   Si quieres probar en tu computadora, agrega también `http://localhost:8000`.
4. Pulsa **Crear** y copia el **ID de cliente**. Termina en `.apps.googleusercontent.com`.

### Paso 4 — Configurar y volver a subir

1. Abre `js/config.js` y pega el ID en `CLIENT_ID: '...'`.
2. Revisa que `MAIN_SHEET` sea el nombre exacto de tu pestaña principal (`BTS status`).
3. En Netlify: **Deploys** → arrastra otra vez la carpeta completa.

### Paso 5 — Permisos de la hoja

1. En tu Google Sheet → **Compartir**.
2. En *Acceso general* elige **Restringido**. Hoy cualquiera con el enlace puede verla.
3. Agrega a los 8 Gmail como **Editor**.

Listo. Comparte la dirección de Netlify con el equipo.

---

## Lo que verá cada persona la primera vez

- Al pulsar **Iniciar sesión con Google** aparece *"Google no ha verificado esta app"*. Es normal en apps internas: pulsa **Continuar** y acepta los permisos.
- La sesión dura 1 hora. Si expira, aparece una barra amarilla con el botón **Reconectar**. No se pierde lo que estabas escribiendo.

## Cómo se guardan los datos

- Se usan las mismas pestañas de siempre: `WA_History`, `Legal_Incidents` y `Tasks`. El dashboard antiguo de Apps Script puede seguir funcionando en paralelo.
- El Reporte Diario se guarda en una pestaña nueva, **`Daily_Report`**, que se crea sola la primera vez que guardas. **No edites a mano la columna B (JSON)**. La columna C tiene el texto final que enviaste.
- Las fotos y PDFs nuevos se suben a una carpeta `Dashboard_FBB_Web` en el Drive **de quien los sube**, con acceso por enlace (igual que antes). Las fotos antiguas se siguen viendo.

## Reporte Diario — uso diario

1. Abre la pestaña **📝 Reporte Diario**. Se carga la fecha de hoy con el texto del último reporte guardado.
2. Escribe los **indicadores de hoy** (TT, WO, ACS…). La columna *Variación* compara con el día anterior: verde si mejoró, rojo si empeoró.
3. Pega en cada punto lo que te compartieron. Los puntos que siguen iguales a ayer aparecen con **⚠️ Igual que ayer**. Con **Ver cambios vs ayer** ves qué líneas cambiaron.
4. El punto 7 (OLT down) se arma solo con los incidentes registrados en **💬 OLT Down** desde el reporte anterior. Puedes desmarcar los que no quieras incluir.
5. Pulsa **💾 Guardar** y luego **📋 Copiar para WhatsApp**.

**Códigos dentro del texto** (se reemplazan solos):

| Código | Se reemplaza por |
|---|---|
| `{TT}` | Valor de hoy |
| `{TT_DIF}` | Variación vs ayer (ej. `+343`) |
| `{TT_AYER}` | Valor de ayer |
| `{ACS_META}`, `{ACS_PCT}` | Meta y % de avance |
| `{FECHA}`, `{DIA}` | `19/11/26` y `19/11` |

Si falta un valor, aparece `??` en rojo en la vista previa.

## Cambiar algo después

Edita los archivos y vuelve a arrastrar la carpeta a Netlify (**Deploys**). Si cambias la dirección del sitio, actualiza también los *Orígenes autorizados* del paso 3.

---

## Pestaña ⚡ Cortes (cortes programados × red FTTH/ODN)

Muestra los cortes de luz programados por las empresas eléctricas y los cruza con tu red:
mapa del Perú, cortes de hoy (Branch, BTS, OLT, duración del día, clientes, HUBBOX, ODB),
próximos cortes con su duración, cortes recientes y descarga en KMZ.

### De dónde salen los datos

| Dato | Origen |
|---|---|
| Cortes programados | `data/cortes.json`, lo actualiza **GitHub Actions** 3 veces al día (`.github/workflows/cortes.yml`), leyendo las páginas de `scraper/links.txt` |
| Cobertura FTTH / ODN | Se sube desde la pestaña (**⬆ Subir cobertura**). Queda guardada en la hoja, pestañas `COB_FTTH` y `COB_ODN` (no las edites a mano). Cada subida se registra en `Coberturas_Log` |
| Clientes afectados | Columna **Active** de `BTS status` por OLT, prorrateada por las NAP afectadas (ej.: 400 activos, 8 de 64 NAP → ~50) |

### Cómo lee el KMZ de cobertura
- **Branch**: carpetas `Branch XXX`.
- **Zona / OLT / BTS**: carpeta cuyo nombre trae la OLT (`LAL_Z58 LAL0181OLT01 …`) o que tiene una carpeta `SITE`.
- **HUBBOX**: carpetas/puntos `HB01`… (también `SB111` en los diseños que usan ese nombre).
- **ODB / NAP**: puntos `SB…`, `NAP…`, `ODB…`, `CTO…`.
- **Fibra**: todas las líneas (mensajeros, ADSS).
- Los postes no se guardan (son ~60 000 puntos).

### Precisión
Cada corte se ubica con OpenStreetMap. Calles = confianza **Alta**; sector/caserío = **Media**;
solo distrito/provincia = **Baja** (no entra al cruce salvo que actives "Incluir ubicación aprox.").

### Correr el lector de cortes a mano
GitHub → pestaña **Actions** → *Actualizar cortes programados* → **Run workflow**.
En **Settings → Secrets and variables → Actions → Variables** crea `NOMINATIM_EMAIL` con tu correo.
