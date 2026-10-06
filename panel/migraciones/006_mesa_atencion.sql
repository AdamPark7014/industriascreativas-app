-- Mesa de atención: altas en sitio, correos del boleto y descargas del PDF. Idempotente.
-- También lo aplican en el arranque panel/accesos-api ensureIndexes() y
-- backend/app.py ensure_schema() (este último solo correo_envios y boleto_descargas).

-- Quién dio de alta en sitio a cada persona (la mesa de registro solo reimprime lo suyo).
CREATE TABLE IF NOT EXISTS accesos_altas_sitio (
    id           SERIAL PRIMARY KEY,
    tipo         VARCHAR(20)  NOT NULL,
    registro_id  INTEGER      NOT NULL,
    operador     VARCHAR(120) NOT NULL,
    dispositivo  VARCHAR(120),
    creado       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (tipo, registro_id)
);

CREATE INDEX IF NOT EXISTS accesos_altas_sitio_operador_idx
  ON accesos_altas_sitio (operador, creado DESC);

-- Cada correo con el boleto digital que salió por Brevo.
CREATE TABLE IF NOT EXISTS correo_envios (
    id           SERIAL PRIMARY KEY,
    tipo         VARCHAR(20)  NOT NULL,
    registro_id  INTEGER      NOT NULL,
    correo       VARCHAR(200) NOT NULL,
    motivo       VARCHAR(20)  NOT NULL,                -- confirmacion | reenvio | alta_sitio
    operador     VARCHAR(120),
    ok           BOOLEAN      NOT NULL,
    error        VARCHAR(300),
    message_id   VARCHAR(200),
    creado       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS correo_envios_reg_idx
  ON correo_envios (tipo, registro_id, creado DESC);
CREATE INDEX IF NOT EXISTS correo_envios_creado_idx
  ON correo_envios (creado DESC);

-- Descargas del PDF desde el botón del correo (/boleto/<token> en backend/app.py).
CREATE TABLE IF NOT EXISTS boleto_descargas (
    id           SERIAL PRIMARY KEY,
    tipo         VARCHAR(20)  NOT NULL,
    registro_id  INTEGER      NOT NULL,
    ip           VARCHAR(64),
    agente       VARCHAR(200),
    creado       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS boleto_descargas_reg_idx
  ON boleto_descargas (tipo, registro_id, creado DESC);
