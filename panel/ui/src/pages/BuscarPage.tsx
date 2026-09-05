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
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [printing, setPrinting] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const run = useCallback(async (query: string, kind: string) => {
    if (query.trim().length < 2) {
      setHits([])
      setSearched(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await api.buscar(query.trim(), kind || undefined)
      setHits(data.results)
      setActive(0)
      setSearched(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo buscar')
      setHits([])
      setSearched(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => void run(q, tipo), 220)
    return () => window.clearTimeout(t)
  }, [q, tipo, run])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const printHit = async (hit: GafeteHit) => {
    if (!sesion?.puedeImprimir) {
      setError('La impresión de gafetes es solo para operación interna.')
      return
    }
    setPrinting(hit.folio)
    setError(null)
    setToast(null)
    try {
      await imprimirGafete(hit.tipo, hit.id)
      setToast(`Listo para imprimir: ${hit.nombre}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el PDF')
    } finally {
      setPrinting(null)
    }
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!hits.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(hits.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter' && hits[active] && sesion?.puedeImprimir) {
      e.preventDefault()
      void printHit(hits[active])
    } else if (e.key === 'Escape') {
      setQ('')
      setHits([])
      setSearched(false)
    }
  }

  return (
    <main className={styles.page}>
      <p className={styles.lead}>
        Escribe nombre, correo, teléfono, empresa o folio
        (<code>EMPRESARIO-12</code>). Enter imprime el gafete 5×8 seleccionado.
      </p>

      <div className={styles.barra}>
        <div className={styles.buscador}>
          <span aria-hidden>⌕</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Buscar acreditación…"
            autoComplete="off"
            aria-label="Buscar acreditación"
          />
        </div>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo">
          <option value="">Todos los tipos</option>
          <option value="empresas">Empresas</option>
          <option value="estudiantes">Estudiantes</option>
          {sesion?.alcance === 'interno' ? <option value="elisa">Elisa Carrillo</option> : null}
        </select>
      </div>

      <div className={styles.meta}>
        {loading ? <span>Buscando…</span> : null}
        {!loading && searched ? (
          <span>
            {hits.length} resultado{hits.length === 1 ? '' : 's'}
          </span>
        ) : null}
        {toast ? <span className={styles.ok}>{toast}</span> : null}
      </div>

      {error ? <div className={styles.alerta}>{error}</div> : null}

      {!searched && q.trim().length < 2 ? (
        <div className={styles.vacio}>
          Empieza a escribir (mínimo 2 caracteres). La búsqueda responde al teclear.
        </div>
      ) : null}

      {searched && !loading && !hits.length ? (
        <div className={styles.vacio}>
          No hay coincidencias para «{q.trim()}». Prueba folio exacto o otro correo.
        </div>
      ) : null}

      {hits.length ? (
        <ul className={styles.lista} role="listbox">
          {hits.map((h, i) => (
            <li
              key={h.folio}
              className={i === active ? styles.on : undefined}
              role="option"
              aria-selected={i === active}
            >
              <div className={styles.info}>
                <div className={styles.filaTop}>
                  <strong>{h.nombre}</strong>
                  <span className={styles.badge}>{h.tipoEtiqueta}</span>
                  {h.dentro ? <span className={styles.dentro}>Dentro</span> : null}
                  {!h.confirmado ? <span className={styles.pend}>Sin confirmar</span> : null}
                </div>
                <p>
                  {h.folio}
                  {h.extra ? ` · ${h.extra}` : ''}
                  {h.correo ? ` · ${h.correo}` : ''}
                </p>
              </div>
              {sesion?.puedeImprimir ? (
                <button
                  type="button"
                  className={styles.btnPrint}
                  disabled={printing === h.folio}
                  onClick={() => void printHit(h)}
                >
                  {printing === h.folio ? 'Generando…' : 'Imprimir 5×8'}
                </button>
              ) : (
                <span className={styles.soloLectura}>Solo lectura</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  )
}
