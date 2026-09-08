# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-08
- **Rama:** main
- **HEAD:** (cerrar) — Accesos QL bridge + isolated print

## 3 líneas
El 29×90 **no** venía del CSS/PDF (ya 62×100 en DO). Chrome no fija el form
Brother → Windows default die-cut. Live: botón **Imprimir en QL (agente local)**
+ ventana aislada 62×100. Asset JS `index-pqSu77-R.js`.

## Qué dejó el turno anterior y sigue en pie

- Pop-up área de interés, Edad, áreas por marca, institución.
- Accesos API TS/Hono en DO.
- 275 alumnos / 557 empresarios (conteo 08-09).

## Hecho en este turno

- Root cause: spooler Windows remapea a **29×90** (preferencias QL); app ya era 62×100.
- Accesos: print aislado `Gafete 62x100 mm` + **Imprimir en QL** → PNG a
  `127.0.0.1:9631/print-label`.
- Deploy DO `panel_web`+`accesos_api`: sin 29mm/90mm/5in/8in; health Accesos OK.
- Docs `ACCESOS-REACT.md` actualizado.

## A medias / siguiente

- Adam: `tools/print-bridge/start.cmd` en la PC QL → Accesos → **Imprimir en QL**.
- Una vez: Impresoras → QL-800 → Preferencias → **62mm Cinta continua**.
- **Rotar password root DO** (sigue en `.ai/_ssh_do.py` — no reusar).
- Nombre de plantel en gafete estudiante (decisión cliente).

## No tocar

- Terror / Hetzner (`EXPERIENCEBT-app` app code salvo print-bridge docs ya tocado).
- Recrear `accesos_api` sin `SCAN_API_KEY`.
- Secretos en git / no guardar password DO nuevo en repo.
