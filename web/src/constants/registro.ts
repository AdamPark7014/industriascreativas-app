/** Leyenda boceto hasta tener el texto final de taquilla */
export const LEYENDA_CANJE =
  'Boceto: Canjea tu boleto digital por tu gafete físico en taquilla el día del evento. Fecha, horario y ubicación por confirmar.'

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

/** Opciones de la foto 2 (productos de interés) — sin info comercial de talleres/ponencias */
export const PRODUCTOS_INTERES = [
  'Impresión digital',
  'Impresión textil y decoración de prendas',
  'Maquinaria de serigrafía',
  'Impresión Empaque y etiqueta',
  'Impresión 3D',
  'Fabricación textil',
  'Decoración de interiores',
  'Señalización y display',
  'Wrapping',
  'Corte, grabado y acabado',
  'Medios y sustratos',
  'Artículos promocionales',
  'Tintas y consumibles',
  'Tampografía',
  'Otro',
] as const

export type EmpresaFormData = {
  email: string
  emailConfirm: string
  nombre: string
  apellidoPaterno: string
  cargo: string
  empresa: string
  phoneCountry: string
  telefono: string
  ciudad: string
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
}

export const emptyEmpresaForm = (): EmpresaFormData => ({
  email: '',
  emailConfirm: '',
  nombre: '',
  apellidoPaterno: '',
  cargo: '',
  empresa: '',
  phoneCountry: 'MX',
  telefono: '',
  ciudad: '',
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
})
