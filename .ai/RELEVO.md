# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-08
- **Rama:** main
- **HEAD:** 4287fc0 — fix(print) 62×100 mm QL-800

## 3 líneas
Gafete Accesos FICTI **62×100 mm** live en DO (`panel.experiencebt.com.mx`).
Rebuild `panel_web` + `accesos_api` en `/opt/EVENTOS-app` (imagen ya traía el
CSS; contenedores recreados). Adam: Chrome papel «62mm Cinta continua».

## Qué dejó el turno anterior y sigue en pie

- Pop-up área de interés, Edad, áreas por marca, institución tipo+carrera+competencia.
- Panel muestra respuestas del pop-up + ranking combinado.
- Accesos API TS/Hono en DO; Flask fuera del path Accesos.
- 275 alumnos / 557 empresarios (conteo del 08-09).

## Hecho en este turno

- Confirmado en host `/opt/EVENTOS-app`: `boleto-face.css` `@page size: 62mm 100mm`.
- Confirmado en imagen: `/app/ui/dist/assets/index-BO8gxu7P.css` contiene `62mm`.
- `docker compose -f panel/docker-compose.panel.yml build/up panel_web accesos_api`
  (con `.env` / `SCAN_API_KEY`). Contenedores recreados 2026-09-08 ~22:40Z.
- Smoke: health Accesos TS 200; `/accesos/buscar` 302 (login); `-L` 200.

## A medias / siguiente

- Adam en Chrome: 1 hoja, papel **62mm Cinta continua**, márgenes ninguno, pies OFF; Ctrl+F5.
- **Rotar password root DO** (expuesto en chat).
- Nombre de plantel en gafete estudiante (decisión cliente).

## No tocar

- Terror / Hetzner (`EXPERIENCEBT-app`).
- Recrear `accesos_api` sin conservar `SCAN_API_KEY` real.
- Secretos en git / no guardar password DO en repo.
