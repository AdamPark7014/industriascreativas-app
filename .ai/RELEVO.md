# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-05
- **Rama:** main

## 3 líneas
Accesos APIs + PDA scan/zonas migrados a TypeScript (Hono) en DO; Flask ya no enruta Accesos.
UI React intacta; terror Nest intacto.

## Hecho
- Nuevo `panel/accesos-api` (Hono + pg + qrcode/pdf-lib/exceljs).
- nginx `zz-panel` → `/api/accesos/*`; `zz-demo` → `/api/escanear` + `/api/zonas`.
- Flask: blueprint Accesos desregistrado; demo scan/zonas → 410 si se golpean directo.
- Perf: pool pg, resumen paralelo + cache 2.5s, gzip, `pg_trgm` + índices escaneos.
- Deploy DO: `eventos_accesos_api` healthy; smoke 401 anon, demo key OK, sesión Flask→TS OK.

## Smoke DO
- `api_accesos_anon=401`, `demo_scan/zonas_anon=401`
- mint cookie: sesion 200, resumen ~194ms→~99ms cache HIT, buscar/scan/pdf OK
- indexes: trgm nombre/tel (+ correo donde IMMUTABLE)

## A medias / residual
- Flask sigue para login + registros + Excel (no Accesos).
- `panel/accesos.py` legacy reference (blueprint no registrado).
- PDF gafete ahora `pdf-lib` (no ReportLab).

## No tocar
Terror Hetzner; cutover DNS; secretos en git.
