import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { api, horaCorta, tiene, type GafeteHit, type Sesion } from '../api'
import FichaPersona from '../components/FichaPersona'
import { useBoletoImpresion } from '../lib/useBoletoImpresion'
import styles from './buscar.module.scss'

type FichaRef = { tipo: string; id: number }

export default function BuscarPage() {
  const sesion = useOutletContext<Sesion | null>()
  const [params] = useSearchParams()
  const [q, setQ] = useState(() => params.get('q') ?? '')
  const [tipo, setTipo] = useState('')
  const [hits, setHits] = useState<GafeteHit[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const [ficha, setFicha] = useState<FichaRef | null>(null)
  /** Sube cuando cambia algo de la persona abierta (impresión, confirmación) para recargar su ficha. */
  const [fichaVersion, setFichaVersion] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const puedeImprimir = Boolean(sesion?.puedeImprimir)

  const aplicarContador = useCallback((tipoKey: string, id: number, total: number, ultima: string | null) => {
    setHits((prev) =>
      prev.map((h) =>
        h.tipo === tipoKey && h.id === id ? { ...h, impresiones: total, ultimaImpresion: ultima } : h,
      ),
    )
    setFichaVersion((v) => v + 1)
  }, [])

  const impresion = useBoletoImpresion({ sesion, onContador: aplicarContador })

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

  const abrirFicha = (h: GafeteHit) => setFicha({ tipo: h.tipo, id: h.id })

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!hits.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(hits.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter' && hits[active]) {
      e.preventDefault()
      abrirFicha(hits[active])
    } else if (e.key === 'Escape') {
      setQ('')
      setHits([])
      setSearched(false)
    }
  }

  const alerta = error || impresion.error
  const toast = impresion.toast

  return (
    <main className={styles.page}>
      {impresion.estado}

      <section className={styles.guia} aria-label="Cómo atender">
        <ol>
          <li>
            <strong>1 · Busca</strong>
            <span>Nombre, correo, teléfono o folio</span>
          </li>
          <li>
            <strong>2 · Abre la ficha</strong>
            <span>Enter o «Ver ficha»: datos, accesos y boleto digital</span>
          </li>
          <li>
            <strong>3 · Resuelve</strong>
            <span>{puedeImprimir ? 'Imprime la etiqueta o reenvía el boleto' : 'Reenvía el boleto por correo'}</span>
          </li>
        </ol>
      </section>

      <div className={styles.barra}>
        <div className={styles.buscador}>
          <span aria-hidden>⌕</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Nombre, correo, teléfono o folio…"
            autoComplete="off"
            aria-label="Buscar persona registrada"
          />
        </div>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Filtrar por tipo">
          <option value="">Todos</option>
          <option value="empresas">Empresas</option>
          <option value="estudiantes">Estudiantes</option>
          {tiene(sesion, 'elisa') ? <option value="elisa">Elisa Carrillo</option> : null}
        </select>
      </div>

      <div className={styles.meta}>
        {loading ? <span>Buscando…</span> : null}
        {!loading && searched ? (
          <span>
            {hits.length} resultado{hits.length === 1 ? '' : 's'} · Enter abre la ficha
          </span>
        ) : null}
        {toast ? (
          <span className={toast.tono === 'ok' ? styles.ok : styles.aviso} role="status">
            {toast.texto}
          </span>
        ) : null}
      </div>

      {alerta ? <div className={styles.alerta}>{alerta}</div> : null}

      {!searched && q.trim().length < 2 ? (
        <div className={styles.vacio}>
          <strong>Empieza a escribir</strong>
          <p>Con 2 letras ya aparecen coincidencias. El teléfono puede ir con o sin espacios.</p>
        </div>
      ) : null}

      {searched && !loading && !hits.length ? (
        <div className={styles.vacio}>
          <strong>Sin coincidencias para «{q.trim()}»</strong>
          <p>
            Prueba el folio exacto, otro correo o quita el filtro de tipo. Si no se registró, mándala
            a la mesa de registro.
          </p>
        </div>
      ) : null}

      {hits.length ? (
        <ul className={styles.lista} role="listbox">
          {hits.map((h, i) => {
            const n = h.impresiones ?? 0
            const hora = horaCorta(h.ultimaImpresion)
            return (
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
                    {h.dentro ? <span className={styles.dentro}>Ya escaneado</span> : null}
                    {!h.confirmado ? <span className={styles.pend}>Sin confirmar</span> : null}
                    {n > 0 ? (
                      <span className={styles.impresoBadge} title="Boletos impresos registrados">
                        Impreso ×{n}
                        {hora ? ` · ${hora}` : ''}
                      </span>
                    ) : null}
                  </div>
                  <p>
                    {h.folio}
                    {h.extra ? ` · ${h.extra}` : ''}
                    {h.correo ? ` · ${h.correo}` : ''}
                    {h.telefono ? ` · ${h.telefono}` : ''}
                  </p>
                </div>
                <div className={styles.acciones}>
                  <button type="button" className={styles.btnFicha} onClick={() => abrirFicha(h)}>
                    Ver ficha
                  </button>
                  {puedeImprimir ? (
                    <button
                      type="button"
                      className={styles.btnPrint}
                      disabled={impresion.ocupado(h.tipo, h.id)}
                      onClick={() =>
                        void impresion.abrir(h.tipo, h.id, {
                          impresiones: h.impresiones,
                          ultimaImpresion: h.ultimaImpresion,
                        })
                      }
                    >
                      {impresion.ocupado(h.tipo, h.id) ? 'Preparando…' : 'Imprimir'}
                    </button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}

      {ficha ? (
        <FichaPersona
          tipo={ficha.tipo}
          id={ficha.id}
          sesion={sesion}
          version={fichaVersion}
          ocupado={impresion.ocupado(ficha.tipo, ficha.id)}
          onImprimir={(previo) => void impresion.abrir(ficha.tipo, ficha.id, previo)}
          onCambio={() => void run(q, tipo)}
          onClose={() => setFicha(null)}
        />
      ) : null}

      {impresion.modal}
    </main>
  )
}
