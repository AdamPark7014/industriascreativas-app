/** Códigos de rechazo / éxito del hot-path de escaneo (FICTI Accesos). */
export const CODIGOS = {
  OK_ENTRY: 'OK_ENTRY',
  OK_EXIT: 'OK_EXIT',
  OK_REENTRY: 'OK_REENTRY',
  NOT_FOUND: 'NOT_FOUND',
  INVALID_QR: 'INVALID_QR',
  UNCONFIRMED: 'UNCONFIRMED',
  BLACKLISTED: 'BLACKLISTED',
  ALREADY_INSIDE: 'ALREADY_INSIDE',
  NOT_INSIDE: 'NOT_INSIDE',
  ZONE_FULL: 'ZONE_FULL',
  ZONE_REQUIRED: 'ZONE_REQUIRED',
  OUTSIDE_HOURS: 'OUTSIDE_HOURS',
  DUPLICATE: 'DUPLICATE',
  COOLDOWN: 'COOLDOWN',
  SIN_DATOS: 'SIN_DATOS',
  UNAUTHORIZED: 'UNAUTHORIZED',
  RATE_LIMIT: 'RATE_LIMIT',
  SOLO_INTERNO: 'SOLO_INTERNO',
} as const

export type CodigoAcceso = (typeof CODIGOS)[keyof typeof CODIGOS]

/** Debounce servidor: mismo QR+modo dentro de esta ventana → COOLDOWN/DUPLICATE. */
export const SCAN_COOLDOWN_MS = Number(process.env.SCAN_COOLDOWN_MS || 1200)

/** Columnas mínimas por tipo (evita SELECT * en hot path). */
export const SCAN_COLS: Record<string, string> = {
  empresas:
    '"idEmpresario", "Nombre", "ApellidoPaterno", "ApellidoMaterno", "confirmado", "asistencias"',
  estudiantes:
    '"idAlumno", "Nombre", "ApellidoPaterno", "ApellidoMaterno", "confirmado", "asistencias"',
  elisa: '"idUsuario", "Nombre", "confirmado", "asistencias"',
}
