/** Mismos nombres que pumpkin/api/src/auth.ts → Permiso. */
export type Permiso = 'escanear' | 'resumen' | 'pases' | 'bloquear' | 'informes'

/** Jornada de operación: fecha CDMX que cambia a las `corteHora` (6:00 por defecto). */
export type Jornada = { tz: string; fecha: string; nombre: string; corteHora: number }

export type Sesion = {
  usuario: string
  nombre: string
  rol: 'admin' | 'puerta'
  rolNombre: string
  permisos: Permiso[]
  puedeOperar: boolean
  jornada: Jornada
  aforo: number
  totalPases: number
}

export function tiene(sesion: Sesion | null | undefined, permiso: Permiso): boolean {
  return Boolean(sesion?.permisos?.includes(permiso))
}

export type ScanResult = {
  ok: boolean
  /** Del servidor (OK_ENTRY, YA_DENTRO…) o del cliente (PENDING, OFFLINE, UNAUTHORIZED). */
  codigo: string
  mensaje: string
  detalles: string
  pitido: 'exito' | 'error'
  nombre: string
  tipo: string
  folio?: string
  asistencias: number
  dentro: boolean
  currentlyInside?: boolean
  reentry?: boolean
  entradasHoy?: number
  zonaNombre?: string
  zonaDentro?: number
  zonaAforo?: number
  scanId?: number
  serverMs?: number
}

export type EscaneoFila = {
  id: number
  creado: string
  jornada?: string
  modo: 'entrada' | 'salida'
  ok: boolean
  codigo: string
  mensaje: string
  reingreso: boolean
  operador: string | null
  dispositivo: string | null
  origen?: string
  leido: string
  pase: string | null
  titular: string | null
}

export type Resumen = {
  jornada: Jornada
  jornadas: { jornada: string; nombre: string; entradas: number; escaneos: number }[]
  aforo: number
  dentro: number
  entradas: number
  reingresos: number
  salidas: number
  rechazos: number
  unicos: number
  pases: { total: number; bloqueados: number; conTitular: number }
  porOperador: {
    operador: string
    nombre: string | null
    entradas: number
    reingresos: number
    salidas: number
    rechazos: number
    ultimo: string | null
    dispositivo: string | null
  }[]
  porHora: { hora: number; entradas: number; salidas: number }[]
  recientes: EscaneoFila[]
}

export type EstadoPase = 'dentro' | 'salio' | 'sin_entrar'

export type Pase = {
  codigo: string
  numero: number
  hoja: number
  titular: string
  bloqueado: boolean
  motivo: string
  estado: EstadoPase
  ultimoAt: string | null
  ultimoOperador: string
  entradasHoy: number
  entradasTotal: number
  ultimaEntrada: string | null
}

export const BASE_API = '/pumpkin/api'

async function pedir<T>(ruta: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE_API}${ruta}`, {
    credentials: 'same-origin',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>
  if (r.status === 401 && data.error === 'sesion') throw new Error('sesion')
  if (!r.ok) throw new Error(String(data.mensaje || data.error || `Error ${r.status}`))
  return data as T
}

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) })

export const api = {
  sesion: () => pedir<Sesion>('/sesion'),
  login: (usuario: string, clave: string) => pedir<{ sesion: Sesion }>('/login', json({ usuario, clave })),
  directo: (usuario: string, token: string) =>
    pedir<{ sesion: Sesion }>('/directo', json({ usuario, token })),
  logout: () => pedir<{ ok: boolean }>('/logout', json({})),
  escanear: (
    qr: string,
    modo: 'entrada' | 'salida',
    opts: { dispositivo?: string; origen?: 'lector' | 'camara' | 'offline'; leidoEn?: number } = {},
  ) => pedir<ScanResult>('/escanear', json({ qr, modo, ...opts })),
  resumen: (jornada?: string) =>
    pedir<Resumen>(`/resumen${jornada ? `?jornada=${encodeURIComponent(jornada)}` : ''}`),
  pases: (jornada?: string) =>
    pedir<{ jornada: Jornada; pases: Pase[] }>(
      `/pases${jornada ? `?jornada=${encodeURIComponent(jornada)}` : ''}`,
    ),
  actualizarPase: (
    codigo: string,
    cambios: { titular?: string | null; bloqueado?: boolean; motivo?: string | null },
  ) =>
    pedir<{ ok: boolean }>(`/pases/${encodeURIComponent(codigo)}`, {
      method: 'PATCH',
      body: JSON.stringify(cambios),
    }),
  escaneos: (q: URLSearchParams) =>
    pedir<{ jornada: Jornada | null; escaneos: EscaneoFila[] }>(`/escaneos?${q.toString()}`),
}

export const fmtHora = (iso: string | null | undefined, conSegundos = false): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
        ...(conSegundos ? { second: '2-digit' } : {}),
        timeZone: 'America/Mexico_City',
      })
}
