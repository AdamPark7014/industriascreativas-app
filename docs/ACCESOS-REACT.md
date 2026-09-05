# FICTI Accesos — React en panel (DO)

**Actualizado 2026-09-04:** consola de accesos profesional en
`https://panel.experiencebt.com.mx/accesos` (EVENTO-ELISA `panel/ui`).

| Host | Rol |
|------|-----|
| `panel.experiencebt.com.mx` | Registros Flask + **Accesos React** (auth de sesión) |
| `demo.experiencebt.com.mx` | Registro público + `/escanear` (requiere `X-Scan-Key`) |
| Hetzner terror | Nest boletera — **aparte** |

## Módulos
- Resumen / pulso
- Escáner ENTRY/EXIT/reingreso + zonas/aforo (solo `interno`)
- Buscar e imprimir gafete **5×8** (solo `interno` imprime)
- Informes + CSV/Excel (`interno` y `promotor`)
- Zonas Acreditación / VIP

## Seguridad
- `/api/accesos/*` exige sesión panel + Origin/Referer same-site + rate limit
- Demo `/api/escanear` exige `SCAN_API_KEY` (`X-Scan-Key`); fail-closed en https
- Cookies `HttpOnly` + `Secure` + `SameSite=Lax`
- Cabeceras `X-Frame-Options`, `nosniff`, `Referrer-Policy`
