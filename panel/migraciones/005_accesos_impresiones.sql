-- Registro de boletos impresos (auditoría y "deshacer impresión"). Idempotente.
-- También lo aplica en el arranque panel/accesos-api ensureIndexes().

CREATE TABLE IF NOT EXISTS accesos_impresiones (
    id           SERIAL PRIMARY KEY,
    tipo         VARCHAR(20)  NOT NULL,
    registro_id  INTEGER      NOT NULL,
    folio        VARCHAR(40)  NOT NULL,
    via          VARCHAR(12)  NOT NULL DEFAULT 'ql',   -- ql | chrome | pdf | test
    impresora    VARCHAR(120),
    modo_color   VARCHAR(12),                          -- mono | redblack | NULL
    job_id       INTEGER,
    operador     VARCHAR(120),
    dispositivo  VARCHAR(120),
    creado       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS accesos_impresiones_reg_creado_idx
  ON accesos_impresiones (tipo, registro_id, creado DESC);
CREATE INDEX IF NOT EXISTS accesos_impresiones_creado_idx
  ON accesos_impresiones (creado DESC);
