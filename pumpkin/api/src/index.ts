import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono, type Context, type Next } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import {
  COOKIE,
  anotarFallo,
  buscarUsuario,
  firmarSesion,
  frenado,
  hashClave,
  limpiarFallos,
  marcarAcceso,
  puede,
  sembrarUsuarios,
  sesionJson,
  tokenDirectoValido,
  usuarioDeCookie,
  verificarClave,
  type Permiso,
  type Usuario,
} from './auth.js'
import { normalizarCodigo } from './codigo.js'
import { AFORO, COOKIE_SEGURA, PREFIJO, PUERTO, SECRETO, TOTAL_PASES } from './config.js'
import { actualizarPase, escaneosCsv, listarEscaneos, listarPases, resumen } from './consultas.js'
import { pool, prepararBase } from './db.js'
import { fechaValida, jornada, jornadaJson } from './jornada.js'
import { procesarEscaneo } from './scan.js'

type Env = { Variables: { usuario: Usuario } }

const app = new Hono<Env>()
const api = new Hono<Env>()

function ip(c: Context): string {
  return (c.req.header('x-real-ip') || c.req.header('x-forwarded-for') || '').split(',')[0].trim() || 'local'
}

async function cuerpo(c: Context): Promise<Record<string, unknown>> {
  try {
    const b = await c.req.json()
    return b && typeof b === 'object' ? (b as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function abrirSesion(c: Context, u: Usuario): void {
  const { valor, maxAge } = firmarSesion(u)
  setCookie(c, COOKIE, valor, {
    path: PREFIJO,
    httpOnly: true,
    secure: COOKIE_SEGURA,
    sameSite: 'Lax',
    maxAge,
  })
}

function sesionCompleta(u: Usuario) {
  return { ...sesionJson(u), jornada: jornadaJson(), aforo: AFORO, totalPases: TOTAL_PASES }
}

const requerir =
  (permiso?: Permiso) =>
  async (c: Context<Env>, next: Next): Promise<Response | void> => {
    const u = await usuarioDeCookie(getCookie(c, COOKIE))
    if (!u) return c.json({ error: 'sesion', mensaje: 'Inicia sesión.' }, 401)
    if (permiso && !puede(u.rol, permiso)) return c.json({ error: 'permiso', mensaje: 'Tu usuario no puede hacer esto.' }, 403)
    c.set('usuario', u)
    await next()
  }

api.get('/health', (c) => c.json({ ok: true, jornada: jornada() }))

// Escrituras solo desde la misma página (el navegador manda Origin en POST).
api.use('*', async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    const origin = c.req.header('origin')
    const host = c.req.header('host')
    if (origin && host) {
      let mismo = false
      try {
        mismo = new URL(origin).host === host
      } catch {
        mismo = false
      }
      if (!mismo) return c.json({ error: 'origen' }, 403)
    }
  }
  await next()
})

// Para que un usuario inexistente tarde lo mismo que una clave mal escrita.
const HASH_SEÑUELO = hashClave('señuelo-pumpkin')

api.post('/login', async (c) => {
  const b = await cuerpo(c)
  const usuario = String(b.usuario || '').trim().toLowerCase().slice(0, 40)
  const clave = String(b.clave || '').slice(0, 200)
  const kIp = `ip:${ip(c)}`
  const kU = `u:${usuario}`
  if (frenado(kIp, 25, 10 * 60_000) || frenado(kU, 8, 10 * 60_000)) {
    return c.json({ error: 'frenado', mensaje: 'Demasiados intentos. Espera unos minutos.' }, 429)
  }
  const u = usuario ? await buscarUsuario(usuario) : null
  const ok = verificarClave(clave, u?.clave_hash ?? HASH_SEÑUELO) && Boolean(u?.activo)
  if (!u || !ok) {
    anotarFallo(kIp)
    anotarFallo(kU)
    return c.json({ error: 'credenciales', mensaje: 'Usuario o contraseña incorrectos.' }, 401)
  }
  limpiarFallos(kU)
  abrirSesion(c, u)
  await marcarAcceso(u.id)
  return c.json({ ok: true, sesion: sesionCompleta(u) })
})

/** Acceso directo de una PDA: el enlace trae usuario.token en el #fragmento (no llega a los logs). */
api.post('/directo', async (c) => {
  const b = await cuerpo(c)
  const usuario = String(b.usuario || '').trim().toLowerCase().slice(0, 40)
  const token = String(b.token || '').slice(0, 80)
  const kIp = `ip:${ip(c)}`
  if (frenado(kIp, 25, 10 * 60_000)) {
    return c.json({ error: 'frenado', mensaje: 'Demasiados intentos. Espera unos minutos.' }, 429)
  }
  const u = usuario ? await buscarUsuario(usuario) : null
  if (!u || !u.activo || !tokenDirectoValido(u, token)) {
    anotarFallo(kIp)
    return c.json({ error: 'enlace', mensaje: 'El enlace ya no es válido. Pide uno nuevo o entra con usuario y contraseña.' }, 401)
  }
  abrirSesion(c, u)
  await marcarAcceso(u.id)
  return c.json({ ok: true, sesion: sesionCompleta(u) })
})

api.post('/logout', (c) => {
  deleteCookie(c, COOKIE, { path: PREFIJO, secure: COOKIE_SEGURA })
  return c.json({ ok: true })
})

api.get('/sesion', requerir(), (c) => c.json(sesionCompleta(c.get('usuario'))))

const ritmo = new Map<string, number[]>()

api.post('/escanear', requerir('escanear'), async (c) => {
  const u = c.get('usuario')
  const startedAt = Date.now()
  const lista = (ritmo.get(u.usuario) || []).filter((t) => startedAt - t < 60_000)
  if (lista.length >= 300) return c.json({ error: 'ritmo', mensaje: 'Demasiados escaneos por minuto.' }, 429)
  lista.push(startedAt)
  ritmo.set(u.usuario, lista)

  const b = await cuerpo(c)
  const leido = String(b.qr ?? '').slice(0, 300)
  if (!leido.trim()) return c.json({ error: 'sin_datos', mensaje: 'No llegó ningún código.' }, 400)
  const modo = b.modo === 'salida' ? 'salida' : 'entrada'
  const origen = b.origen === 'camara' ? 'camara' : b.origen === 'offline' ? 'offline' : 'lector'
  const leidoMs = Number(b.leidoEn)
  const leidoEn =
    Number.isFinite(leidoMs) && leidoMs > startedAt - 12 * 3_600_000 && leidoMs <= startedAt + 60_000
      ? new Date(leidoMs)
      : null
  const res = await procesarEscaneo({
    leido,
    modo,
    operador: u.usuario,
    dispositivo: typeof b.dispositivo === 'string' ? b.dispositivo : undefined,
    origen,
    leidoEn,
    startedAt,
  })
  return c.json(res)
})

function fechaDe(c: Context): string {
  return fechaValida(c.req.query('jornada')) ?? jornada()
}

api.get('/resumen', requerir('resumen'), async (c) => c.json(await resumen(fechaDe(c))))

api.get('/pases', requerir('pases'), async (c) => {
  const fecha = fechaDe(c)
  return c.json({ jornada: jornadaJson(fecha), pases: await listarPases(fecha) })
})

api.patch('/pases/:codigo', requerir('bloquear'), async (c) => {
  const codigo = normalizarCodigo(c.req.param('codigo') ?? '')
  if (!codigo) return c.json({ error: 'codigo' }, 400)
  const b = await cuerpo(c)
  const cambios: { titular?: string | null; bloqueado?: boolean; motivo?: string | null } = {}
  if ('titular' in b) cambios.titular = b.titular == null ? null : String(b.titular)
  if (typeof b.bloqueado === 'boolean') cambios.bloqueado = b.bloqueado
  if ('motivo' in b) cambios.motivo = b.motivo == null ? null : String(b.motivo)
  const fila = await actualizarPase(codigo, cambios)
  if (!fila) return c.json({ error: 'no_existe', mensaje: `${codigo} no existe.` }, 404)
  return c.json({ ok: true, pase: fila })
})

api.get('/escaneos', requerir('informes'), async (c) => {
  const todas = c.req.query('jornada') === 'todas'
  const formato = c.req.query('formato')
  const resultado = c.req.query('resultado')
  const pase = normalizarCodigo(c.req.query('pase') || '') || undefined
  const filas = await listarEscaneos({
    fecha: todas ? null : fechaDe(c),
    operador: (c.req.query('operador') || '').trim().toLowerCase() || undefined,
    resultado: resultado === 'ok' || resultado === 'rechazo' ? resultado : 'todos',
    pase,
    limite: formato === 'csv' ? 50_000 : 400,
  })
  if (formato === 'csv') {
    const nombre = `pumpkin-accesos-${todas ? 'todas' : fechaDe(c)}.csv`
    return new Response(escaneosCsv(filas), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${nombre}"`,
        'Cache-Control': 'no-store',
      },
    })
  }
  return c.json({ jornada: todas ? null : jornadaJson(fechaDe(c)), escaneos: filas })
})

api.onError((err, c) => {
  console.error('[pumpkin]', c.req.method, c.req.path, err)
  return c.json({ error: 'interno', mensaje: 'Error del servidor. Intenta de nuevo.' }, 500)
})

app.get('/health', (c) => c.json({ ok: true }))
app.route(`${PREFIJO}/api`, api)

// ── Escáner y panel (SPA compilada en ./public) ─────────────────────────

const PUBLICO = process.env.PUMPKIN_PUBLIC_DIR || './public'
const INDEX = join(PUBLICO, 'index.html')
const indexHtml = existsSync(INDEX) ? readFileSync(INDEX, 'utf8') : '<p>UI sin compilar</p>'
const estatico = serveStatic({ root: PUBLICO, rewriteRequestPath: (p) => p.slice(PREFIJO.length) })

app.get(PREFIJO, (c) => c.redirect(`${PREFIJO}/`, 301))
app.use(`${PREFIJO}/*`, async (c, next) => {
  if (!/\/[^/]+\.[a-z0-9]+$/i.test(c.req.path)) return next()
  if (c.req.path.startsWith(`${PREFIJO}/assets/`)) {
    c.header('Cache-Control', 'public, max-age=31536000, immutable')
  }
  return estatico(c, next)
})
app.get(`${PREFIJO}/*`, (c) => {
  c.header('Cache-Control', 'no-cache')
  return c.html(indexHtml)
})

async function arrancar(): Promise<void> {
  if (SECRETO.length < 32) {
    console.error('[pumpkin] Falta PUMPKIN_SECRET (32+ caracteres).')
    process.exit(1)
  }
  for (let i = 1; ; i++) {
    try {
      await prepararBase()
      break
    } catch (e) {
      if (i >= 30) throw e
      console.warn(`[pumpkin] base no lista (${i}/30): ${(e as Error).message}`)
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
  const n = await sembrarUsuarios()
  console.log(`[pumpkin] ${n} usuarios activos · jornada ${jornada()} · aforo ${AFORO || 'sin límite'}`)
  serve({ fetch: app.fetch, port: PUERTO }, (i) => console.log(`[pumpkin] escuchando en :${i.port}`))
}

const salir = () => void pool.end().finally(() => process.exit(0))
process.on('SIGTERM', salir)
process.on('SIGINT', salir)

void arrancar()
