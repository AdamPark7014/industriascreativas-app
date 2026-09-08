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

En Chrome: papel `62mm Cinta continua`, márgenes ninguno, **encabezados y pies OFF**.
Detalle operativo: `EXPERIENCEBT-app/docs/IMPRESORA-QL800.md`.

## Seguridad
- Panel: sesión + Origin/Referer + rate limit
- Demo PDA: `SCAN_API_KEY` via `X-Scan-Key` (fail-closed en https)
- Terror / Nest: intacto
