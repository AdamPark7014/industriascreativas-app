/** Mismos nombres que accesos-api/src/catalog.ts → Permiso. */
export type Permiso =
  | 'panel_datos'
  | 'elisa'
  | 'escanear'
  | 'zonas_editar'
  | 'metricas'
  | 'registrar'
  | 'buscar'
  | 'reenviar'
  | 'imprimir'
  | 'desmarcar'
  | 'informes'
  | 'mesa'
  | 'equipo'

export type Sesion = {
  usuario: string
  nombre: string
  alcance: 'interno' | 'promotor' | 'control' | 'impresion' | 'registro' | string
  /** Nombre visible del rol ("Mesa de impresión"). */
  rolNombre: string
  permisos: Permiso[]
  puedeOperar: boolean
  puedeImprimir: boolean
}

export function tiene(sesion: Sesion | null | undefined, permiso: Permiso): boolean {
  return Boolean(sesion?.permisos?.includes(permiso))
}

export type Zona = {
  id: number
  clave: string
  nombre: string
  aforo: number
  dentro: number
  activo: boolean
}

export type Escaneo = {
  id: number
  creado: string
  tipo: string
  registro_id: number
  nombre: string
  modo: 'entrada' | 'salida' | string
  ok: boolean
  mensaje: string
  zona_clave?: string | null
  origen?: string
  operador?: string | null
  codigo?: string | null
  dispositivo?: string | null
  server_ms?: number | null
  client_ms?: number | null
}

export type Resumen = Sesion & {
  confirmados: number
  dentro: number
  entradasHoy: number
  salidasHoy: number
  rechazosHoy: number
  escaneosHoy: number
  zonas: Zona[]
  recientes: Escaneo[]
}

export type GafeteHit = {
  tipo: string
  tipoEtiqueta: string
  id: number
  folio: string
  nombre: string
  correo: string
  telefono: string
  extra: string
  confirmado: boolean
  asistencias: number
  dentro: boolean
  match: string
  /** Boletos impresos registrados (0 si nunca). Opcional mientras el API lo despliega. */
  impresiones?: number
  /** ISO de la última impresión registrada o null. */
  ultimaImpresion?: string | null
}

export type ImpresionVia = 'ql' | 'chrome' | 'pdf'
export type ImpresionModoColor = 'mono' | 'redblack'

export type Impresion = {
  id: number
  creado: string | null
  tipo?: string
  registroId?: number
  folio?: string
  via: ImpresionVia | 'test'
  impresora?: string | null
  modoColor?: ImpresionModoColor | null
  /** El API solo guarda enteros >= 0. */
  jobId?: number | null
  operador?: string | null
  dispositivo?: string | null
}

export type RegistrarImpresionBody = {
  via: ImpresionVia
  /** <= 120 chars (el API responde 400 impresora_larga si excede). */
  impresora?: string | null
  modoColor?: ImpresionModoColor | null
  /** Entero >= 0 o null; cualquier otra cosa es 400 jobId. */
  jobId?: number | null
  /** <= 120 chars. */
  dispositivo?: string | null
}

export type RegistrarImpresionResp = {
  ok: boolean
  impresion: Impresion
  total: number
  ultima: string | null
}

export type ListarImpresionesResp = {
  ok: boolean
  total: number
  ultima: string | null
  impresiones: Impresion[]
}

export type BorrarImpresionesResp = {
  ok: boolean
  borradas: number
  total: number
  ultima?: string | null
}

export type ScanResult = {
  ok: boolean
  codigo?: string
  mensaje: string
  detalles: string
  pitido: 'exito' | 'error'
  nombre: string
  tipo: string
  folio?: string
  asistencias: number
  dentro: boolean
  currentlyInside?: boolean
  lastDirection?: 'entrada' | 'salida' | null
  lastScanAt?: string | null
  zona?: string
  zonaNombre?: string
  zonaDentro?: number
  zonaAforo?: number
  dispositivo?: string
  scanId?: number
  serverMs?: number
  reentry?: boolean
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  })
  if (res.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent('/accesos')}`
    throw new Error('sesion')
  }
  if (!res.ok) {
    let detalle = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) detalle = body.error
    } catch {
      /* ignore */
    }
    throw new Error(detalle)
  }
  return (await res.json()) as T
}

export const api = {
  sesion: () => req<Sesion>('/api/accesos/sesion'),
  resumen: () => req<Resumen>('/api/accesos/resumen'),
  zonas: () => req<{ zonas: Zona[]; puedeOperar: boolean }>('/api/accesos/zonas'),
  guardarZona: (body: { clave: string; nombre: string; aforo: number }) =>
    req<{ ok: boolean; zonas: Zona[] }>('/api/accesos/zonas', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  buscar: (q: string, tipo?: string, signal?: AbortSignal) => {
    const p = new URLSearchParams({ q })
    if (tipo) p.set('tipo', tipo)
    return req<{ q: string; results: GafeteHit[] }>(
      `/api/accesos/buscar?${p}`,
      signal ? { signal } : undefined,
    )
  },
  escanear: (
    qr: string,
    modo: 'entrada' | 'salida',
    zona: string,
    extra?: { dispositivo?: string; clientLatencyMs?: number },
  ) =>
    req<ScanResult>('/api/accesos/escanear', {
      method: 'POST',
      body: JSON.stringify({
        qr,
        modo,
        zona,
        dispositivo: extra?.dispositivo,
        clientLatencyMs: extra?.clientLatencyMs,
      }),
    }),
  reportarLatencia: (scanId: number, clientLatencyMs: number) =>
    req<{ ok: boolean }>(`/api/accesos/escaneos/${scanId}/latencia`, {
      method: 'PATCH',
      body: JSON.stringify({ clientLatencyMs }),
    }),
  metricas: () =>
    req<{
      hoy: {
        n: number
        p50: number | null
        p95: number | null
        avg_server: number | null
        avg_client: number | null
      }
      devices: { dispositivo: string; n: number; p50: number | null; ok_rate: number | null }[]
      codigos: { codigo: string; n: number }[]
      puedeOperar: boolean
    }>('/api/accesos/metricas'),
  reportes: (params: URLSearchParams, signal?: AbortSignal) =>
    req<{
      kpis: {
        total: number
        entradas: number
        salidas: number
        rechazos: number
        reingresos?: number
        p50_server?: number | null
        p95_server?: number | null
      }
      registros: Escaneo[]
      zonas?: { clave: string; nombre: string }[]
      dispositivos?: string[]
      puedeOperar: boolean
    }>(`/api/accesos/reportes?${params}`, signal ? { signal } : undefined),
}

export type BoletoPayload = {
  nombre: string
  folio: string
  tipo: string
  subtitulo: string
  evento: string
  formato: string
  qrDataUrl: string
  acento: string
  /** Boletos impresos registrados para este registro (0 si nunca). */
  impresiones?: number
  /** ISO de la última impresión registrada o null. */
  ultimaImpresion?: string | null
}

export async function cargarBoleto(tipo: string, id: number): Promise<BoletoPayload> {
  return req<BoletoPayload>(`/api/accesos/gafete/${tipo}/${id}`)
}

/**
 * Registro de impresiones (auditoría + "marcar como no impreso").
 * Contrato: POST …/impresion, GET …/impresiones, DELETE …/impresion/:id, DELETE …/impresiones.
 */
export function registrarImpresion(
  tipo: string,
  id: number,
  body: RegistrarImpresionBody,
): Promise<RegistrarImpresionResp> {
  return req<RegistrarImpresionResp>(`/api/accesos/gafete/${tipo}/${id}/impresion`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function listarImpresiones(tipo: string, id: number): Promise<ListarImpresionesResp> {
  return req<ListarImpresionesResp>(`/api/accesos/gafete/${tipo}/${id}/impresiones`)
}

export function borrarImpresion(
  tipo: string,
  id: number,
  impresionId: number,
): Promise<BorrarImpresionesResp> {
  return req<BorrarImpresionesResp>(
    `/api/accesos/gafete/${tipo}/${id}/impresion/${impresionId}`,
    { method: 'DELETE' },
  )
}

/**
 * Deja el contador en 0: el boleto vuelve a quedar "como si no se hubiera impreso".
 * Si el API responde 404 `sin_impresiones` (contador en pantalla desfasado) se
 * devuelve `{ ok:true, borradas:0, total:0 }`: el resultado final es el mismo.
 */
export async function borrarImpresiones(tipo: string, id: number): Promise<BorrarImpresionesResp> {
  try {
    return await req<BorrarImpresionesResp>(`/api/accesos/gafete/${tipo}/${id}/impresiones`, {
      method: 'DELETE',
    })
  } catch (e) {
    if (e instanceof Error && e.message === 'sin_impresiones') {
      return { ok: true, borradas: 0, total: 0, ultima: null }
    }
    throw e
  }
}

/** jobId del agente → entero >= 0 que acepta el API, o null. */
export function jobIdParaApi(v: string | number | null | undefined): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 && n <= 2_147_483_647 ? n : null
}

/** "hh:mm" local de un ISO, o null si no hay fecha válida. */
export function horaCorta(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** Abre el PDF del gafete (descarga / diálogo de impresión del navegador). */
export async function abrirPdfGafete(tipo: string, id: number): Promise<void> {
  const res = await fetch(`/api/accesos/gafete/${tipo}/${id}.pdf`, {
    credentials: 'same-origin',
  })
  if (res.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent('/accesos/buscar')}`
    throw new Error('sesion')
  }
  if (!res.ok) throw new Error('No se pudo generar el PDF del boleto')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  if (!win) {
    // Fallback: iframe oculto + print
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    iframe.src = url
    document.body.appendChild(iframe)
    await new Promise<void>((resolve, reject) => {
      iframe.onload = () => {
        window.setTimeout(() => {
          try {
            iframe.contentWindow?.focus()
            iframe.contentWindow?.print()
            resolve()
          } catch {
            reject(new Error('Permite ventanas emergentes para abrir el PDF'))
          }
        }, 250)
      }
      iframe.onerror = () => reject(new Error('No se abrió el PDF'))
    })
    window.setTimeout(() => {
      iframe.remove()
      URL.revokeObjectURL(url)
    }, 60_000)
    return
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000)
}

/** @deprecated Usar cargarBoleto + preview React; se mantiene alias. */
export const imprimirGafete = abrirPdfGafete

// ===================== Mesa de atención =====================

/** Como req, pero los 4xx/5xx con `{ ok:false, mensaje }` se devuelven en vez de lanzar. */
async function reqCuerpo<T extends { ok: boolean }>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  })
  if (res.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent('/accesos')}`
    throw new Error('sesion')
  }
  const body = (await res.json().catch(() => null)) as T | null
  if (body && typeof body === 'object' && 'ok' in body) return body
  throw new Error(`HTTP ${res.status}`)
}

export type TipoAlta = 'empresas' | 'estudiantes'

export type AltaDatos = {
  tipo: TipoAlta
  correo: string
  nombre: string
  apellidoPaterno: string
  edad: string
  lada: string
  telefono: string
  areaInteresGeneral: string
  empresa?: string
  ciudad?: string
  estado?: string
  posicionEmpresa?: string
  areaResponsabilidad?: string
  productosInteres?: string[]
  pais?: string
  tipoInstitucion?: string
  carrera?: string
  competencias?: string[]
  /** Casilla "enviar también por correo" (apagada por defecto). */
  enviarCorreo: boolean
  dispositivo?: string
}

/** Resultado de mandar el boleto digital por Brevo. */
export type EnvioCorreo = {
  ok: boolean
  error?: string | null
  mensaje?: string | null
  correo?: string
  messageId?: string | null
}

export type PersonaExistente = { tipo: string; id: number; folio: string; nombre: string; confirmado: boolean }

export type AltaResp =
  | { ok: true; tipo: TipoAlta; id: number; folio: string; nombre: string; correo: string; envio: EnvioCorreo | null }
  | { ok: false; error: string; mensaje: string; existente?: PersonaExistente }

export type Ficha = {
  ok: true
  tipo: string
  tipoEtiqueta: string
  id: number
  folio: string
  nombre: string
  correo: string
  telefono: string
  confirmado: boolean
  asistencias: number
  dentro: boolean
  campos: { clave: string; etiqueta: string; valor: string }[]
  alta: { operador: string; creado: string | null } | null
  escaneos: {
    entradas: number
    salidas: number
    rechazos: number
    primeraEntrada: string | null
    ultimo: string | null
    lista: {
      id: number
      creado: string | null
      modo: string
      ok: boolean
      mensaje: string | null
      zona_clave: string | null
      operador: string | null
      dispositivo: string | null
    }[]
  }
  impresiones: {
    total: number
    ultima: string | null
    lista: {
      id: number
      creado: string | null
      via: string
      impresora: string | null
      operador: string | null
      dispositivo: string | null
    }[]
  }
  correos: {
    total: number
    lista: {
      id: number
      creado: string | null
      correo: string
      motivo: string
      operador: string | null
      ok: boolean
      error: string | null
    }[]
  }
  descargas: { total: number; ultima: string | null }
  puede: { reenviar: boolean; imprimir: boolean; desmarcar: boolean; confirmar: boolean }
}

export type EventoCorreo = {
  evento: string
  fecha: string | null
  asunto: string | null
  messageId: string | null
  motivo: string | null
  correo: string
}

export type EventosCorreoResp = {
  ok: boolean
  error?: string | null
  mensaje?: string | null
  correos: string[]
  eventos: EventoCorreo[]
}

export type AccionMesa = {
  accion: 'alta' | 'impresion' | 'reenvio' | 'reenvio_fallido' | string
  tipo: string
  registroId: number
  folio: string
  nombre: string
  operador: string
  operadorNombre: string
  detalle: string
  creado: string | null
}

export type OperadorMesa = {
  operador: string
  nombre: string
  altas: number
  impresiones: number
  reenvios: number
  fallos: number
}

export type MesaResp = {
  ok: boolean
  hoy: { altas: number; impresiones: number; reenvios: number; fallos: number }
  altasTotales: number
  operadores: OperadorMesa[]
  recientes: AccionMesa[]
}

export type UsuarioEquipo = {
  usuario: string
  nombre: string
  rol: string
  rolNombre: string
  activo: boolean
  ultimoAcceso: string | null
}

export type MiAlta = {
  tipo: TipoAlta
  id: number
  folio: string
  nombre: string
  creado: string | null
  impresiones: number
}

const persona = (tipo: string, id: number) => `/api/accesos/persona/${tipo}/${id}`

export const mesa = {
  registrar: (datos: AltaDatos) =>
    reqCuerpo<AltaResp>('/api/accesos/registro', { method: 'POST', body: JSON.stringify(datos) }),
  misAltas: () => req<{ ok: boolean; altas: MiAlta[] }>('/api/accesos/mis-altas'),
  ficha: (tipo: string, id: number) => req<Ficha>(persona(tipo, id)),
  /** Sin `correo` va al registrado; con `correo`, a ese otro. */
  reenviar: (tipo: string, id: number, correo?: string) =>
    reqCuerpo<EnvioCorreo>(`${persona(tipo, id)}/reenviar`, {
      method: 'POST',
      body: JSON.stringify(correo ? { correo } : {}),
    }),
  confirmar: (tipo: string, id: number) =>
    reqCuerpo<{ ok: boolean; error?: string }>(`${persona(tipo, id)}/confirmar`, { method: 'POST' }),
  correoEventos: (tipo: string, id: number) => reqCuerpo<EventosCorreoResp>(`${persona(tipo, id)}/correo-eventos`),
  actividad: () => req<MesaResp>('/api/accesos/mesa'),
  equipo: () => req<{ ok: boolean; usuarios: UsuarioEquipo[] }>('/api/accesos/equipo'),
}

/** "05/10 14:32" en hora local, o null si no hay fecha válida. */
export function fechaHora(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}
