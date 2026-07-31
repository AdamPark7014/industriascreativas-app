export type CountryDial = {
  code: string
  dial: string
  name: string
  flag: string
  /** Dígitos locales esperados (mín–máx) */
  minLen: number
  maxLen: number
}

/** Ladas frecuentes para registro profesional */
export const COUNTRY_DIALS: CountryDial[] = [
  { code: 'MX', dial: '+52', name: 'México', flag: '🇲🇽', minLen: 10, maxLen: 10 },
  { code: 'US', dial: '+1', name: 'Estados Unidos', flag: '🇺🇸', minLen: 10, maxLen: 10 },
  { code: 'CA', dial: '+1', name: 'Canadá', flag: '🇨🇦', minLen: 10, maxLen: 10 },
  { code: 'GT', dial: '+502', name: 'Guatemala', flag: '🇬🇹', minLen: 8, maxLen: 8 },
  { code: 'SV', dial: '+503', name: 'El Salvador', flag: '🇸🇻', minLen: 8, maxLen: 8 },
  { code: 'HN', dial: '+504', name: 'Honduras', flag: '🇭🇳', minLen: 8, maxLen: 8 },
  { code: 'NI', dial: '+505', name: 'Nicaragua', flag: '🇳🇮', minLen: 8, maxLen: 8 },
  { code: 'CR', dial: '+506', name: 'Costa Rica', flag: '🇨🇷', minLen: 8, maxLen: 8 },
  { code: 'PA', dial: '+507', name: 'Panamá', flag: '🇵🇦', minLen: 7, maxLen: 8 },
  { code: 'CO', dial: '+57', name: 'Colombia', flag: '🇨🇴', minLen: 10, maxLen: 10 },
  { code: 'PE', dial: '+51', name: 'Perú', flag: '🇵🇪', minLen: 9, maxLen: 9 },
  { code: 'CL', dial: '+56', name: 'Chile', flag: '🇨🇱', minLen: 9, maxLen: 9 },
  { code: 'AR', dial: '+54', name: 'Argentina', flag: '🇦🇷', minLen: 10, maxLen: 11 },
  { code: 'BR', dial: '+55', name: 'Brasil', flag: '🇧🇷', minLen: 10, maxLen: 11 },
  { code: 'ES', dial: '+34', name: 'España', flag: '🇪🇸', minLen: 9, maxLen: 9 },
  { code: 'GB', dial: '+44', name: 'Reino Unido', flag: '🇬🇧', minLen: 10, maxLen: 11 },
  { code: 'DE', dial: '+49', name: 'Alemania', flag: '🇩🇪', minLen: 10, maxLen: 12 },
]

export function findDial(code: string): CountryDial {
  return COUNTRY_DIALS.find((c) => c.code === code) ?? COUNTRY_DIALS[0]
}

export function formatPhoneDisplay(dial: string, local: string) {
  const digits = local.replace(/\D/g, '')
  if (!digits) return dial
  return `${dial} ${digits}`
}

export function validateLocalPhone(code: string, local: string): string {
  const country = findDial(code)
  const digits = local.replace(/\D/g, '')
  if (!digits) return 'El teléfono es obligatorio.'
  if (digits.length < country.minLen || digits.length > country.maxLen) {
    if (country.minLen === country.maxLen) {
      return `Para ${country.name} el número debe tener ${country.maxLen} dígitos.`
    }
    return `Para ${country.name} el número debe tener entre ${country.minLen} y ${country.maxLen} dígitos.`
  }
  return ''
}
