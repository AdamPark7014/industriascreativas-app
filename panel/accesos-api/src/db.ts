import pg from 'pg'

const url = process.env.DATABASE_URL
if (!url) {
  throw new Error('DATABASE_URL required')
}

export const pool = new pg.Pool({
  connectionString: url,
  max: Number(process.env.PG_POOL_MAX || 12),
  idleTimeoutMillis: 20_000,
  connectionTimeoutMillis: 8_000,
})

pool.on('error', (err) => {
  console.error('pg pool error', err.message)
})

export type Row = Record<string, unknown>

export async function query<T extends Row = Row>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool.query<T>(sql, params)
  return res.rows
}

export async function queryOne<T extends Row = Row>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}

export async function withClient<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    return await fn(client)
  } finally {
    client.release()
  }
}

async function trySql(sql: string, label: string): Promise<void> {
  try {
    await pool.query(sql)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn(`index skip ${label}:`, msg)
  }
}

/** Ensure Accesos schema + indexes (idempotent). Called once on boot. */
export async function ensureIndexes(): Promise<void> {
  await trySql(`CREATE EXTENSION IF NOT EXISTS pg_trgm`, 'pg_trgm')

  await trySql(
    `ALTER TABLE accesos_escaneos ADD COLUMN IF NOT EXISTS codigo VARCHAR(40)`,
    'col_codigo',
  )
  await trySql(
    `ALTER TABLE accesos_escaneos ADD COLUMN IF NOT EXISTS dispositivo VARCHAR(60)`,
    'col_dispositivo',
  )
  await trySql(
    `ALTER TABLE accesos_escaneos ADD COLUMN IF NOT EXISTS server_ms INTEGER`,
    'col_server_ms',
  )
  await trySql(
    `ALTER TABLE accesos_escaneos ADD COLUMN IF NOT EXISTS client_ms INTEGER`,
    'col_client_ms',
  )
  await trySql(
    `ALTER TABLE accesos_zonas ADD COLUMN IF NOT EXISTS hora_inicio TIME`,
    'col_hora_inicio',
  )
  await trySql(
    `ALTER TABLE accesos_zonas ADD COLUMN IF NOT EXISTS hora_fin TIME`,
    'col_hora_fin',
  )
  await trySql(
    `ALTER TABLE accesos_zonas ADD COLUMN IF NOT EXISTS zona_requerida BOOLEAN NOT NULL DEFAULT FALSE`,
    'col_zona_requerida',
  )
  await trySql(
    `CREATE TABLE IF NOT EXISTS accesos_bloqueos (
      id SERIAL PRIMARY KEY,
      tipo VARCHAR(20) NOT NULL,
      registro_id INTEGER NOT NULL,
      motivo VARCHAR(160) NOT NULL DEFAULT '',
      activo BOOLEAN NOT NULL DEFAULT TRUE,
      creado TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tipo, registro_id)
    )`,
    'bloqueos',
  )
  // Registro de boletos impresos (auditoría + "deshacer impresión"). Espejo: migraciones/005_accesos_impresiones.sql
  await trySql(
    `CREATE TABLE IF NOT EXISTS accesos_impresiones (
      id SERIAL PRIMARY KEY,
      tipo VARCHAR(20) NOT NULL,
      registro_id INTEGER NOT NULL,
      folio VARCHAR(40) NOT NULL,
      via VARCHAR(12) NOT NULL DEFAULT 'ql',
      impresora VARCHAR(120),
      modo_color VARCHAR(12),
      job_id INTEGER,
      operador VARCHAR(120),
      dispositivo VARCHAR(120),
      creado TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    'impresiones',
  )
  await trySql(
    `CREATE INDEX IF NOT EXISTS accesos_impresiones_reg_creado_idx
      ON accesos_impresiones (tipo, registro_id, creado DESC)`,
    'impresiones_reg',
  )
  await trySql(
    `CREATE INDEX IF NOT EXISTS accesos_impresiones_creado_idx
      ON accesos_impresiones (creado DESC)`,
    'impresiones_creado',
  )

  await trySql(
    `CREATE INDEX IF NOT EXISTS accesos_escaneos_zona_creado_idx
      ON accesos_escaneos (zona_clave, creado DESC)`,
    'escaneos_zona',
  )
  await trySql(
    `CREATE INDEX IF NOT EXISTS accesos_escaneos_reg_modo_idx
      ON accesos_escaneos (tipo, registro_id, modo, ok, creado)`,
    'escaneos_reg',
  )
  await trySql(
    `CREATE INDEX IF NOT EXISTS accesos_escaneos_codigo_idx
      ON accesos_escaneos (codigo, creado DESC)`,
    'escaneos_codigo',
  )
  await trySql(
    `CREATE INDEX IF NOT EXISTS accesos_escaneos_dispositivo_idx
      ON accesos_escaneos (dispositivo, creado DESC)
      WHERE dispositivo IS NOT NULL AND dispositivo <> ''`,
    'escaneos_dispositivo',
  )

  // Nombre / teléfono are plain text → gin_trgm OK.
  // Correo on Alumnos is ARRAY → cast not IMMUTABLE; skip correo trgm there.
  const specs: { name: string; sql: string }[] = [
    {
      name: 'emp_nombre',
      sql: `CREATE INDEX IF NOT EXISTS registro_empresarios_accesos_nombre_trgm
        ON "Registro_Empresarios" USING gin (
          (COALESCE("Nombre",'') || ' ' || COALESCE("ApellidoPaterno",'')) gin_trgm_ops)`,
    },
    {
      name: 'emp_correo',
      sql: `CREATE INDEX IF NOT EXISTS registro_empresarios_accesos_correo_trgm
        ON "Registro_Empresarios" USING gin ((COALESCE("Correo",'')) gin_trgm_ops)`,
    },
    {
      name: 'emp_tel',
      sql: `CREATE INDEX IF NOT EXISTS registro_empresarios_accesos_tel_trgm
        ON "Registro_Empresarios" USING gin ((COALESCE("Telefono",'')) gin_trgm_ops)`,
    },
    {
      name: 'alu_nombre',
      sql: `CREATE INDEX IF NOT EXISTS registro_alumnos_accesos_nombre_trgm
        ON "Registro_Alumnos" USING gin (
          (COALESCE("Nombre",'') || ' ' || COALESCE("ApellidoPaterno",'')) gin_trgm_ops)`,
    },
    {
      name: 'alu_tel',
      sql: `CREATE INDEX IF NOT EXISTS registro_alumnos_accesos_tel_trgm
        ON "Registro_Alumnos" USING gin ((COALESCE("Telefono",'')) gin_trgm_ops)`,
    },
    {
      name: 'elisa_nombre',
      sql: `CREATE INDEX IF NOT EXISTS registro_elisacarrillo_accesos_nombre_trgm
        ON "Registro_elisaCarrillo" USING gin ((COALESCE("Nombre",'')) gin_trgm_ops)`,
    },
    {
      name: 'elisa_correo',
      sql: `CREATE INDEX IF NOT EXISTS registro_elisacarrillo_accesos_correo_trgm
        ON "Registro_elisaCarrillo" USING gin ((COALESCE("Correo",'')) gin_trgm_ops)`,
    },
    {
      name: 'elisa_tel',
      sql: `CREATE INDEX IF NOT EXISTS registro_elisacarrillo_accesos_tel_trgm
        ON "Registro_elisaCarrillo" USING gin ((COALESCE("Telefono",'')) gin_trgm_ops)`,
    },
  ]
  for (const s of specs) await trySql(s.sql, s.name)
}
