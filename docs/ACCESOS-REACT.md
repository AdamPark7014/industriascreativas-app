# FICTI Accesos — React + TypeScript (no Python en runtime Accesos)

**Actualizado 2026-09-05:** Accesos FICTI es **React (UI) + TypeScript/Hono (API)**
en DigitalOcean. Flask ya **no** sirve `/api/accesos/*` ni el PDA
`/api/escanear`|/api/zonas`.

| Pieza | Host | Stack |
|-------|------|--------|
| Panel ops + Accesos SPA | `panel.experiencebt.com.mx` | Flask (login/registros/Excel) + React `/accesos` |
| Accesos API | same-origin `/api/accesos/*` | **Hono/Node** `eventos_accesos_api:3080` |
| Registro público | `demo.experiencebt.com.mx` | Flask registro + React `/escanear` |
| PDA scan/zonas | `demo…/api/escanear`, `/api/zonas` | **mismo** Accesos TS (`X-Scan-Key`) |
| Boletera / terror | `manager.terror…` | Nest Hetzner — **aparte, no tocar** |

Código: `panel/accesos-api/` (EVENTO-ELISA). Cookie de sesión Flask
(`panel_session` + `PANEL_SECRET_KEY`) la valida el API TS.

## Módulos
- Resumen / pulso (caché corta ~2.5s, queries en paralelo)
- Escáner ENTRY/EXIT/reingreso + zonas/aforo
- Cámara + cola offline
- Buscar (prefijo + `pg_trgm`) + boleto **62×100 mm** cinta continua QL-800
  (JSON QR + `@media print` + PDF `pdf-lib`)
- Informes zona/reingresos/CSV/XLSX
- Pool Postgres + gzip nginx

## Evento de varios días (2026-10-14)

FICTI dura tres días. Todo lo que pasa en el panel se agrupa por el **día del
evento en hora de México** y el estado de puerta se reinicia cada día.

- **Fechas**: `EVENTO_DIAS=2026-10-15,2026-10-16,2026-10-17` en `panel/.env`
  (la leen `panel_web` y `accesos_api` vía `docker-compose.panel.yml`). Sin la
  variable se usan esas tres. Código: `panel/accesos-api/src/evento.ts`
  (`DIAS`, `fechaCdmx`, `filtroDia`, `condFecha`) y `panel/consultas.py`
  (`dias_evento`, `asistencia_por_dia`).
- **Escaneo** (`scan.ts`): "dentro / fuera" sale del **último escaneo aceptado
  de hoy** de la persona (`estadoPersona`), no de un contador global. Quien
  entró el día 1 y no escaneó salida entra sin problema el día 2. *Reingreso*
  = volvió a entrar **el mismo día** tras una salida. El veredicto trae `dia`,
  `entradasHoy` y `diasPrevios` ("también vino el día 1"). `asistencias` en las
  tablas de registro pasa a ser el **total histórico de entradas** (ya no baja
  con la salida).
- **Aforo por día**: `accesos_zonas.dentro_fecha` (migración
  `007_dias_evento.sql`, también en `ensureIndexes`). Si el contador es de otro
  día arranca en 0 en el primer escaneo; `/zonas`, `/resumen` y el PDA ya
  devuelven el `dentro` de hoy.
- **Filtro `?dia=`** en `/resumen` (defecto hoy), `/reportes` (defecto todos),
  `/metricas`, `/mesa` e `/impresiones`: `1|2|3`, `hoy`, `todos` o
  `YYYY-MM-DD`. Las respuestas traen `evento` (días y cuál es hoy), `dia` (cómo
  se interpretó) y, en resumen/mesa, `porDia`. `GET /sesion` también trae
  `evento`. Los rechazos ya no cuentan `COOLDOWN` (lector que lee dos veces).
- **Excel de accesos** (`/reportes?formato=xlsx`, `informes.ts`): hoja
  *Resumen* (totales por día), **una hoja por día**, *Otros días* si hubo
  escaneos fuera de fechas y *Asistentes* (una fila por persona: 1.ª entrada,
  última salida y accesos de cada día). El CSV añade `fecha`, `hora` y `dia`.
  La exportación trae hasta 50 000 filas (la pantalla sigue en 300).
- **Excel de registros** del panel Flask (`exportar.py`): hoja nueva
  *Asistencia* con los mismos datos por persona y día.
- **UI**: selector de día (`components/DiaSelector.tsx`, estado compartido en
  `lib/useDia.ts` por pestaña) en Resumen, Informes y Mesa; franja con tarjeta
  por día en Resumen; chip "Día N · jue 15 oct" en la cabecera; banner del día
  en el escáner (y aviso si hoy no es día del evento). El escáner ignora la
  misma lectura repetida en < 0.9 s (ruido del lector USB).
- **Modo enfocado**: `registro1–5`, `impresion1–5` y `puerta1–N` tienen una sola pantalla,
  así que `OpsShell` les quita el lateral y deja una barra superior (logos,
  título, día, usuario y Salir). Se activa solo cuando el rol ve ≤ 1 entrada
  del menú.
- **Impresión**: si Windows reporta la QL-800 apagada/sin USB el panel no manda
  el job (aviso inmediato en vez de esperar 45 s); si el agente no contestó,
  espera 1.2 s, lo sondea y reintenta **una vez**; `watched: 'timeout'` se
  muestra como "enviado · confirma que salió la etiqueta".
- Deploy: `python .ai/_deploy_dias.py respaldar|subir|canario|promover|rollback`
  (rollback a `:prev-20261014`, respaldo `/root/backups/bd_demo-prev-20261014.dump`).
  Humo: `.ai/_smoke_dias.py` (ciclo entrada → ya dentro → salida → reingreso y
  "entrada de ayer no bloquea hoy").

## Impresión QL-800 (cinta continua 62 mm)

El gafete de puerta ya **no** es 5×8 in. `@page` y el PDF son **62 mm × 100 mm**
para Brother QL-800 con **62mm Cinta continua**.

**Origen del error 29×90:** el CSS/PDF en el servidor **ya** emiten 62×100.
Chrome `window.print()` **no puede forzar** el form del driver Brother; Windows
usa a menudo el papel por defecto del QL-800 (`29mm × 90mm` die-cut) → Brother
rechaza el job aunque el rollo físico sea cinta 62 mm.

**Segundo origen de "sigue sin imprimir" (2026-09-08):** el rollo cargado es
**negro/rojo (DK-2251)** y el driver mandaba el job como monocromo; la Brother
lo pausaba con "cambie el tipo de papel a Negro/Rojo". El agente local ya lo
resuelve solo (**auto-rollo**): fija el tipo de papel en el driver, vigila la
cola, cancela el job rechazado y reintenta con el otro modo.

### Un solo botón: **Imprimir boleto** (2026-09-08)

En Accesos → Buscar → **Ver e imprimir** se abre el preview con **un solo botón
grande, "Imprimir boleto"** (también `Ctrl+Enter`). Manda el PNG al agente
local (`http://127.0.0.1:9631/print-label`, `mediaName=62mm Cinta continua`,
`colorMode=auto`, job `ExperienceBT-QL-62x100`, GDI, no Chrome). El agente
detecta el rollo (`mono`|`redblack`) y reintenta solo; el toast muestra el
rollo usado. Si falla, el agente devuelve `error` en español y el panel lo
muestra completo: **nunca** cae a `window.print`.

**Más opciones** (desplegable colapsado): *Imprimir con Chrome (no
recomendado)* — Chrome no fija el papel Brother, hay que elegir a mano
**62mm Cinta continua**, márgenes ninguno, encabezados/pies OFF, puede salir
29×90 — y *Abrir PDF* (62×100, `pdf-lib`). Ambos se registran como impresión
(`via: chrome|pdf`) al abrir el diálogo/PDF, sin garantía de que saliera.

### Instalar la impresora desde cualquier PC

La página Buscar sondea `GET /health` del agente al montar y **cada 20 s** y
muestra un chip en la cabecera:

- **Impresora lista · Brother QL-800 · rollo negro/rojo** (o *rollo monocromo*).
- **Impresora apagada o desconectada**: el agente responde pero Windows marca la
  QL-800 sin conexión (`/health.printerOnline === false`); el agente no encola
  nada hasta que vuelva. El mismo aviso aparece dentro del preview.
- **Impresora no instalada en esta PC → Instalar**: abre el panel de
  instalación (el mismo aparece dentro del preview cuando el agente está
  offline) con el botón primario **Instalar impresora en esta PC** (descarga
  `/static/print-bridge.zip`), los 3 pasos y **Ya la instalé, comprobar**, que
  vuelve a sondear `/health`.

Una sola vez por PC, sin Node:

1. Conecta la Brother QL-800 por USB, enciéndela e instala su driver.
2. Descomprime el ZIP descargado.
3. Doble clic en **`Instalar-Impresora-QL.cmd`**. Queda en segundo plano y
   arranca con Windows.

**Chrome 152+:** una página https que llama a `http://127.0.0.1` dispara el
aviso "acceder a dispositivos de tu red local". Si el operador bloquea, el fetch
falla con "Failed to fetch": hay que pulsar **Permitir** (o revisarlo en el
candado de la barra de direcciones) y reintentar. Los fetch al agente llevan
`targetAddressSpace: 'loopback'`. `GET /health` devuelve además `colorMode`
(último modo que funcionó o `null`), `agent`, `version` e `installed`.

### Registro de impresiones y "Marcar como no impreso"

Cada impresión real queda en la BD (`accesos_impresiones`, API en
`panel/accesos-api`):

- Tras una impresión QL correcta el panel llama
  `POST /api/accesos/gafete/:tipo/:id/impresion` con
  `{ via:'ql', impresora, modoColor, jobId, dispositivo }` (`jobId` solo si es
  entero ≥ 0; `dispositivo` = plataforma + id de estación, ≤ 60 chars). Toast:
  **Boleto impreso y registrado (×N) · Nombre**. Si el registro falla
  (red/API) la impresión ya salió: toast de aviso **Impreso, pero no se pudo
  registrar**, sin bloquear.
- `GET /api/accesos/buscar` y `GET /api/accesos/gafete/:tipo/:id` traen
  `impresiones` (número) y `ultimaImpresion` (ISO|null). Cada resultado muestra
  el badge **Impreso ×N · hh:mm** y el preview el aviso **Ya impreso N veces ·
  última hh:mm**.
- **Marcar como no impreso** (enlace en el preview, con confirmación) llama
  `DELETE /api/accesos/gafete/:tipo/:id/impresiones` y deja el contador en 0
  (un 404 `sin_impresiones` se trata como 0). También existe
  `DELETE …/impresion/:impresionId` y `GET …/impresiones` (lista, máx. 50).
- Cliente: `registrarImpresion`, `listarImpresiones`, `borrarImpresion`,
  `borrarImpresiones` en `panel/ui/src/api.ts`.

### Boleto 62 × 29 mm (vigente desde 2026-10-14)

Etiqueta precortada **Brother DK-11209 (62 × 29 mm)**, papel `62mm x 29mm` del
driver. La cara mide **59 × 23 mm** = área imprimible del driver para esa etiqueta
(58.9 × 22.9) y no se gira: el agente solo gira cuando el área es vertical. QR 21 mm a
la izquierda; nombre 5.2→2.2 mm hasta 3 líneas y folio 2.1 mm a la derecha. PNG
697 × 272 px a 300 dpi. Números en `boletoLayout.ts` (`ETIQUETA`, `GEO`). Con cinta
continua cargada la impresora rechaza el trabajo (papel distinto). Lo de abajo
describe versiones anteriores.

### Diseño del boleto (apaisado 94 × 59, papel térmico negro/rojo, WYSIWYG)

> **2026-10-05:** la etiqueta pasó a **80 × 59 mm** (cabe en los 8 cm útiles):
> QR 38 mm + nombre grande (9 → 3.2 mm, hasta 4 líneas) + folio 2.8 mm. Sin
> banda de tipo ni subtítulo. PNG **945 × 697 px**. Lo de abajo describe la
> versión anterior; las medidas vigentes están en `GEO` (`boletoLayout.ts`).

Desde 2026-09-09 el boleto es **apaisado: 94 × 59 mm**, QR a un lado y texto
al otro, sin marca ni adornos. `BoletoFace.tsx` + `boleto-face.css` (preview
y camino Chrome) y `boletoRender.ts` (PNG para el agente) comparten la
**misma geometría en mm**, que vive en `panel/ui/src/lib/boletoLayout.ts`
(`GEO`, `COL_W` y la medición de texto):

- Área imprimible real de la QL-800 en cinta 62 mm: **58.9 mm de ancho
  (cinta) × 94.2 mm de largo (corte)**. El agente local **gira 90° cualquier
  PNG apaisado** (ancho > alto) y lo encaja centrado ahí, así que el panel
  genera el PNG **tal cual se ve, sin girarlo: 94 × 59 mm a 300 dpi →
  1110 × 697 px**.
- Solo **blanco, negro y rojo `#e60012`**: sin grises, gradientes, logos ni
  marco. Margen interno 3 mm.
- **Izquierda**: QR **44 mm** negro sobre blanco, centrado en vertical, sin
  texto encima ni debajo (el margen y el hueco de 4 mm hacen de zona en blanco).
- **Derecha**: columna de texto 40 × 49 mm centrada en vertical, alineada a la
  izquierda: banda roja compacta con el **tipo** en blanco (8 mm; letra 4 →
  2.6 mm auto), **nombre** negro en negritas (auto-ajuste 6.2 → 3.2 mm, hasta
  3 líneas), **subtítulo** (empresa o plantel) 2.8 mm hasta 2 líneas y
  **folio** 3.2 mm anclado abajo (p. ej. `EMPRESARIO-12`).
- Fuera: "FICTI · TECH CAPITAL", la línea del evento, "Presenta este código en
  puerta" y el marco exterior.
- Auto-ajuste: `ajustarFuenteMm` mide con un canvas (Manrope, mismo tracking)
  y devuelve el mayor tamaño con el que el texto cabe; `BoletoFace` lo aplica
  en línea y `renderBoletoPngBase64` usa la misma cuenta y el mismo partido de
  líneas (`partirLineas`), esperando `document.fonts` antes de medir.
- Preview del modal: `.escenario` reserva `94 × 59 mm × escala` y la cara se
  escala con `transform` (`--boleto-escala`, 0.6–1.8× según el ancho libre,
  por `ResizeObserver`) para verse grande sin recortes.
- Camino Chrome (`printBoletoIsolated` y `@media print`): `@page` sigue siendo
  **62mm 100mm** porque la cinta sale en vertical; la cara se gira 90° con
  `transform: translate(-50%, -50%) rotate(90deg)` alrededor del centro de la
  etiqueta (59 sobre los 62 de ancho, 94 sobre los 100 de largo), igual que
  hace el agente con el PNG.
- Para regenerar una muestra con la función real: harness Vite temporal (no
  versionado) con `root` en una carpeta que tenga `index.html` + `main.tsx`
  importando `BoletoFace` y `renderBoletoPngBase64` con datos de prueba, y un
  middleware `configureServer` que reciba el base64 por POST y lo guarde.

Detalle del agente: `EXPERIENCEBT-app/docs/IMPRESORA-QL800.md`.

## Roles y mesa de atención (2026-10-05)

Permisos por rol en `panel/accesos-api/src/catalog.ts` (`ROLES`); el API niega
cualquier ruta que no esté en `REGLAS` (`index.ts`). Nombres e inicio de cada
rol en el panel Flask: `panel/consultas.py` (`ROLES`).

| Usuario(s) | Rol | Puede |
|---|---|---|
| `admin` | interno (NEXARA · Operación) | todo, incluido escáner, zonas, lista negra (`/bloqueos`), métricas y equipo |
| `promotor` | promotor | panel de datos + registrar, buscar, reenviar, imprimir, informes, actividad |
| `controladm` | control | registrar, buscar, reenviar, imprimir, desmarcar, informes, actividad |
| `impresion1`–`5` | impresion | buscar (nombre/correo/teléfono/folio), ficha, reenviar, imprimir |
| `registro1`–`5` | registro | alta en sitio + imprimir; reimprime solo sus altas (`/mis-altas`) |
| `puerta1`–`N` | puerta | solo el escáner (`/accesos/escanear`, entrada/salida, zonas para elegir dónde valida); sin resumen, búsqueda, ficha, informes ni panel de datos |

- **Puerta** (2026-10-14): antes solo `admin` podía escanear. Las rutas de
  escaneo ya no miran `alcance === 'interno'`: las decide `REGLAS` por permiso
  (`escanear`; `/bloqueos` pide `bloquear`, solo interno). `seed.py` crea
  cualquier `puerta<n>` que venga en `PANEL_EQUIPO_CLAVES` (cuántas puertas hay
  lo decide el `.env`); `python .ai/_deploy_dias.py equipo` fusiona en el
  servidor las claves de `C:\dev\secrets\ficti-puerta-2026-10-14.txt` y luego
  hay que recrear `panel_web` para que el seeder las cree.

- **Registro en sitio** (`/accesos/registro`, `POST /api/accesos/registro`):
  mismos datos que el formulario público, queda `confirmado` al momento y abre
  la impresión; el correo es opcional (casilla apagada). Cada alta queda en
  `accesos_altas_sitio`.
- **Ficha** (`GET /api/accesos/persona/:tipo/:id`): datos, accesos, impresiones,
  correos enviados (`correo_envios`), descargas del PDF (`boleto_descargas`) y
  eventos de Brevo (`/correo-eventos`, últimos 90 días).
- **Reenvío**: accesos_api llama a `eventos_demo_web` →
  `POST /api/interno/gafete` con `X-Interno-Key`. El correo trae el PDF adjunto
  y un botón a `/boleto/<token>` que registra cada descarga.
- Tablas nuevas: `panel/migraciones/006_mesa_atencion.sql` (las crean también
  `ensureIndexes` y `ensure_schema()` al arrancar).
- Variables (solo en el servidor): `PANEL_EQUIPO_CLAVES`
  (`usuario:clave,...`, en `panel/.env`; quien no tenga clave queda
  desactivado) y `PANEL_INTERNO_KEY` (mismo valor en `.env` raíz y
  `panel/.env`).

## Seguridad
- Panel: sesión + Origin/Referer + rate limit
- Demo PDA: `SCAN_API_KEY` via `X-Scan-Key` (fail-closed en https)
- Terror / Nest: intacto
