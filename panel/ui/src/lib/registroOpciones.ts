/**
 * Opciones del formulario público (web/src/constants/registro.ts y phone.ts),
 * copiadas porque el panel se construye en otro contexto de Docker y no puede
 * importarlas. Si el cliente cambia una lista allá, cámbiala aquí también: la
 * validación del alta en sitio (accesos-api/src/personas.ts) usa las mismas.
 */

export const AREAS_EXPLORAR = [
  'Soluciones de Impresión / Impresión Digital',
  'Soluciones tecnológicas para el sector turístico',
] as const

export const RANGOS_EDAD = [
  'Menos de 16 años',
  '16 - 18 años',
  '19 - 24 años',
  '25 - 34 años',
  '35 - 44 años',
  '45 - 54 años',
  '55 años o más',
] as const

export const POSICIONES_EMPRESA = [
  'Propietario / director / socio',
  'Gerente',
  'Ejecutivo / Asistente',
  'Consultor',
  'Otro',
] as const

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

/** «Carrera» solo aplica a Universidad. */
export const TIPOS_INSTITUCION = ['Preparatoria', 'Universidad'] as const

/** «Ninguna» es excluyente. */
export const COMPETENCIAS = ['Sumobots', 'Hackathon', 'Ninguna'] as const

export type Lada = { code: string; dial: string; name: string; minLen: number; maxLen: number }

export const LADAS: Lada[] = [
  { code: 'MX', dial: '+52', name: 'México', minLen: 10, maxLen: 10 },
  { code: 'US', dial: '+1', name: 'Estados Unidos', minLen: 10, maxLen: 10 },
  { code: 'CA', dial: '+1', name: 'Canadá', minLen: 10, maxLen: 10 },
  { code: 'GT', dial: '+502', name: 'Guatemala', minLen: 8, maxLen: 8 },
  { code: 'SV', dial: '+503', name: 'El Salvador', minLen: 8, maxLen: 8 },
  { code: 'HN', dial: '+504', name: 'Honduras', minLen: 8, maxLen: 8 },
  { code: 'NI', dial: '+505', name: 'Nicaragua', minLen: 8, maxLen: 8 },
  { code: 'CR', dial: '+506', name: 'Costa Rica', minLen: 8, maxLen: 8 },
  { code: 'PA', dial: '+507', name: 'Panamá', minLen: 7, maxLen: 8 },
  { code: 'CO', dial: '+57', name: 'Colombia', minLen: 10, maxLen: 10 },
  { code: 'PE', dial: '+51', name: 'Perú', minLen: 9, maxLen: 9 },
  { code: 'CL', dial: '+56', name: 'Chile', minLen: 9, maxLen: 9 },
  { code: 'AR', dial: '+54', name: 'Argentina', minLen: 10, maxLen: 11 },
  { code: 'BR', dial: '+55', name: 'Brasil', minLen: 10, maxLen: 11 },
  { code: 'ES', dial: '+34', name: 'España', minLen: 9, maxLen: 9 },
  { code: 'GB', dial: '+44', name: 'Reino Unido', minLen: 10, maxLen: 11 },
  { code: 'DE', dial: '+49', name: 'Alemania', minLen: 10, maxLen: 12 },
]

export function buscarLada(code: string): Lada {
  return LADAS.find((l) => l.code === code) ?? LADAS[0]
}

/** Mismo mensaje que el formulario público; '' si el número es válido para ese país. */
export function validarTelefono(code: string, local: string): string {
  const lada = buscarLada(code)
  const digitos = local.replace(/\D/g, '')
  if (!digitos) return 'El teléfono es obligatorio.'
  if (digitos.length < lada.minLen || digitos.length > lada.maxLen) {
    return lada.minLen === lada.maxLen
      ? `Para ${lada.name} el número debe tener ${lada.maxLen} dígitos.`
      : `Para ${lada.name} el número debe tener entre ${lada.minLen} y ${lada.maxLen} dígitos.`
  }
  return ''
}
