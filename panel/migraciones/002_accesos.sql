-- Control de accesos FICTI (panel React). Idempotente.
-- Lo corre seed.py dentro de su transacción (sin BEGIN/COMMIT propios).

CREATE TABLE IF NOT EXISTS accesos_zonas (
    id         SERIAL PRIMARY KEY,
    clave      VARCHAR(40)  NOT NULL UNIQUE,
    nombre     VARCHAR(80)  NOT NULL,
    aforo      INTEGER      NOT NULL DEFAULT 0,
    dentro     INTEGER      NOT NULL DEFAULT 0,
    activo     BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS accesos_escaneos (
    id           BIGSERIAL PRIMARY KEY,
    creado       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tipo         VARCHAR(20)  NOT NULL,
    registro_id  INTEGER      NOT NULL,
    nombre       VARCHAR(200) NOT NULL DEFAULT '',
    modo         VARCHAR(12)  NOT NULL,
    ok           BOOLEAN      NOT NULL,
    mensaje      VARCHAR(160) NOT NULL DEFAULT '',
    zona_clave   VARCHAR(40),
    origen       VARCHAR(20)  NOT NULL DEFAULT 'panel',
    operador     VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS accesos_escaneos_creado_idx
    ON accesos_escaneos (creado DESC);
CREATE INDEX IF NOT EXISTS accesos_escaneos_ok_idx
    ON accesos_escaneos (ok, modo);

INSERT INTO accesos_zonas (clave, nombre, aforo)
VALUES
    ('acreditacion', 'Acreditación', 2500),
    ('vip', 'VIP', 180)
ON CONFLICT (clave) DO NOTHING;
