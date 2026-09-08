# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-08
- **Rama:** main
- **HEAD:** (cerrar) — Accesos QL no Chrome fallback + green primary + DO redeploy

## 3 líneas
Job Brother «Accesos · FICTI» 29×90 = Chrome SPA print, no el agente. UI ahora:
botón verde **Imprimir en QL** → solo `127.0.0.1:9631`; fallo = alert, sin
`window.print()`. Live asset `index-DUx04nJC.js` + `/static/print-bridge.zip`.

## Qué dejó el turno anterior y sigue en pie

- Pop-up área de interés, Edad, áreas por marca, institución.
- Accesos API TS/Hono en DO.
- 275 alumnos / 557 empresarios (conteo 08-09).

## Hecho en este turno

- BuscarPage: QL fail → `alert` exacto; Chrome path aislado con título
  `ExperienceBT-QL-62x100`; sin fallback silencioso.
- Modal: QL primary verde; Chrome «no recomendado / puede 29×90»; probe status.
- `printAgent.ts`: errores CORS/offline claros; paper/jobName en respuesta.
- Deploy DO `panel_web`+`accesos_api`: asset sin 29mm/90mm; zip agente en static.

## A medias / siguiente

- Adam: hard-refresh Accesos → **solo** botón verde QL (con `start.cmd` corriendo).
- Si Brother muestra «Accesos · FICTI» otra vez → clicó Chrome, no QL.
- **Rotar password root DO**.
- Nombre de plantel en gafete estudiante (decisión cliente).

## No tocar

- Terror / Hetzner app code (salvo print-bridge en EXPERIENCEBT).
- Recrear `accesos_api` sin `SCAN_API_KEY`.
- Secretos en git / no guardar password DO nuevo en repo.
