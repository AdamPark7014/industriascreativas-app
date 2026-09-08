# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-08
- **Rama:** main
- **HEAD:** 37bed75 — Accesos QL zero-friction + zip estático

## 3 líneas
Modal: probe `/health` → «QL lista · {printer}» o offline ES + ZIP
`/static/print-bridge.zip`. Primario QL; Chrome secundario con aviso.
Deploy DO: `index-DUx04nJC.js`, zip HTTP 200. Bridge local job 62mm OK.

## Qué dejó el turno anterior y sigue en pie

- Pop-up área de interés, Edad, áreas por marca, institución.
- Accesos API TS/Hono en DO.
- 275 alumnos / 557 empresarios (conteo 08-09).

## Hecho en este turno

- UI probe + offline panel + download ZIP; sin `window.print` silencioso.
- `panel/static/print-bridge.zip` embebido; live en panel DO.
- EXPERIENCEBT print-bridge: `762f615` (ZIP pack, CORS, job name, set-ql-media).

## A medias / siguiente

- Cada PC recepción: ZIP → `start.cmd` (+ opcional `set-ql-media.ps1`).
- **Rotar password root DO**.
- Nombre de plantel en gafete estudiante (decisión cliente).

## No tocar

- Terror / Hetzner app code (salvo print-bridge en EXPERIENCEBT-app).
- Recrear `accesos_api` sin `SCAN_API_KEY`.
- Secretos en git / no guardar password DO en repo.
