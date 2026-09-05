/** Cola local de escaneos cuando no hay red. No se trata como acceso confirmado. */

export type QueuedScan = {
  id: string
  qr: string
  modo: 'entrada' | 'salida'
  zona: string
  dispositivo?: string
  at: number
}

const KEY = 'ficti_offline_scans'
/** Descarta escaneos offline más viejos que esto al leer/flush. */
const MAX_AGE_MS = 6 * 60 * 60 * 1000

export function readQueue(): QueuedScan[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as QueuedScan[]
    if (!Array.isArray(parsed)) return []
    const now = Date.now()
    const fresh = parsed.filter((x) => x && now - (x.at || 0) < MAX_AGE_MS)
    if (fresh.length !== parsed.length) writeQueue(fresh)
    return fresh
  } catch {
    return []
  }
}

function writeQueue(items: QueuedScan[]) {
  localStorage.setItem(KEY, JSON.stringify(items.slice(0, 80)))
}

export function enqueueScan(item: Omit<QueuedScan, 'id' | 'at'>): QueuedScan {
  const row: QueuedScan = {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
  }
  const next = [...readQueue(), row]
  writeQueue(next)
  return row
}

export function removeFromQueue(id: string) {
  writeQueue(readQueue().filter((x) => x.id !== id))
}

export async function flushQueue(
  send: (item: QueuedScan) => Promise<boolean>,
): Promise<{ sent: number; left: number }> {
  const items = readQueue()
  let sent = 0
  for (const item of items) {
    try {
      const ok = await send(item)
      if (!ok) break
      removeFromQueue(item.id)
      sent += 1
    } catch {
      break
    }
  }
  return { sent, left: readQueue().length }
}
