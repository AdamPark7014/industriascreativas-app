/**
 * Decode Flask SecureCookieSession (itsdangerous URLSafeTimedSerializer).
 * Matches Flask defaults: salt=cookie-session, digest=sha1, key_derivation=hmac.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { inflateSync } from 'node:zlib'

const SALT = 'cookie-session'

function b64urlDecode(s: string): Buffer {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(b64, 'base64')
}

function deriveKey(secret: string): Buffer {
  return createHmac('sha1', secret).update(SALT, 'utf8').digest()
}

function verify(secret: string, value: string, sigB64: string): boolean {
  const key = deriveKey(secret)
  const expected = createHmac('sha1', key).update(value, 'utf8').digest()
  let got: Buffer
  try {
    got = b64urlDecode(sigB64)
  } catch {
    return false
  }
  if (got.length !== expected.length) return false
  return timingSafeEqual(got, expected)
}

export type FlaskSession = {
  usuario?: string
  nombre?: string
  alcance?: string
  [k: string]: unknown
}

function splitCookie(cookie: string): { payload: string; ts: string; signed: string; sig: string } | null {
  const last = cookie.lastIndexOf('.')
  if (last <= 0) return null
  const sig = cookie.slice(last + 1)
  const withoutSig = cookie.slice(0, last)
  const tsDot = withoutSig.lastIndexOf('.')
  if (tsDot < 0) return null
  const ts = withoutSig.slice(tsDot + 1)
  const payload = withoutSig.slice(0, tsDot)
  if (!payload || !ts || !sig) return null
  return { payload, ts, signed: withoutSig, sig }
}

/** Max age default matches panel PERMANENT_SESSION_LIFETIME ≈ 12h. */
export function decodeFlaskSession(
  cookie: string | undefined,
  secret: string,
  maxAgeSec = 12 * 3600,
): FlaskSession | null {
  if (!cookie || !secret) return null
  const parts = splitCookie(cookie)
  if (!parts) return null
  if (!verify(secret, parts.signed, parts.sig)) return null

  let ts: number
  try {
    const raw = b64urlDecode(parts.ts)
    if (raw.length >= 8) {
      ts = Number(raw.readBigUInt64BE(raw.length - 8))
    } else {
      const padded = Buffer.alloc(8)
      raw.copy(padded, 8 - raw.length)
      ts = Number(padded.readBigUInt64BE(0))
    }
  } catch {
    return null
  }
  const now = Math.floor(Date.now() / 1000)
  if (now - ts > maxAgeSec || ts > now + 120) return null

  try {
    let payloadB64 = parts.payload
    let compressed = false
    if (payloadB64.startsWith('.')) {
      compressed = true
      payloadB64 = payloadB64.slice(1)
    }
    let data = b64urlDecode(payloadB64)
    if (compressed) data = inflateSync(data)
    const obj = JSON.parse(data.toString('utf8')) as FlaskSession
    if (!obj || typeof obj !== 'object') return null
    return obj
  } catch {
    return null
  }
}
