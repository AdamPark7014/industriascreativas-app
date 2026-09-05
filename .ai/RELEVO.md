# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-05
- **Rama:** main

## 3 líneas
Accesos más completo: demo PDA actualiza aforo de zonas; cámara + cola offline en panel y demo; informes con zona/reingresos/en vivo; búsqueda con abort + prefijo.

## Hecho
- `backend/app.py`: `procesar_escaneo(..., zona)` + `GET /api/zonas` (X-Scan-Key); aforo `accesos_zonas`; no confirmado.
- Demo `web` escáner: selector de zona, cámara BarcodeDetector, cola offline.
- Panel React: mismo cámara/offline; aforo en vivo tras escaneo; `Permissions-Policy camera=(self)`.
- Informes: filtro zona, KPI reingresos, refresco en vivo; buscar abort + ILIKE prefijo.
- Deploy DO + smoke: auth 401, demo js con cámara/zonas, contenedor con `accesos_zonas`.

## Smoke DO
- panel_login/accesos 200; api anon 401; demo scan/zonas anon 401
- panel dist: Abrir cámara, EN COLA OFFLINE, zonaDentro, Reingresos
- demo: Abrir cámara, /api/zonas, EN COLA OFFLINE; `procesar_escaneo` has_zones

## A medias / residual
- Devices/latency hub estilo Nest: solo latencia puntual en panel escáner (sin página dispositivos).
- BarcodeDetector: Chrome/Edge OK; Safari puede caer a USB.
- Adam: `SCAN_API_KEY` del `.env` DO en los PDA.

## No tocar
Terror Hetzner; cutover DNS; secretos en git.
