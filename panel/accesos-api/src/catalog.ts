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
  control: ['empresas', 'estudiantes'],
  impresion: ['empresas', 'estudiantes'],
  registro: ['empresas', 'estudiantes'],
}

export const ZONA_DEFECTO = 'acreditacion'

export function tiposDe(alcance: string): TipoClave[] {
  return ALCANCES[alcance] ?? ALCANCES.promotor
}

/**
 * Qué puede hacer cada rol. El rol viaja en la cookie de Flask como `alcance`
 * (panel/seed.py lo siembra); espejo en panel/consultas.py → ROLES.
 *
 *   interno    NEXARA / ExperienceBT, quien opera la plataforma: todo.
 *   promotor   Organizador del evento (cliente): datos, Excel y mesa de atención.
 *   control    Control ADM de la mesa: registra, busca, reenvía, imprime y supervisa.
 *   impresion  Mesa de impresión: busca registrados, reenvía e imprime.
 *   registro   Mesa de registro: da de alta a quien no se registró e imprime su etiqueta.
 */
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

export const ROLES: Record<string, { nombre: string; permisos: readonly Permiso[] }> = {
  interno: {
    nombre: 'NEXARA · Operación',
    permisos: [
      'panel_datos', 'elisa', 'escanear', 'zonas_editar', 'metricas', 'registrar', 'buscar',
      'reenviar', 'imprimir', 'desmarcar', 'informes', 'mesa', 'equipo',
    ],
  },
  promotor: {
    nombre: 'Promotor FICTI',
    permisos: ['panel_datos', 'registrar', 'buscar', 'reenviar', 'imprimir', 'informes', 'mesa'],
  },
  control: {
    nombre: 'Control ADM',
    permisos: ['registrar', 'buscar', 'reenviar', 'imprimir', 'desmarcar', 'informes', 'mesa'],
  },
  impresion: {
    nombre: 'Mesa de impresión',
    permisos: ['buscar', 'reenviar', 'imprimir'],
  },
  registro: {
    nombre: 'Mesa de registro',
    permisos: ['registrar', 'imprimir'],
  },
}

export function permisosDe(rol: string): readonly Permiso[] {
  return ROLES[rol]?.permisos ?? []
}

export function puede(rol: string, permiso: Permiso): boolean {
  return permisosDe(rol).includes(permiso)
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
  rolNombre: string
  permisos: Permiso[]
  puedeOperar: boolean
  puedeImprimir: boolean
}

export function sesionJson(s: {
  usuario: string
  nombre?: string
  alcance?: string
}): PanelSesion {
  const alcance = s.alcance || 'promotor'
  return {
    usuario: s.usuario,
    nombre: s.nombre || s.usuario,
    alcance,
    rolNombre: ROLES[alcance]?.nombre ?? alcance,
    permisos: [...permisosDe(alcance)],
    puedeOperar: puede(alcance, 'escanear'),
    puedeImprimir: puede(alcance, 'imprimir'),
  }
}
