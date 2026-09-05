export type TipoClave = 'empresas' | 'estudiantes' | 'elisa'

export type TipoDef = {
  tabla: string
  id: string
  qr: string
  etiqueta: string
  extra: string | null
  nombreSql: string
}

export const TIPOS: Record<TipoClave, TipoDef> = {
  empresas: {
    tabla: 'Registro_Empresarios',
    id: 'idEmpresario',
    qr: 'EMPRESARIO',
    etiqueta: 'Empresario',
    extra: 'Empresa',
    nombreSql:
      "COALESCE(\"Nombre\",'') || ' ' || COALESCE(\"ApellidoPaterno\",'')",
  },
  estudiantes: {
    tabla: 'Registro_Alumnos',
    id: 'idAlumno',
    qr: 'ALUMNO',
    etiqueta: 'Alumno',
    extra: 'InstitucionEducativa',
    nombreSql:
      "COALESCE(\"Nombre\",'') || ' ' || COALESCE(\"ApellidoPaterno\",'')",
  },
  elisa: {
    tabla: 'Registro_elisaCarrillo',
    id: 'idUsuario',
    qr: 'ELISA_CARRILLO',
    etiqueta: 'Elisa Carrillo',
    extra: null,
    nombreSql: "COALESCE(\"Nombre\",'')",
  },
}

export const QR_A_TIPO: Record<string, TipoClave> = Object.fromEntries(
  Object.entries(TIPOS).map(([k, v]) => [v.qr, k as TipoClave]),
)

export const ALCANCES: Record<string, TipoClave[]> = {
  interno: ['empresas', 'estudiantes', 'elisa'],
  promotor: ['empresas', 'estudiantes'],
}

export const ZONA_DEFECTO = 'acreditacion'

export function tiposDe(alcance: string): TipoClave[] {
  return ALCANCES[alcance] ?? ALCANCES.promotor
}

export function nombreDe(fila: Record<string, unknown>): string {
  return [fila.Nombre, fila.ApellidoPaterno, fila.ApellidoMaterno]
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean)
    .join(' ')
}

export function folioDe(clave: TipoClave, id: number): string {
  return `${TIPOS[clave].qr}-${id}`
}

export type PanelSesion = {
  usuario: string
  nombre: string
  alcance: string
  puedeOperar: boolean
  puedeImprimir: boolean
}

export function sesionJson(s: {
  usuario: string
  nombre?: string
  alcance?: string
}): PanelSesion {
  const alcance = s.alcance || 'promotor'
  const ops = alcance === 'interno'
  return {
    usuario: s.usuario,
    nombre: s.nombre || s.usuario,
    alcance,
    puedeOperar: ops,
    puedeImprimir: ops,
  }
}
