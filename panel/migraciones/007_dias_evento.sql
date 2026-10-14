-- Evento de tres días: todo se agrupa por la fecha local (America/Mexico_City)
-- en que ocurrió y el aforo de cada zona se cuenta por día. Idempotente.
-- También lo aplica en el arranque panel/accesos-api ensureIndexes().

-- Fecha local indexable: `timezone(text, timestamptz)` es IMMUTABLE en Postgres,
-- así que la expresión sirve de índice y de columna de agrupación sin guardar nada.
CREATE INDEX IF NOT EXISTS accesos_escaneos_fecha_idx
  ON accesos_escaneos (((creado AT TIME ZONE 'America/Mexico_City')::date), creado DESC);

-- Último escaneo aceptado de cada persona (estado dentro/fuera del día).
CREATE INDEX IF NOT EXISTS accesos_escaneos_persona_ok_idx
  ON accesos_escaneos (tipo, registro_id, creado DESC)
  WHERE ok;

CREATE INDEX IF NOT EXISTS accesos_impresiones_fecha_idx
  ON accesos_impresiones (((creado AT TIME ZONE 'America/Mexico_City')::date));

CREATE INDEX IF NOT EXISTS accesos_altas_sitio_fecha_idx
  ON accesos_altas_sitio (((creado AT TIME ZONE 'America/Mexico_City')::date));

CREATE INDEX IF NOT EXISTS correo_envios_fecha_idx
  ON correo_envios (((creado AT TIME ZONE 'America/Mexico_City')::date));

-- `dentro` solo vale para el día en que se contó: al primer escaneo de otro día
-- el contador arranca en 0 (ver scan.ts). Sin esta columna el aforo del día 1
-- seguiría ocupado el día 2.
ALTER TABLE accesos_zonas ADD COLUMN IF NOT EXISTS dentro_fecha DATE;
