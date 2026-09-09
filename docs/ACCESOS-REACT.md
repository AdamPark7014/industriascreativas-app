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

### Diseño del boleto (apaisado 94 × 59, papel térmico negro/rojo, WYSIWYG)

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

## Seguridad
- Panel: sesión + Origin/Referer + rate limit
- Demo PDA: `SCAN_API_KEY` via `X-Scan-Key` (fail-closed en https)
- Terror / Nest: intacto
