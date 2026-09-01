# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-01
- **Rama:** main

## Mapa rápido: quién sirve qué

`demo.experiencebt.com.mx` **no vive en el servidor Hetzner** (5.78.215.109,
que es Pumpkin/`app.` y compañía). Vive en el droplet DigitalOcean
`147.182.128.128`:

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

Cambios de home pedidos por Adam sobre la referencia visual del cliente.

1. **Banner "Regístrate sin costo" en el home.**
   - Asset nuevo: `web/public/registrate-sin-costo.png`. Sale del original
     `~/Downloads/FICTI_registro.png` (2999x1056, 854 KB), reescalado a
     1200x423 y 221 KB. **Es PNG con alfa**: la mascota desborda la barra rosa
     y el fondo transparente es lo que hace que encaje en el tema oscuro.
   - Va como primer hijo de `.homeSide`, encima de las tarjetas, que es donde
     lo colocó la referencia del cliente.
   - `.homeBanner` en `flow.module.scss`: sin caja ni fondo propios, ancho
     100 % y márgenes verticales negativos para comer el aire transparente del
     arte. A ≤980 px se centra con `max-width: 520px`.

2. **La tarjeta de Empresa pasa a "Público General / Registro Gratuito".**
   - Solo cambia el texto: la ruta sigue siendo `/empresarios`, el icono y el
     rosa `$rosa-tech` se quedan como estaban.
   - **`.homeCardText strong` baja a 1.3rem por debajo de 480 px.** "Público
     General" no cabe en un renglón a 1.5rem en un móvil de 375 px (necesita
     186 px y tiene 176 px), y partido en dos dejaba la tarjeta más alta que la
     de Estudiante. Medido en el navegador, no a ojo.

Verificado: `tsc -b`, `vite build` y `oxlint` limpios; home revisado a 1440 px
y a 375 px, las dos tarjetas casan en altura y el PNG carga 200.

## Cómo levantar esto en local (importante)

El proyecto vive bajo `C:\dev\apps\NO TOCAR LIBREMENTE\`, y **el espacio en la
ruta rompe Vite 8 / rolldown**: `npm run build` falla con
`Cannot resolve entry module ...\vite.config.ts`. No es un fallo del código.

Se sortea con una junction sin espacios:

```
New-Item -ItemType Junction -Path C:\dev\_scratch\elisa-web `
         -Target "C:\dev\apps\NO TOCAR LIBREMENTE\EVENTO-ELISA-app\web"
```

Desde `C:\dev\_scratch\elisa-web` funcionan `npx vite build` y `npx vite`
(dev en 5173). `C:\dev\.claude\launch.json` → entrada `registro-demo` ya apunta
ahí; antes apuntaba a `C:/dev/apps/EVENTO-ELISA-app/web`, que ya no existe.
La ruta 8.3 (`NOTOCA~1`) **no sirve**: arranca, pero Vite devuelve 403 porque
el allow-list de `server.fs` compara contra la ruta larga.

## A medias - CUIDADO

- **Esto NO está desplegado.** Los cambios son solo locales y commiteados.
- **Adam pidió desplegar con `ssh -i ...id_ed25519_nexara_hetzner -p 2222
  root@5.78.215.109`, y ese es el servidor equivocado para esta app.**
  Comprobado por DNS el 2026-09-01:
  `demo.experiencebt.com.mx`, `experiencebt.com.mx` y `panel.` → **147.182.128.128**
  (droplet DigitalOcean); solo `app.experiencebt.com.mx` → 5.78.215.109 (Hetzner,
  Pumpkin). Subir esto a Hetzner no cambiaría nada en `demo.` y tocaría una
  máquina ajena. **Pendiente de que Adam confirme.**
- El camino correcto es `C:\dev\scripts\registro-deploy\deploy_demo_getzy.py`
  (paramiko contra 147.182.128.128, pide `REGISTRO_SSH_PASSWORD`). Ojo: su
  constante `ROOT` sigue apuntando a `C:\dev\apps\evento-elisa-app`, ruta que ya
  no existe desde que el proyecto se movió a `NO TOCAR LIBREMENTE`. **Hay que
  corregirla antes de usarlo o subirá desde una carpeta inexistente.**
- **`demo.` no es un juguete: tiene usuarios reales.** El 2026-08-27 había 196
  empresarios y 102 alumnos, con altas de esa misma mañana. Cualquier despliegue
  aquí es producción; hacer copia de la base antes.
- Las capturas headless de Chrome por debajo de ~500 px **recortan** en vez de
  escalar. No fiarse de ellas para revisar móvil; medir en el navegador.
- El automatizador del navegador **no dispara el Enter** de forma que React lo
  vea. Para probar el escáner hay que despachar el evento a mano:
  `inp.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`.
- `crear_pdf_gafete_elisa()` escribe en `backend/gafetes_guardados/` como efecto
  secundario. Viene de antes, pero conviene saberlo al probar en local.

## Siguiente paso

1. **Confirmar con Adam el servidor de despliegue** (ver "A medias"). Si es el
   droplet, arreglar `ROOT` en `deploy_demo_getzy.py`, hacer copia de la base y
   desplegar con él.
2. El texto "Empresa / Acreditación corporativa" **sigue vivo dentro del flujo**:
   `EmpresariosPage.tsx` abre con el antetítulo "Acreditación corporativa" y el
   backend rotula los correos y el gafete como empresario. Si el cambio de
   nombre es de producto y no solo del botón, hay que decidir hasta dónde llega.
3. Confirmar con el cliente el verde del **gafete impreso**. Si ya hay material
   impreso en azul, revertir `COLOR_VERDE_FICTI` en `backend/app.py` y
   `$ticket-verde` en `badge.module.scss`; el front puede quedarse verde.
4. Retirar la Gala Elisa cuando FICTI cierre. Plan completo en
   `docs/EVENTO-ELISA.md`.

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
