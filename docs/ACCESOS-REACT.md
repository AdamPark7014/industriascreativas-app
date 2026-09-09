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

### Diseño del boleto (papel térmico negro/rojo, WYSIWYG)

`BoletoFace.tsx` + `boleto-face.css` (preview y camino Chrome) y
`boletoRender.ts` (PNG para el agente) comparten la **misma geometría en mm**:

- Cara **59 × 94 mm** = área imprimible real de la QL-800 en cinta 62 mm
  (márgenes duros 1.5 mm lados / 2.8 mm arriba-abajo). El agente encaja el PNG
  en esa área (contain + centrado), así que sale **1:1 y centrado**. PNG a
  **300 dpi → 697 × 1110 px**.
- Solo **blanco, negro y rojo `#e60012`**: sin grises, gradientes ni logos
  (los logos son claros, pensados para fondo oscuro). Marco negro fino a
  1.2 mm; margen interno 3 mm.
- Banda negra de marca **FICTI · TECH CAPITAL** (9 mm), banda roja con el
  **tipo** en blanco (8 mm), **nombre** negro 5 mm (máx. 2 líneas), empresa
  2.7 mm (máx. 2 líneas), evento 2.2 mm, **QR 34 mm** negro sobre blanco
  anclado abajo, pie "Presenta este código en puerta" + **folio** 3.2 mm.
- Camino Chrome: `@page 62mm 100mm`, `[data-boleto-print-root]` 62×100 con la
  cara 59×94 centrada (`printBoletoIsolated`). El preview del modal se muestra
  claro, igual que sale del rollo.

Detalle del agente: `EXPERIENCEBT-app/docs/IMPRESORA-QL800.md`.

## Seguridad
- Panel: sesión + Origin/Referer + rate limit
- Demo PDA: `SCAN_API_KEY` via `X-Scan-Key` (fail-closed en https)
- Terror / Nest: intacto
