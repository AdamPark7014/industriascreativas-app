/**
 * Detecta dominios de correo mal escritos (gmail.con, gamil.com, hotmial.com…).
 * En la base hay registros sin confirmar por eso: el correo de confirmación
 * nunca les llegó. Solo se sugiere contra dominios conocidos, para no "corregir"
 * dominios de empresa o escuela que no conocemos.
 */
const CONOCIDOS = [
  'gmail.com',
  'hotmail.com',
  'hotmail.es',
  'outlook.com',
  'outlook.es',
  'icloud.com',
  'yahoo.com',
  'yahoo.com.mx',
  'live.com',
  'live.com.mx',
  'msn.com',
  'me.com',
  'mac.com',
  'aol.com',
  'gmx.com',
  'proton.me',
  'prodigy.net.mx',
  'alm.buap.mx',
  'alumno.buap.mx',
  'correo.buap.mx',
]

const TLD_ROTO: [RegExp, string][] = [
  [/\.(con|cpm|cim|comm|vom|xom|om)$/, '.com'],
  [/\.(cm|co)$/, '.com'],
  [/\.com\.(mz|nx|mxx)$/, '.com.mx'],
]

/** Distancia de edición con transposiciones (Damerau, versión OSA). */
function distancia(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + costo)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
    }
  }
  return d[a.length][b.length]
}

/** Correo corregido si el dominio parece un error de dedo; null si se ve bien. */
export function correoSugerido(correo: string): string | null {
  const limpio = correo.trim().toLowerCase()
  const arroba = limpio.lastIndexOf('@')
  if (arroba < 1) return null
  const usuario = limpio.slice(0, arroba)
  const dominio = limpio.slice(arroba + 1)
  if (!dominio || CONOCIDOS.includes(dominio)) return null

  let candidato = dominio
  for (const [re, bien] of TLD_ROTO) candidato = candidato.replace(re, bien)
  if (CONOCIDOS.includes(candidato)) return `${usuario}@${candidato}`

  // En dominios cortos dos letras de diferencia ya son otro dominio real.
  const tope = dominio.length < 8 ? 1 : 2
  let mejor: { dominio: string; d: number } | null = null
  for (const conocido of CONOCIDOS) {
    const d = Math.min(distancia(dominio, conocido), distancia(candidato, conocido))
    if (d <= tope && (!mejor || d < mejor.d)) mejor = { dominio: conocido, d }
  }
  return mejor ? `${usuario}@${mejor.dominio}` : null
}
