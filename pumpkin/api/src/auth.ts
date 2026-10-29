import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { SECRETO } from './config.js'
import { pool, query, queryOne } from './db.js'

export type Rol = 'admin' | 'puerta'

export type Permiso = 'escanear' | 'resumen' | 'pases' | 'bloquear' | 'informes'

export const ROLES: Record<Rol, { nombre: string; permisos: readonly Permiso[] }> = {
  admin: {
    nombre: 'Supervisión PUMPKIN',
    permisos: ['escanear', 'resumen', 'pases', 'bloquear', 'informes'],
  },
  puerta: { nombre: 'Puerta', permisos: ['escanear'] },
}

export type Usuario = {
  id: number
  usuario: string
  nombre: string
  rol: Rol
  clave_hash: string
  activo: boolean
}

export function puede(rol: string, p: Permiso): boolean {
  return Boolean(ROLES[rol as Rol]?.permisos.includes(p))
}

export function sesionJson(u: Usuario) {
  const rol = ROLES[u.rol]
  return {
    usuario: u.usuario,
    nombre: u.nombre,
    rol: u.rol,
    rolNombre: rol?.nombre ?? u.rol,
    permisos: [...(rol?.permisos ?? [])],
    puedeOperar: puede(u.rol, 'escanear'),
  }
}

// ── Claves ──────────────────────────────────────────────────────────────

const N = 16384

export function hashClave(clave: string): string {
  const sal = randomBytes(16)
  const h = scryptSync(clave, sal, 32, { N, r: 8, p: 1 })
  return `scrypt$${N}$${sal.toString('base64url')}$${h.toString('base64url')}`
}

export function verificarClave(clave: string, guardado: string): boolean {
  const [alg, n, sal, h] = guardado.split('$')
  if (alg !== 'scrypt' || !sal || !h) return false
  const esperado = Buffer.from(h, 'base64url')
  const calc = scryptSync(clave, Buffer.from(sal, 'base64url'), esperado.length, {
    N: Number(n) || N,
    r: 8,
    p: 1,
  })
  return calc.length === esperado.length && timingSafeEqual(calc, esperado)
}

function hmac(texto: string): string {
  return createHmac('sha256', SECRETO).update(texto).digest('base64url')
}

function igual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** Cambia cuando cambia la clave: invalida sesiones y enlaces viejos. */
function versionDe(u: Pick<Usuario, 'clave_hash'>): string {
  return hmac(`v|${u.clave_hash}`).slice(0, 12)
}

/** Token del enlace de acceso directo de una PDA (no se guarda: se deriva). */
export function tokenDirecto(u: Pick<Usuario, 'usuario' | 'clave_hash'>): string {
  return hmac(`directo|${u.usuario}|${u.clave_hash}`).slice(0, 32)
}

export function tokenDirectoValido(u: Usuario, token: string): boolean {
  return igual(tokenDirecto(u), token)
}

// ── Sesión en cookie firmada ────────────────────────────────────────────

export const COOKIE = 'pk_sesion'

/** Las PDA se quedan con la sesión abierta toda la temporada; supervisión, una semana. */
export function duracionSesion(rol: Rol): number {
  return rol === 'puerta' ? 45 * 24 * 3600 : 7 * 24 * 3600
}

export function firmarSesion(u: Usuario): { valor: string; maxAge: number } {
  const maxAge = duracionSesion(u.rol)
  const datos = Buffer.from(
    JSON.stringify({ u: u.usuario, v: versionDe(u), exp: Math.floor(Date.now() / 1000) + maxAge }),
  ).toString('base64url')
  return { valor: `${datos}.${hmac(`s|${datos}`)}`, maxAge }
}

const cache = new Map<string, { at: number; u: Usuario | null }>()

async function cargarUsuario(usuario: string): Promise<Usuario | null> {
  const c = cache.get(usuario)
  if (c && Date.now() - c.at < 10_000) return c.u
  const u = await queryOne<Usuario>(
    'SELECT id, usuario, nombre, rol, clave_hash, activo FROM usuarios WHERE usuario = $1',
    [usuario],
  )
  cache.set(usuario, { at: Date.now(), u })
  return u
}

export async function usuarioDeCookie(valor: string | undefined): Promise<Usuario | null> {
  if (!valor) return null
  const [datos, firma] = valor.split('.')
  if (!datos || !firma || !igual(hmac(`s|${datos}`), firma)) return null
  let p: { u?: string; v?: string; exp?: number }
  try {
    p = JSON.parse(Buffer.from(datos, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (!p.u || !p.v || !p.exp || p.exp < Date.now() / 1000) return null
  const u = await cargarUsuario(p.u)
  if (!u || !u.activo || !igual(versionDe(u), p.v)) return null
  return u
}

export async function buscarUsuario(usuario: string): Promise<Usuario | null> {
  return queryOne<Usuario>(
    'SELECT id, usuario, nombre, rol, clave_hash, activo FROM usuarios WHERE usuario = $1',
    [usuario.trim().toLowerCase()],
  )
}

export async function marcarAcceso(id: number): Promise<void> {
  await pool.query('UPDATE usuarios SET ultimo_acceso = now() WHERE id = $1', [id])
}

// ── Alta de cuentas desde el entorno ───────────────────────────────────

/**
 * PUMPKIN_USUARIOS = "usuario:clave:rol:Nombre visible;…" (solo en el .env del servidor).
 * Igual que PANEL_EQUIPO_CLAVES en FICTI: quien no esté en la lista queda desactivado.
 * El hash solo se rehace si la clave cambió, para que los enlaces directos no cambien.
 */
export async function sembrarUsuarios(): Promise<number> {
  const raw = process.env.PUMPKIN_USUARIOS || ''
  const filas = raw
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [usuario, clave, rol, ...nombre] = s.split(':')
      return {
        usuario: (usuario || '').trim().toLowerCase(),
        clave: clave || '',
        rol: (rol || 'puerta').trim() as Rol,
        nombre: nombre.join(':').trim() || usuario,
      }
    })
    .filter((f) => /^[a-z0-9._-]{2,40}$/.test(f.usuario) && f.clave.length >= 6 && f.rol in ROLES)

  const activos: string[] = []
  for (const f of filas) {
    const actual = await buscarUsuario(f.usuario)
    const hash = actual && verificarClave(f.clave, actual.clave_hash) ? actual.clave_hash : hashClave(f.clave)
    await pool.query(
      `INSERT INTO usuarios (usuario, nombre, rol, clave_hash, activo)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (usuario) DO UPDATE
         SET nombre = EXCLUDED.nombre, rol = EXCLUDED.rol, clave_hash = EXCLUDED.clave_hash, activo = true`,
      [f.usuario, f.nombre, f.rol, hash],
    )
    activos.push(f.usuario)
  }
  await query('UPDATE usuarios SET activo = false WHERE NOT (usuario = ANY($1::text[]))', [activos])
  cache.clear()
  return activos.length
}

// ── Freno a la fuerza bruta (memoria del proceso) ──────────────────────

const intentos = new Map<string, number[]>()

/** true si la llave ya gastó `max` intentos fallidos en la ventana. */
export function frenado(llave: string, max: number, ventanaMs: number): boolean {
  const ahora = Date.now()
  const l = (intentos.get(llave) || []).filter((t) => ahora - t < ventanaMs)
  intentos.set(llave, l)
  return l.length >= max
}

export function anotarFallo(llave: string): void {
  const l = intentos.get(llave) || []
  l.push(Date.now())
  intentos.set(llave, l.slice(-50))
  if (intentos.size > 5000) intentos.clear()
}

export function limpiarFallos(llave: string): void {
  intentos.delete(llave)
}
