# FICTI Accesos — React en panel (DO)

**Actualizado 2026-09-04:** Accesos FICTI vive en **React + TypeScript** en
`https://panel.experiencebt.com.mx/accesos` (EVENTO-ELISA `panel/ui`).

| Host | Rol |
|------|-----|
| `panel.experiencebt.com.mx` | Flask registros/Excel + SPA Accesos React |
| `demo.experiencebt.com.mx` | Registro público + `/escanear` (PDA) |
| Hetzner terror | Boletera Nest — **aparte**; se deja intacta |

## Módulos Accesos (`/accesos`)
- Pulso / KPIs
- Escáner ENTRY/EXIT + **reingreso** + zonas/aforo (solo `interno`)
- Búsqueda rápida + impresión gafete **5×8** (solo `interno`)
- Informes + CSV/Excel (`interno` y `promotor`)
- Zonas Acreditación / VIP

No hay iframe Nest, no hay proxy a Hetzner, no hay UI Accesos en Jinja.
