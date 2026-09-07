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

/**
 * Pregunta de entrada (pop-up de portada). Bloquea la interacción hasta que se
 * responde: el cliente quiere segmentar a TODO el que entra, no solo a quien
 * termina registrándose, así que se guarda en cuanto se contesta y viaja con
 * los dos formularios.
 */
export const AREAS_EXPLORAR = [
  'Soluciones de Impresión / Impresión Digital',
  'Soluciones tecnológicas para el sector turístico',
] as const

/** Rangos de edad — mismos en empresa y estudiante para poder cruzarlos. */
export const RANGOS_EDAD = [
  'Menos de 16 años',
  '16 - 18 años',
  '19 - 24 años',
  '25 - 34 años',
  '35 - 44 años',
  '45 - 54 años',
  '55 años o más',
] as const

/** Tipo de institución del estudiante. «Carrera» solo aplica a Universidad. */
export const TIPOS_INSTITUCION = ['Preparatoria', 'Universidad'] as const

/** Competencias del evento. «Ninguna» es excluyente. */
export const COMPETENCIAS = ['Sumobots', 'Hackathon', 'Ninguna'] as const

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

/**
 * Áreas de interés, ahora partidas por marca (cambio del cliente, sep-2026).
 * Son dos ofertas distintas: FICTI es impresión y manufactura; Tech Capital es
 * turismo y negocio. Mezclarlas en una sola lista, como estaba, obligaba al
 * asistente a leer 17 opciones ajenas para encontrar la suya.
 *
 * Se guardan en un solo arreglo (`ProductosInteres`) porque los valores no se
 * repiten entre bloques y la columna ya existe; el bloque se deduce del valor.
 */
export const AREAS_INTERES_FICTI = [
  'Impresión digital',
  'Impresión de empaque y etiqueta',
  'Impresión textil y decoración de prendas',
  'Señalización y display',
  'Artículos promocionales',
  'Impresión 3D',
  'Serigrafía',
  'Offset',
  'Fabricación textil',
  'Corte, grabado y acabado',
  'Acabado',
  'Sustratos',
  'Tintas y consumibles',
  'Decoración de interiores',
  'Wrap',
  'Tampografía',
] as const

export const AREAS_INTERES_TECH = [
  'Alianzas y oportunidades de negocio',
  'Emprendimiento e inversión en turismo',
  'Networking y vinculación empresarial',
  'Tecnología para hoteles y restaurantes',
  'Inteligencia Artificial aplicada al turismo',
  'Innovación y transformación digital del turismo',
] as const

export type EmpresaFormData = {
  email: string
  emailConfirm: string
  edad: string
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
  edad: string
  nombre: string
  apellidoPaterno: string
  phoneCountry: string
  telefono: string
  /** 'Preparatoria' | 'Universidad' — sustituye al texto libre anterior. */
  tipoInstitucion: string
  /** Solo se pide (y solo se guarda) cuando el tipo es Universidad. */
  carrera: string
  /**
   * Competencias en las que participa. Múltiple porque el mock del cliente
   * dibuja casillas y un estudiante puede entrar a Sumobots y a Hackathon;
   * 'Ninguna' es excluyente y limpia el resto.
   */
  competencias: string[]
}

export const emptyEmpresaForm = (): EmpresaFormData => ({
  email: '',
  emailConfirm: '',
  edad: '',
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
  edad: '',
  nombre: '',
  apellidoPaterno: '',
  phoneCountry: 'MX',
  telefono: '',
  tipoInstitucion: '',
  carrera: '',
  competencias: [],
})
