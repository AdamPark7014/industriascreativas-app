# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-03
- **Rama:** main

## Mapa rápido: quién sirve qué

`demo.experiencebt.com.mx` **no vive en el servidor Hetzner** (5.78.215.109, que
ahora sirve la plataforma ExperienceBT: `terror.`, `taquilla.terror.` y
`manager.terror.`). Vive en el droplet DigitalOcean `147.182.128.128`:

- `/etc/nginx/conf.d/zz-demo.conf` dentro del contenedor `nginx_registro_proxy`
  → `proxy_pass http://eventos_demo_web:5000`. La copia versionada de ese
  archivo es `deploy/zz-demo.conf`.
- `eventos_demo_web` = imagen `eventos-demo-web:latest`, construida desde
  `/opt/EVENTOS-app` con `docker-compose.demo.yml`. Es el `Dockerfile` de la
  raíz: build de la SPA Vite (`web/`) + Flask (`backend/`) servido por gunicorn.
- Ese `/opt/EVENTOS-app` es este repo (`AdamPark7014/EVENTOS-app`).
- El panel es otro contenedor, `eventos_panel_web` → `panel.experiencebt.com.mx`.
- Script de subida: `C:\dev\scripts\registro-deploy\deploy_demo_getzy.py`
  (paramiko, necesita `REGISTRO_SSH_PASSWORD`).

## Hecho en este turno

Cambio de marca pedido por el cliente (Getzy) vía Adam, con tres instrucciones y
cuatro PNG. Todo en `web/`.

1. **Logo FICTI: de blanco a rosa.**
   - `web/public/ficti-logo.png` ← `Logotipo_FICTI_2026-06.png` (3191×1309,
     RGBA con alfa). El blanco anterior queda como
     `web/public/ficti-logo-blanco.png` por si hay que revertir.
   - Sin cambio de código: `AppShell.tsx` ya apuntaba a `/ficti-logo.png`.

2. **Logo Gabor: de blanco al original rojo con negro, sobre un cintillo.**
   - `web/public/gabor-logo-footer.png` ← `Logo Gabor-01.png` (2250×1020, RGBA).
     `gabor-logo-footer-white.png` se queda intacto como respaldo.
   - El negro del logo se perdía sobre el fondo oscuro del sitio; por eso el
     cliente pidió el cintillo. El pie pasó de una `<img>` suelta a
     `.brandBand`: banda **a sangre** en turquesa `$band-teal` (#12b5b0, el
     `$teal` que ya estaba en la paleta), con el logo centrado. El negro sobre
     esa banda contrasta ≈ 8:1, que era justo el problema a resolver.
   - `.siteFooter` perdió su `padding` propio para que la banda llegue de borde
     a borde, y `.footerLogo` perdió el `opacity: .95` (sobre fondo claro solo
     restaba contraste).

3. **Circuitos verdes sobre el cintillo.**
   - **Van en SVG, no como los PNG que mandó el cliente.** `CIRCUITO 1.png` y
     `CIRCUITO 2.png` vienen en **RGB sin canal alfa**, sobre fondo negro
     sólido: puestos sobre la banda turquesa se verían como dos cajas negras.
     Comprobado leyendo la cabecera IHDR de los PNG, no a ojo.
   - Componente `BandCircuit` en `AppShell.tsx`, al lado del `Circuit` que ya
     existía para el home. Trazos horizontales con codos de 45° y nodos llenos
     y huecos, que es el lenguaje de la referencia. Color `$band-circuit`
     (#8ce818) y `drop-shadow` para el neón.
   - **CIRCUITO 2 = izquierda, CIRCUITO 1 = derecha**, confirmado contra el
     arte: en el 2 las líneas entran a ras del borde izquierdo, en el 1 terminan
     a ras del derecho. La variante derecha es la misma reflejada con
     `scaleX(-1)`, igual que ya hacía `.circuitRight`.
   - A ≤640 px los circuitos se ocultan y la banda baja a 58 px, para que no
     compitan con el logo.

Tokens nuevos en `_tokens.scss`: `$band-teal` y `$band-circuit`.

Verificado: `npm run build` limpio (`tsc -b` + `vite build`), home y
`/empresarios` revisados en el navegador a 1440 px y a 375 px sin errores de
consola, y medidas leídas del DOM (banda `rgb(18,181,176)` a 76 px, circuitos
`rgb(140,232,24)` con el derecho en `matrix(-1,0,0,1,0,0)`, ambos logos con su
tamaño natural correcto).

## Cómo levantar esto en local (importante)

El proyecto vive bajo `C:\dev\apps\NO TOCAR LIBREMENTE\`, y **el espacio en la
ruta rompe Vite 8 / rolldown**: `npm run build` falla con
`Cannot resolve entry module ...\vite.config.ts`. No es un fallo del código.

Se sortea con una junction sin espacios (`New-Item -ItemType Junction -Path
C:\dev\_scratch\elisa-web -Target "C:\dev\apps\NO TOCAR LIBREMENTE\
EVENTO-ELISA-app\web"`). Desde `C:\dev\_scratch\elisa-web` funcionan
`npx vite build` y `npx vite` (dev en 5173). `C:\dev\.claude\launch.json` →
entrada `registro-demo` ya apunta ahí. La ruta 8.3 (`NOTOCA~1`) **no sirve**:
arranca, pero Vite devuelve 403 porque el allow-list de `server.fs` compara
contra la ruta larga.

En este turno `npm run build` sí corrió directo desde la ruta con espacios sin
fallar. La junction sigue siendo el camino seguro si vuelve a aparecer.

## Desplegado

**En producción en `demo.experiencebt.com.mx` desde el 2026-09-04.** Subido con
`deploy_demo_getzy.py` contra el droplet **147.182.128.128**.

Verificado en vivo: `demo_home=200`, `prod=200` (el Flask de la raíz, intacto) y
los cuatro PNG a 200. Los hashes servidos (`index-Bv1LTyWi.js`,
`index-ou7-9GxY.css`) son exactamente los del build local revisado. Home
repasado en el navegador contra el dominio real.

**Copia de la base:** `/root/db-backups/bd_demo_post_cintillo_20260904.sql.gz`
(240 KB). Datos intactos y creciendo: **379 empresarios y 228 alumnos** (eran
290/175 el 01-09). Esto se llena solo: es producción de verdad.

## A medias - CUIDADO

- **La tarjeta dice "Público General" pero el flujo detrás sigue siendo el de
  empresa.** Al pulsarla se llega a `/empresarios`, que abre con el antetítulo
  "Acreditación corporativa", el título "Registro Empresa" y un campo **Empresa
  obligatorio**. Está así en vivo desde el 01-09. **Falta decidir con Adam si el
  cambio de nombre es solo del botón o de todo el flujo** (formulario, correos y
  gafete rotulan "empresario" en el backend).
- **`demo.` no es un juguete: tiene usuarios reales**, con altas cada día.
  Cualquier despliegue aquí es producción; hacer copia de la base antes.
- El cliente puede pedir los circuitos **más discretos**: el arte original es
  neón brillante y así se dejó, pero en su mockup se ven más apagados. Se ajusta
  con la opacidad o el `drop-shadow` de `.bandCircuit`, sin tocar el trazo.
- Las capturas headless de Chrome por debajo de ~500 px **recortan** en vez de
  escalar. No fiarse de ellas para revisar móvil; medir en el navegador.
- Tras un despliegue, la primera captura del home puede salir **sin imágenes**:
  es el navegador, que aún no las ha decodificado, no un 404. Comprobar por red
  antes de dar por roto nada.
- El automatizador del navegador **no dispara el Enter** de forma que React lo
  vea. Para probar el escáner hay que despachar el evento a mano:
  `inp.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`.
- `crear_pdf_gafete_elisa()` escribe en `backend/gafetes_guardados/` como efecto
  secundario. Viene de antes, pero conviene saberlo al probar en local.

## Siguiente paso

1. Enseñarle el cintillo al cliente y ajustar la intensidad de los circuitos si
   lo pide (ver "A medias").
2. **Decidir el alcance de "Público General"**: si solo era el botón, se queda
   como está; si es de producto, hay que tocar `EmpresariosPage.tsx`, las
   etiquetas del formulario, los correos y el rótulo del gafete en
   `backend/app.py`. Es lo único incoherente en vivo.
3. Retirar la Gala Elisa: Adam ya lo pidió ("vuélales Elisa", 03-09). El demo y
   el panel **se quedan**; lo que se va es el flujo `/eventoelisa` y su rastro.
   Plan en `docs/EVENTO-ELISA.md`. Antes de borrar nada: este repo tiene
   **commits locales que no están en `origin/main`** y 84 MB en
   `gafetes_guardados/` — respaldo (`git bundle` + tar) primero.
4. Cuando el demo migre al Hetzner, llevar esta misma marca a
   `EXPERIENCEBT-app/apps/registro-web` (`PartnerHeader.tsx`, `SiteFooter.tsx`,
   `BrandMark.tsx`), que hoy usa `mix-blend-mode: lighten` sobre PNG blancos —
   incompatible con logos a color. Ese `registro-web` **todavía no está** en
   `deploy/experiencebt-platform.yml`: no tiene servicio ni router.

## No tocar

- `backend/.env` del droplet: no está en el repo y no se sube (`SKIP_NAMES`).
  Ahí vive la API key de Brevo.
- El prefijo `ELISA_CARRILLO-` del escáner: es lo último que se retira, y solo
  si se confirma que no queda ningún boleto impreso en circulación.
- Las filas antiguas sin `FechaRegistro`: son NULL a propósito, no rellenar.
- `registro_staging_*` en el droplet: es el stack TypeScript sin enrutar, ajeno
  a este trabajo.
- El PNG del banner: es el arte del cliente con alfa. Si se reexporta sin
  transparencia, aparece una caja blanca sobre el fondo oscuro.
- `ficti-logo-blanco.png` y `gabor-logo-footer-white.png`: son la única copia de
  los logos monocromos anteriores. Son el camino de vuelta si el cliente se
  arrepiente.

## Deuda de seguridad (para Adam, no la toca ningún agente)

La contraseña de root del droplet viaja en texto plano cada vez que se despliega
(`REGISTRO_SSH_PASSWORD`) y se compartió por chat el 03-09. Conviene **rotarla**
e instalar en el droplet la llave pública que ya existe
(`~/.ssh/id_ed25519_nexara_hetzner.pub`), para que los despliegues dejen de
necesitar contraseña.
