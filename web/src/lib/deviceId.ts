/** Persistencia de etiqueta de estación / PDA (demo). */

const KEY = 'ficti_device_id'

export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(KEY)
    if (existing && existing.trim()) return existing.trim().slice(0, 60)
    const gen = `pda-${Math.random().toString(36).slice(2, 8)}`
    localStorage.setItem(KEY, gen)
    return gen
  } catch {
    return 'pda'
  }
}

export function setDeviceId(value: string): string {
  const v = value.trim().slice(0, 60) || getDeviceId()
  try {
    localStorage.setItem(KEY, v)
  } catch {
    /* ignore */
  }
  return v
}
