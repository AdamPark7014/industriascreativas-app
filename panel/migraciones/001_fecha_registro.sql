-- Hora de registro en el panel.
--
-- Las tres tablas nunca guardaron cuándo se registró cada persona: no existe
-- ninguna columna de fecha y el dato histórico no es recuperable (los gafetes
-- guardados tienen mtime del despliegue, no del registro).
--
-- Por eso la columna se agrega SIN default y en un segundo paso se le pone
-- NOW(). Si se agregara con default, Postgres rellenaría las filas ya
-- existentes con la fecha de hoy e inventaría un dato falso. Con este orden
-- los registros viejos quedan en NULL (el panel los muestra como "—") y solo
-- los nuevos se sellan.
--
-- Idempotente: se puede correr varias veces sin efecto adicional.

BEGIN;

ALTER TABLE "Registro_Empresarios"   ADD COLUMN IF NOT EXISTS "FechaRegistro" timestamptz;
ALTER TABLE "Registro_Alumnos"       ADD COLUMN IF NOT EXISTS "FechaRegistro" timestamptz;
ALTER TABLE "Registro_elisaCarrillo" ADD COLUMN IF NOT EXISTS "FechaRegistro" timestamptz;

ALTER TABLE "Registro_Empresarios"   ALTER COLUMN "FechaRegistro" SET DEFAULT NOW();
ALTER TABLE "Registro_Alumnos"       ALTER COLUMN "FechaRegistro" SET DEFAULT NOW();
ALTER TABLE "Registro_elisaCarrillo" ALTER COLUMN "FechaRegistro" SET DEFAULT NOW();

-- El panel ordena por esta columna; sin índice el ORDER BY pagina a ciegas.
CREATE INDEX IF NOT EXISTS "Registro_Empresarios_FechaRegistro_idx"
    ON "Registro_Empresarios" ("FechaRegistro");
CREATE INDEX IF NOT EXISTS "Registro_Alumnos_FechaRegistro_idx"
    ON "Registro_Alumnos" ("FechaRegistro");
CREATE INDEX IF NOT EXISTS "Registro_elisaCarrillo_FechaRegistro_idx"
    ON "Registro_elisaCarrillo" ("FechaRegistro");

COMMIT;
