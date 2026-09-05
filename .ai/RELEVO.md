# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** main

## 3 líneas
Boleto 5×8 rediseñado (FICTI/Tech Capital oscuro, QR en placa, marcas de corte) + preview React `@media print`. Accesos más amigable (guías, CTAs, copy ES). Deploy DO ok.

## Hecho
- `panel/gafete_pdf.py`: cara profesional branded; JSON `GET /gafete/<tipo>/<id>` + PDF.
- React: `BoletoFace` + `BoletoPrintModal` (preview → imprimir / PDF).
- UX: Resumen “qué hacer ahora”, Buscar pasos 1-2-3, Escáner/Informes/Zonas/nav más claros.
- Docs `ACCESOS-REACT.md`; deploy panel+demo DO.

## Smoke DO
- panel login/accesos 200; api anon 401; demo scan anon 401
- JS live con “Vista previa del boleto” / “Imprimir boleto”
- `gafete_pdf.construir` en contenedor ~33 KB

## A medias / residual
- Demo PDA no actualiza aforo de zonas (sí el panel escáner).
- Sin cámara web en escáner (teclado/USB zebra).
- Adam debe guardar `SCAN_API_KEY` del `.env` DO en los PDA.

## No tocar
Terror Hetzner; cutover DNS; secretos en git.
