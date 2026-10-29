/**
 * PUMPKIN Accesos: control de acceso con los 250 pases QR genéricos (QR-001…QR-250).
 * Misma mecánica de puerta que FICTI (panel/accesos-api/src/scan.ts): entrada, salida y
 * reingreso, con el estado dentro/fuera reiniciado cada jornada. Base de datos propia.
 */
export const PREFIJO = '/pumpkin'
export const PUERTO = Number(process.env.PORT || 3090)
export const TZ = 'America/Mexico_City'

/** Firma de sesiones y enlaces de acceso directo. Sin él no arranca. */
export const SECRETO = process.env.PUMPKIN_SECRET || ''

/** Total de pases del lote impreso. */
export const TOTAL_PASES = Number(process.env.PUMPKIN_TOTAL_PASES || 250)

/** Cupo de personas dentro a la vez; 0 = sin límite. */
export const AFORO = Math.max(0, Number(process.env.PUMPKIN_AFORO || 0))

/**
 * Hora (CDMX) en que cambia la jornada. PUMPKIN abre de noche: quien entra a las 23:50
 * sigue "dentro" a la 1:00. Con 6, todo lo de 06:00 a 05:59 del día siguiente es una jornada.
 */
export const CORTE_HORA = Math.min(23, Math.max(0, Number(process.env.PUMPKIN_CORTE_HORA ?? 6)))

export const COOKIE_SEGURA = process.env.PUMPKIN_COOKIE_SECURE !== '0'

export const BASE_URL = (
  process.env.PUMPKIN_BASE_URL || 'https://panel.experiencebt.com.mx/pumpkin'
).replace(/\/+$/, '')

/** Mismo QR + modo dentro de esta ventana: DUPLICADO (lector que dispara dos veces). */
export const SCAN_COOLDOWN_MS = Number(process.env.SCAN_COOLDOWN_MS || 1200)
