-- Accesos search / report indexes (idempotent).
-- Also applied on boot by panel/accesos-api ensureIndexes().

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS accesos_escaneos_zona_creado_idx
  ON accesos_escaneos (zona_clave, creado DESC);

CREATE INDEX IF NOT EXISTS accesos_escaneos_reg_modo_idx
  ON accesos_escaneos (tipo, registro_id, modo, ok, creado);

CREATE INDEX IF NOT EXISTS registro_empresarios_accesos_nombre_trgm
  ON "Registro_Empresarios" USING gin (
    (COALESCE("Nombre",'') || ' ' || COALESCE("ApellidoPaterno",'')) gin_trgm_ops
  );
CREATE INDEX IF NOT EXISTS registro_empresarios_accesos_correo_trgm
  ON "Registro_Empresarios" USING gin ((COALESCE("Correo",'')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS registro_empresarios_accesos_tel_trgm
  ON "Registro_Empresarios" USING gin ((COALESCE("Telefono",'')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS registro_alumnos_accesos_nombre_trgm
  ON "Registro_Alumnos" USING gin (
    (COALESCE("Nombre",'') || ' ' || COALESCE("ApellidoPaterno",'')) gin_trgm_ops
  );
CREATE INDEX IF NOT EXISTS registro_alumnos_accesos_tel_trgm
  ON "Registro_Alumnos" USING gin ((COALESCE("Telefono",'')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS registro_elisacarrillo_accesos_nombre_trgm
  ON "Registro_elisaCarrillo" USING gin ((COALESCE("Nombre",'')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS registro_elisacarrillo_accesos_correo_trgm
  ON "Registro_elisaCarrillo" USING gin ((COALESCE("Correo",'')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS registro_elisacarrillo_accesos_tel_trgm
  ON "Registro_elisaCarrillo" USING gin ((COALESCE("Telefono",'')) gin_trgm_ops);
