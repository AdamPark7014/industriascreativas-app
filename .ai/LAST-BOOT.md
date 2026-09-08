# LAST-BOOT FUSION — 2026-09-08 16:44:43

Surface: **cursor**
Repo: `C:/dev/apps/NO TOCAR LIBREMENTE/EVENTO-ELISA-app`
Perfil: **generic**
Tier: **CURSOR**
Task: Fix Accesos 29x90 Brother mismatch; PDF+CSS 62x100 + optional print-bridge

## Tools de este proyecto
- relevo
- project-index
- rg
- git
- worktree-new
- ollama:qwen2.5-coder:7b
- open-webui


## Rol
ROL: CURSOR = EJECUTOR + DIRECTOR DE WORKERS (implementa hiper-rapido y profesional).

ORDEN DE PROCESO OBLIGATORIO EN ESTE CHAT:
1. PRIMERA accion de shell (antes de editar):
   pwsh -File C:\dev\scripts\ai-os\boot-fusion.ps1 -Surface cursor -Mode text -Task "<resumen de la peticion>"
2. Respetar RELEVO (sucio → salvar -Agente cursor).
3. NO hay EXEC-PACKET. Si la tarea es arquitectura/HARD: pide a Adam abrir Claude Max/Code primero O genera un mini-packet en .ai/EXEC-PACKET.md y luego ejecuta.
4. Desglosa el trabajo en instrucciones hiperdetalladas para workers:
   - LOCAL/Ollama (qwen2.5-coder:7b) → boilerplate/classify/embed
   - NO_LLM → rg/git/tests/lint/build/playwright
   - Qwen Code / otros → solo research read-only en worktree aparte
5. Un writer por worktree. Nunca 5 agentes en la misma carpeta.
6. Tras implementar: tests/typecheck → actualizar RELEVO → cerrar.
7. Si falla algo estructural: escalar a Claude (no inventar arquitectura a ciegas).

Tier detectado: CURSOR
Perfil proyecto: generic
Tools recomendados: relevo, project-index, rg, git, worktree-new, ollama:qwen2.5-coder:7b, open-webui
Open WebUI: http://127.0.0.1:3000 | Ollama: http://127.0.0.1:11434

## Pipeline
```
Claude Max/Code (CABEZA)
        │  escribe .ai/EXEC-PACKET.md
        ▼
Cursor Ultra (EJECUTOR)
        │  desglosa workers hiperdetallados
        ├── NO_LLM tools
        ├── Ollama qwen2.5-coder:7b
        ├── MCP / Playwright / Firecrawl (si aplica)
        └── tests → relevo cerrar
```

## Relevo (disco)
```
=== RELEVO Claude/Cursor - estado real del proyecto ===
Repo : C:\dev\apps\NO TOCAR LIBREMENTE\EVENTO-ELISA-app
Rama : main

--- Ultimos commits (que agente los hizo) ---
4e490af  2026-09-08  [cursor     ] deploy DO Accesos QL-800 62x100 live
4287fc0  2026-09-08  [cursor     ] fix(print): gafete Accesos 62x100mm cinta continua QL-800 (CSS+PDF)
88f3eec  2026-09-08  [claude-code] panel: respuestas del pop-up visibles en listado y desglose combinado en el tablero
5fb98d7  2026-09-07  [claude-code] Cambios cliente: pop-up area de interes, Edad, areas por marca, institucion tipo+carrera+competencia, gafete por tipo; fix migraciones que nunca corrian en prod
58e0e4d  2026-09-05  [cursor     ] Accesos: variables completas + QR hiper-rapido (server p50~2ms)
257e51b  2026-09-05  [cursor     ] Accesos API a TypeScript Hono en DO; Flask fuera del path
ad6edb2  2026-09-05  [cursor     ] Accesos: aforo demo PDA, camara+offline, informes zona/reingreso
586e2ca  2026-09-04  [cursor     ] Boleto 5x8 profesional FICTI + UX Accesos amigable (preview React print)
6a469dc  2026-09-04  [cursor     ] Accesos React profesional + harden auth/scan key en DO
d715995  2026-09-04  [rescatado-por-cursor] WIP: rescate de trabajo sin commitear (2026-09-04 20:25)
3778886  2026-09-04  [rescatado-por-cursor] WIP: rescate de trabajo sin commitear (2026-09-04 20:23)
ae530dc  2026-09-04  [cursor     ] Accesos FICTI nativo DO; quitar Nest/Hetzner proxy

--- Sin commitear ahora mismo ---
(limpio)

--- .ai/RELEVO.md ---
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



```

Arsenal: C:\Users\adpoz\Projects\ai-oss-2026
Protocolo: C:\dev\scripts\ai-os\FUSION-PROTOCOL.md
