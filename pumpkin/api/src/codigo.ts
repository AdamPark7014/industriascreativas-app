/**
 * Normaliza lo que manda el lector a "QR-001".
 *
 * Las PDA escriben como teclado y, con distribución de teclado en español, el guion
 * puede llegar como ' o ?. También se acepta el número solo ("7", "007") y un QR que
 * traiga el código dentro de una URL.
 */
export function normalizarCodigo(raw: string): string | null {
  const s = (raw || '').trim().toUpperCase()
  if (!s || s.length > 300) return null
  const m = /QR[^0-9A-Z]{0,2}0*(\d{1,4})(?!\d)/.exec(s) ?? /^0*(\d{1,4})$/.exec(s)
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isInteger(n) || n < 1) return null
  return `QR-${String(n).padStart(3, '0')}`
}

export function numeroDe(codigo: string): number {
  return Number(codigo.slice(3))
}
