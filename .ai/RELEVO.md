# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** main

## 3 líneas
Accesos FICTI es consola **React+TS** en `panel…/accesos` (sidebar FICTI, escáner PDA, buscar/imprimir 5×8, informes, zonas). Hardening: APIs con sesión+CSRF origen+rate limit; demo `/api/escanear` exige `X-Scan-Key`. Terror intacto.

## Hecho
- Quitada UI Accesos Jinja; SPA `panel/ui` profesional (IA, estados, copy ES).
- AuthN en `/api/accesos/*` (antes filtraba como promotor sin login → **401**).
- Demo scan key + rate limit; cookies/headers endurecidos.
- Deploy DO: panel + demo rebuild.

## Smoke DO
- `panel…/login` 200; `panel…/accesos` 200 (login redirect)
- `api/accesos/sesion` anon → **401**
- `demo…/api/escanear` anon/wrong key → **401**
- `demo…/escanear` 200 (UI pide clave)

## A medias / residual
- Demo PDA no actualiza aforo de zonas (sí el panel escáner).
- Sin cámara web en escáner (teclado/USB zebra).
- Sin cola offline tipo Nest.
- Adam debe guardar `SCAN_API_KEY` del `.env` DO en los PDA.

## No tocar
Terror Hetzner; cutover DNS; secretos en git.
