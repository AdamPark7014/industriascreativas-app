import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  abrirPdfGafete,
  api,
  cargarBoleto,
  type BoletoPayload,
  type GafeteHit,
  type Sesion,
} from '../api'
import BoletoPrintModal from '../components/BoletoPrintModal'
import { printBoletoIsolated, renderBoletoPngBase64 } from '../lib/boletoRender'
import { printPngViaAgent, probePrintAgent } from '../lib/printAgent'
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
  const [boleto, setBoleto] = useState<(BoletoPayload & { tipoKey: string; id: number }) | null>(
    null,
  )
  const [active, setActive] = useState(0)
  const [bridgeReady, setBridgeReady] = useState<boolean | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const run = useCallback(async (query: string, kind: string) => {
    if (query.trim().length < 2) {
      abortRef.current?.abort()
      setHits([])
      setSearched(false)
      setLoading(false)
      return
    }
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setLoading(true)
    setError(null)
    try {
      const data = await api.buscar(query.trim(), kind || undefined, ac.signal)
      if (ac.signal.aborted) return
      setHits(data.results)
      setActive(0)
      setSearched(true)
    } catch (e) {
      if (ac.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) return
      setError(e instanceof Error ? e.message : 'No se pudo buscar')
      setHits([])
      setSearched(true)
    } finally {
      if (!ac.signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => void run(q, tipo), 220)
    return () => window.clearTimeout(t)
  }, [q, tipo, run])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    let cancelled = false
    void probePrintAgent().then((h) => {
      if (!cancelled) setBridgeReady(Boolean(h.ok && h.reachable))
    })
    return () => {
      cancelled = true
    }
  }, [boleto])

  const abrirPreview = async (hit: GafeteHit) => {
    if (!sesion?.puedeImprimir) {
      setError('Tu rol puede consultar acreditaciones, pero no imprimir boletos. Pide ayuda a operación interna.')
      return
    }
    setPrinting(hit.folio)
    setError(null)
    setToast(null)
    try {
      const data = await cargarBoleto(hit.tipo, hit.id)
      setBoleto({ ...data, tipoKey: hit.tipo, id: hit.id })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo preparar el boleto')
    } finally {
      setPrinting(null)
    }
  }

  const imprimirPantalla = () => {
    if (!boleto) return
    const root = document.querySelector('[data-boleto-print-root] [data-boleto-face]')
    if (root) {
      try {
        printBoletoIsolated(root.outerHTML)
        setToast(`Impresión 62×100 · ${boleto.nombre}`)
        return
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se abrió la ventana de impresión')
      }
    }
    window.print()
    setToast(`Diálogo de impresión abierto · ${boleto.nombre}`)
  }

  const imprimirQl = async () => {
    if (!boleto) return
    setPrinting(boleto.folio)
    setError(null)
    try {
      const png = await renderBoletoPngBase64(boleto)
      const res = await printPngViaAgent(png, {
        title: boleto.nombre,
        body: `${boleto.tipo}\n${boleto.folio}`,
        footer: 'FICTI Accesos',
      })
      if (!res.ok) {
        setBridgeReady(false)
        throw new Error(
          res.error ||
            'Agente QL offline. En esta PC: EXPERIENCEBT-app\\tools\\print-bridge\\start.cmd',
        )
      }
      setBridgeReady(true)
      setToast(`QL · ${res.printer ?? 'impreso'} · ${boleto.nombre}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo imprimir en QL')
    } finally {
      setPrinting(null)
    }
  }

  const abrirPdf = async () => {
    if (!boleto) return
    setPrinting(boleto.folio)
    try {
      await abrirPdfGafete(boleto.tipoKey, boleto.id)
      setToast(`PDF 62×100 · ${boleto.nombre}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir el PDF')
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
      void abrirPreview(hits[active])
    } else if (e.key === 'Escape') {
      setQ('')
      setHits([])
      setSearched(false)
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.guia} aria-label="Cómo imprimir">
        <ol>
          <li>
            <strong>1 · Busca</strong>
            <span>Nombre, correo, empresa o folio</span>
          </li>
          <li>
            <strong>2 · Elige</strong>
            <span>Flechas ↑↓ o clic en la persona</span>
          </li>
          <li>
            <strong>3 · Imprime</strong>
            <span>Enter o el botón del boleto 62 mm</span>
          </li>
        </ol>
      </section>

      <p className={styles.lead}>
        Encuentra a la persona y saca su boleto de puerta (QR + nombre). Ejemplo de folio:{' '}
        <code>EMPRESARIO-12</code>.
      </p>

      <div className={styles.barra}>
        <div className={styles.buscador}>
          <span aria-hidden>⌕</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Escribe nombre, correo o folio…"
            autoComplete="off"
            aria-label="Buscar persona para imprimir boleto"
          />
        </div>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Filtrar por tipo">
          <option value="">Todos</option>
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
            {sesion?.puedeImprimir ? ' · Enter abre el boleto' : ''}
          </span>
        ) : null}
        {toast ? <span className={styles.ok}>{toast}</span> : null}
      </div>

      {error ? <div className={styles.alerta}>{error}</div> : null}

      {!searched && q.trim().length < 2 ? (
        <div className={styles.vacio}>
          <strong>Empieza a escribir</strong>
          <p>Con 2 letras ya aparecen coincidencias. No hace falta pulsar Buscar.</p>
        </div>
      ) : null}

      {searched && !loading && !hits.length ? (
        <div className={styles.vacio}>
          <strong>Sin coincidencias para «{q.trim()}»</strong>
          <p>Prueba el folio exacto, otro correo o quita el filtro de tipo.</p>
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
              onClick={() => setActive(i)}
            >
              <div className={styles.info}>
                <div className={styles.filaTop}>
                  <strong>{h.nombre}</strong>
                  <span className={styles.badge}>{h.tipoEtiqueta}</span>
                  {h.dentro ? <span className={styles.dentro}>Ya dentro</span> : null}
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
                  onClick={() => void abrirPreview(h)}
                >
                  {printing === h.folio ? 'Preparando…' : 'Ver e imprimir'}
                </button>
              ) : (
                <span className={styles.soloLectura}>Solo consulta</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {boleto ? (
        <BoletoPrintModal
          data={boleto}
          busy={printing === boleto.folio}
          bridgeReady={bridgeReady}
          onClose={() => setBoleto(null)}
          onPrint={imprimirPantalla}
          onPdf={() => void abrirPdf()}
          onPrintQl={() => void imprimirQl()}
        />
      ) : null}
    </main>
  )
}
