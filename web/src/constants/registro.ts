/** Leyenda de canje en taquilla */
export const LEYENDA_CANJE =
  'Canjea tu boleto digital por tu gafete físico en taquilla el día del evento.'

export const POSICIONES_EMPRESA = [
  'Propietario / director / socio',
  'Gerente',
  'Ejecutivo / Asistente',
  'Consultor',
  'Otro',
] as const

/** Opciones de la foto 1 (área de responsabilidad) */
export const AREAS_RESPONSABILIDAD = [
  'Compras',
  'Desarrollo de negocios',
  'Diseño',
  'Diseño de interiores - Arquitecto',
  'Empaque y etiqueta',
  'Marketing',
  'Operaciones',
  'Planeación',
  'Producción - Instalación',
  'Ventas',
  'Otro',
] as const

/** Áreas de interés (antes Productos de interés) */
export const PRODUCTOS_INTERES = [
  'Impresión digital',
  'Impresión textil y decoración de prendas',
  'Serigrafía',
  'Impresión Empaque y etiqueta',
  'Impresión 3D',
  'Fabricación textil',
  'Decoración de interiores',
  'Señalización y display',
  'Wrap',
  'Corte, grabado y acabado',
  'Sustratos',
  'Artículos promocionales',
  'Tintas y consumibles',
  'Tampografía',
  'Offset',
  'Acabado',
  'Otro',
] as const

export type EmpresaFormData = {
  email: string
  emailConfirm: string
  nombre: string
  apellidoPaterno: string
  empresa: string
  phoneCountry: string
  telefono: string
  ciudad: string
  estado: string
  posicionEmpresa: string
  areaResponsabilidad: string
  productosInteres: string[]
  otroPosicion: string
}

export type EstudianteFormData = {
  email: string
  nombre: string
  apellidoPaterno: string
  phoneCountry: string
  telefono: string
  institucionEducativa: string
  grado: string
}

export const emptyEmpresaForm = (): EmpresaFormData => ({
  email: '',
  emailConfirm: '',
  nombre: '',
  apellidoPaterno: '',
  empresa: '',
  phoneCountry: 'MX',
  telefono: '',
  ciudad: '',
  estado: '',
  posicionEmpresa: '',
  areaResponsabilidad: '',
  productosInteres: [],
  otroPosicion: '',
})

export const emptyEstudianteForm = (): EstudianteFormData => ({
  email: '',
  nombre: '',
  apellidoPaterno: '',
  phoneCountry: 'MX',
  telefono: '',
  institucionEducativa: '',
  grado: '',
})
