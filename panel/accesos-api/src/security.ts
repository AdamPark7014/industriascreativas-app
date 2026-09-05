import { timingSafeEqual } from 'node:crypto'

type Bucket = { times: number[] }

const buckets = new Map<string, Bucket>()

export function rateOk(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  let b = buckets.get(key)
  if (!b) {
    b = { times: [] }
    buckets.set(key, b)
  }
  b.times = b.times.filter((t) => now - t < windowMs)
  if (b.times.length >= max) return false
  b.times.push(now)
  return true
}

export function clientIp(headers: Headers, fallback = '?'): string {
  const xff = headers.get('x-forwarded-for') || ''
  return xff.split(',')[0]?.trim() || headers.get('x-real-ip') || fallback
}

export function safeEq(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

export function origenConfiable(headers: Headers, hostHeader: string | undefined): boolean {
  const host = (hostHeader || '').split(':')[0].toLowerCase()
  const permitidos = new Set([
    `https://${host}`,
    'https://panel.experiencebt.com.mx',
    'https://demo.experiencebt.com.mx',
  ])
  if (host === '127.0.0.1' || host === 'localhost') {
    permitidos.add(`http://${host}`)
    permitidos.add(`http://${host}:5000`)
    permitidos.add(`http://${host}:5173`)
    permitidos.add(`http://${host}:3080`)
  }
  const origin = (headers.get('origin') || '').replace(/\/$/, '')
  if (origin) return permitidos.has(origin)
  const referer = headers.get('referer') || ''
  for (const p of permitidos) {
    if (referer === p || referer.startsWith(p + '/')) return true
  }
  // GET-like: caller decides; for POST without Origin/Referer reject
  return false
}
