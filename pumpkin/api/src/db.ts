import pg from 'pg'
import { TOTAL_PASES } from './config.js'

export type Row = Record<string, unknown>

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 8),
  idleTimeoutMillis: 30_000,
})

export async function query<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool.query(sql, params)
  return r.rows as T[]
}

export async function queryOne<T = Row>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}

export async function enTransaccion<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect()
  try {
    await c.query('BEGIN')
    const out = await fn(c)
    await c.query('COMMIT')
    return out
  } catch (e) {
    await c.query('ROLLBACK').catch(() => undefined)
    throw e
  } finally {
    c.release()
  }
}

/**
 * Esquema idempotente: se aplica en cada arranque. `jornada` se guarda en cada escaneo
 * (fecha CDMX corrida por PUMPKIN_CORTE_HORA) para que dentro/fuera se reinicie sin
 * depender de la hora del servidor.
 */
const ESQUEMA = `
CREATE TABLE IF NOT EXISTS usuarios (
  id            serial PRIMARY KEY,
  usuario       text UNIQUE NOT NULL,
  nombre        text NOT NULL,
  rol           text NOT NULL CHECK (rol IN ('admin', 'puerta')),
  clave_hash    text NOT NULL,
  activo        boolean NOT NULL DEFAULT true,
  creado        timestamptz NOT NULL DEFAULT now(),
  ultimo_acceso timestamptz
);

CREATE TABLE IF NOT EXISTS pases (
  id             serial PRIMARY KEY,
  codigo         text UNIQUE NOT NULL,
  numero         int UNIQUE NOT NULL,
  hoja           int NOT NULL,
  titular        text,
  bloqueado      boolean NOT NULL DEFAULT false,
  bloqueo_motivo text,
  actualizado    timestamptz NOT NULL DEFAULT now(),
  creado         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS escaneos (
  id          bigserial PRIMARY KEY,
  creado      timestamptz NOT NULL DEFAULT now(),
  jornada     date NOT NULL,
  pase_id     int REFERENCES pases(id),
  leido       text NOT NULL,
  modo        text NOT NULL CHECK (modo IN ('entrada', 'salida')),
  ok          boolean NOT NULL,
  codigo      text NOT NULL,
  mensaje     text NOT NULL,
  reingreso   boolean NOT NULL DEFAULT false,
  operador    text,
  dispositivo text,
  origen      text NOT NULL DEFAULT 'lector',
  server_ms   int,
  leido_en    timestamptz
);

CREATE INDEX IF NOT EXISTS escaneos_pase_jornada ON escaneos (pase_id, jornada, creado DESC) WHERE ok;
CREATE INDEX IF NOT EXISTS escaneos_jornada ON escaneos (jornada, creado DESC);
CREATE INDEX IF NOT EXISTS escaneos_operador ON escaneos (operador, jornada);
`

export async function prepararBase(): Promise<void> {
  await pool.query(ESQUEMA)
  // Los pases del PDF: QR-001…QR-250, 50 por hoja.
  await pool.query(
    `INSERT INTO pases (codigo, numero, hoja)
     SELECT 'QR-' || lpad(n::text, 3, '0'), n, ((n - 1) / 50) + 1
     FROM generate_series(1, $1::int) AS n
     ON CONFLICT (numero) DO NOTHING`,
    [TOTAL_PASES],
  )
}
