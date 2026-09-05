# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** main

## 3 líneas
FICTI Accesos vuelve a ser **nativo en el panel Flask DO**. Se quitó el proxy/iframe Nest→Hetzner. `demo` = registro + `/escanear`; terror Nest no se toca.

## Hecho
- `zz-panel.conf` (+ssl): solo Flask `eventos_panel_web` — sin locations Nest/`manager.terror`.
- Quitado `NEST_ACCESS_BASE_URL`, iframe `/embed/access`, deep-links Nest.
- Vista Accesos mínima: KPIs asistencias/confirmados + botón a `demo…/escanear`.
- Deploy DO: rebuild `eventos_panel_web`, nginx sin terror proxy.

## Smoke
- `panel…/login` 200
- `panel…/embed/access` → **404 Flask** (ya no Nest)
- `panel…/scanner` → **404 Flask**
- `demo…/escanear` 200 (intacto)
- `manager.terror…/scanner` 200 (intacto)

## Frontera
| Host | Rol |
|------|-----|
| `panel.` | FICTI ops Flask |
| `demo.` | FICTI registro + escáner |
| Hetzner terror | boletera Nest — aparte |

## No tocar
Cutover DNS panel/demo a Hetzner; secretos; mezclar FICTI con Nest.
