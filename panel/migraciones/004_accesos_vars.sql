-- Variables de control de acceso ampliadas (códigos, dispositivo, latencia, bloqueos, ventanas).
-- Idempotente.

ALTER TABLE accesos_escaneos
  ADD COLUMN IF NOT EXISTS codigo VARCHAR(40),
  ADD COLUMN IF NOT EXISTS dispositivo VARCHAR(60),
  ADD COLUMN IF NOT EXISTS server_ms INTEGER,
  ADD COLUMN IF NOT EXISTS client_ms INTEGER;

ALTER TABLE accesos_zonas
  ADD COLUMN IF NOT EXISTS hora_inicio TIME,
  ADD COLUMN IF NOT EXISTS hora_fin TIME,
  ADD COLUMN IF NOT EXISTS zona_requerida BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS accesos_bloqueos (
    id           SERIAL PRIMARY KEY,
    tipo         VARCHAR(20)  NOT NULL,
    registro_id  INTEGER      NOT NULL,
    motivo       VARCHAR(160) NOT NULL DEFAULT '',
    activo       BOOLEAN      NOT NULL DEFAULT TRUE,
    creado       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (tipo, registro_id)
);

CREATE INDEX IF NOT EXISTS accesos_escaneos_codigo_idx
  ON accesos_escaneos (codigo, creado DESC);
CREATE INDEX IF NOT EXISTS accesos_escaneos_dispositivo_idx
  ON accesos_escaneos (dispositivo, creado DESC)
  WHERE dispositivo IS NOT NULL AND dispositivo <> '';
CREATE INDEX IF NOT EXISTS accesos_escaneos_server_ms_idx
  ON accesos_escaneos (creado DESC)
  WHERE server_ms IS NOT NULL;
