import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useOutletContext } from 'react-router-dom'
import { api, imprimirGafete, type GafeteHit, type Sesion } from '../api'
import styles from './buscar.module.scss'

export default function BuscarPage() {
  const sesion = useOutletContext<Sesion | null>()
  const [q, setQ] = useState('')
  const [tipo, setTipo] = useState('')
  const [hits, setHits] = useState<GafeteHit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [printing, setPrinting] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const abort = useRef<AbortController | null>(null)

  const run = useCallback(async (query: string, kind: string) => {
    abort.current?.abort()
    if (query.trim().length < 2) {
      setHits([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await api.buscar(query.trim(), kind || undefined)
      setHits(data.results)
      setActive(0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo buscar')
      setHits([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => void run(q, tipo), 200)
    return () => window.clearTimeout(t)
  }, [q, tipo, run])

  const printHit = async (hit: GafeteHit) => {
    if (!sesion?.puedeImprimir) {
      setError('La impresión es operación interna.')
      return
    }
    setPrinting(hit.folio)
    setError(null)
    try {
      await imprimirGafete(hit.tipo, hit.id)
      setToast(`Gafete listo: ${hit.nombre}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se imprimió')
    } finally {
      setPrinting(null)
    }
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(hits.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter' && hits[active]) {
      e.preventDefault()
      void printHit(hits[active])
    }
  }

  return (
    <main className={styles.page}>
      <p className={styles.kicker}>Taquilla · gafetes</p>
      <h1>Búsqueda rápida</h1>
      <p className={styles.sub}>
        Nombre, correo, teléfono, empresa o folio (EMPRESARIO-12). Enter imprime 5×8.
      </p>
      <div className={styles.bar}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder="Escribe al menos 2 caracteres…"
          autoFocus
        />
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Todos</option>
          <option value="empresas">Empresas</option>
          <option value="estudiantes">Estudiantes</option>
          {sesion?.alcance === 'interno' ? <option value="elisa">Elisa</option> : null}
        </select>
      </div>
      {loading ? <p className={styles.meta}>Buscando…</p> : null}
      {error ? <p className={styles.err}>{error}</p> : null}
      {toast ? <p className={styles.ok}>{toast}</p> : null}
      <ul className={styles.lista}>
        {hits.map((h, i) => (
          <li key={h.folio} className={i === active ? styles.on : undefined}>
            <div>
              <strong>{h.nombre}</strong>
              <span>
                {h.folio} · {h.tipoEtiqueta}
                {h.extra ? ` · ${h.extra}` : ''}
                {h.dentro ? ' · DENTRO' : ''}
              </span>
            </div>
            {sesion?.puedeImprimir ? (
              <button type="button" disabled={printing === h.folio} onClick={() => void printHit(h)}>
                {printing === h.folio ? '…' : 'Imprimir'}
              </button>
            ) : (
              <span className={styles.solo}>{h.correo}</span>
            )}
          </li>
        ))}
      </ul>
    </main>
  )
}
