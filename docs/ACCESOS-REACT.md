# FICTI Accesos — React en panel (DO)

**Actualizado 2026-09-05:** consola de accesos profesional en
`https://panel.experiencebt.com.mx/accesos` (EVENTO-ELISA `panel/ui`).

| Host | Rol |
|------|-----|
| `panel.experiencebt.com.mx` | Registros Flask + **Accesos React** (auth de sesión) |
| `demo.experiencebt.com.mx` | Registro público + `/escanear` (requiere `X-Scan-Key`) |
| Hetzner terror | Nest boletera — **aparte** |

## Módulos
- Resumen / “qué hacer ahora” + pulso
- Escáner ENTRY/EXIT/reingreso + zonas/aforo (solo `interno`)
- Cámara web (BarcodeDetector) + cola offline local
- Buscar → **vista previa del boleto** → imprimir 5×8 (React `@media print` + PDF)
- Informes + filtros (zona/modo/ok) + reingresos + CSV/Excel + refresco en vivo
- Zonas Acreditación / VIP

## Demo PDA ↔ aforo
`POST /api/escanear` acepta `zona` y actualiza `accesos_zonas.dentro` (misma DB
que el panel). `GET /api/zonas` con `X-Scan-Key` alimenta el selector del PDA.

## Boleto 5×8
- Cara oscura FICTI / Tech Capital, nombre grande, QR en placa blanca, marcas de corte
- `GET /api/accesos/gafete/<tipo>/<id>` → JSON + QR (preview React)
- `GET /api/accesos/gafete/<tipo>/<id>.pdf` → PDF print-ready (`panel/gafete_pdf.py`)

## Seguridad
- `/api/accesos/*` exige sesión panel + Origin/Referer same-site + rate limit
- Demo `/api/escanear` y `/api/zonas` exigen `SCAN_API_KEY` (`X-Scan-Key`); fail-closed en https
- Cookies `HttpOnly` + `Secure` + `SameSite=Lax`
- Cabeceras `X-Frame-Options`, `nosniff`, `Referrer-Policy`
- `Permissions-Policy: camera=(self)` para escáner; mic/geo cerrados
- Cola offline **no** cuenta como acceso confirmado hasta sync OK
