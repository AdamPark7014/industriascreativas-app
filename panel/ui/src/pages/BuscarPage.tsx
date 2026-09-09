import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  abrirPdfGafete,
  api,
  borrarImpresiones,
  cargarBoleto,
  horaCorta,
  jobIdParaApi,
  registrarImpresion,
  type BoletoPayload,
  type GafeteHit,
  type ImpresionVia,
  type RegistrarImpresionBody,
  type RegistrarImpresionResp,
  type Sesion,
} from '../api'
import BoletoPrintModal from '../components/BoletoPrintModal'
import PrintBridgeInstall from '../components/PrintBridgeInstall'
import { printBoletoIsolated, renderBoletoPngBase64 } from '../lib/boletoRender'
import { getDeviceId } from '../lib/deviceId'
import {
  PRINT_BRIDGE_INSTALLER,
  describeColorMode,
  printPngViaAgent,
  probePrintAgent,
  type PrintColorMode,
} from '../lib/printAgent'
import styles from './buscar.module.scss'

/** Sondeo del agente local (/health) en la página: al montar y cada 20 s. */
const PROBE_INTERVAL_MS = 20_000

type Toast = { texto: string; tono: 'ok' | 'aviso' }

type BoletoAbierto = BoletoPayload & { tipoKey: string; id: number }

/** Etiqueta corta de esta PC para el registro de impresión (≤ 60 chars, sin símbolos raros). */
function etiquetaDispositivo(): string {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  const plataforma = (nav.userAgentData?.platform || navigator.platform || 'pc').trim()
  return `${plataforma} ${getDeviceId()}`.replace(/[^\w.\-:@ ]+/g, '').slice(0, 60)
}

export default function BuscarPage() {
  const sesion = useOutletContext<Sesion | null>()
  const [q, setQ] = useState('')
  const [tipo, setTipo] = useState('')
  const [hits, setHits] = useState<GafeteHit[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [printing, setPrinting] = useState<string | null>(null)
  const [unmarking, setUnmarking] = useState(false)
  const [boleto, setBoleto] = useState<BoletoAbierto | null>(null)
  const [active, setActive] = useState(0)
  const [bridgeReady, setBridgeReady] = useState<boolean | null>(null)
  const [bridgePrinter, setBridgePrinter] = useState<string | null>(null)
  const [bridgeColorMode, setBridgeColorMode] = useState<PrintColorMode | null>(null)
  /** false = la QL-800 está apagada o sin USB según Windows (el agente sí responde). */
  const [bridgePrinterOnline, setBridgePrinterOnline] = useState<boolean | null>(null)
  const [bridgeProbing, setBridgeProbing] = useState(false)
  const [mostrarInstalar, setMostrarInstalar] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const instalarRef = useRef<HTMLElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const probeSeq = useRef(0)
  const printingRef = useRef(false)

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

  /** Sondea /health del agente local; ignora respuestas viejas si se solapan. */
  const probe = useCallback(async () => {
    const seq = ++probeSeq.current
    setBridgeProbing(true)
    const h = await probePrintAgent()
    if (seq !== probeSeq.current) return
    setBridgeReady(Boolean(h.ok && h.reachable))
    setBridgePrinter(h.printerName ?? null)
    setBridgeColorMode(h.colorMode ?? null)
    setBridgePrinterOnline(h.printerOnline ?? null)
    setBridgeProbing(false)
  }, [])

  // Al montar y cada 20 s (no mientras se está imprimiendo, para no pisar el estado).
  useEffect(() => {
    void probe()
    const t = window.setInterval(() => {
      if (!printingRef.current) void probe()
    }, PROBE_INTERVAL_MS)
    return () => {
      window.clearInterval(t)
      probeSeq.current++
    }
  }, [probe])

  // Al abrir el modal se vuelve a comprobar (el operador pudo instalar entre búsquedas).
  useEffect(() => {
    if (boleto) void probe()
  }, [boleto, probe])

  // Si la impresora aparece, el panel de instalación ya no hace falta.
  useEffect(() => {
    if (bridgeReady === true) setMostrarInstalar(false)
  }, [bridgeReady])

  useEffect(() => {
    if (mostrarInstalar) instalarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [mostrarInstalar])

  /** Aplica el contador que devuelve el API al resultado y al modal abierto. */
  const aplicarContador = useCallback(
    (tipoKey: string, id: number, total: number, ultima: string | null) => {
      setHits((prev) =>
        prev.map((h) =>
          h.tipo === tipoKey && h.id === id ? { ...h, impresiones: total, ultimaImpresion: ultima } : h,
        ),
      )
      setBoleto((prev) =>
        prev && prev.tipoKey === tipoKey && prev.id === id
          ? { ...prev, impresiones: total, ultimaImpresion: ultima }
          : prev,
      )
    },
    [],
  )

  /**
   * Registra la impresión en la BD. Devuelve null si falló (red/API): la
   * impresión ya salió, así que nunca bloquea al operador.
   */
  const registrar = async (
    b: BoletoAbierto,
    via: ImpresionVia,
    extra: Omit<RegistrarImpresionBody, 'via' | 'dispositivo'> = {},
  ): Promise<RegistrarImpresionResp | null> => {
    try {
      const r = await registrarImpresion(b.tipoKey, b.id, {
        via,
        ...extra,
        dispositivo: etiquetaDispositivo(),
      })
      aplicarContador(b.tipoKey, b.id, r.total, r.ultima)
      return r
    } catch {
      return null
    }
  }

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
      setBoleto({
        ...data,
        tipoKey: hit.tipo,
        id: hit.id,
        impresiones: data.impresiones ?? hit.impresiones ?? 0,
        ultimaImpresion: data.ultimaImpresion ?? hit.ultimaImpresion ?? null,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo preparar el boleto')
    } finally {
      setPrinting(null)
    }
  }

  /** "Más opciones": ventana aislada 62×100. NUNCA cae a window.print silencioso. */
  const imprimirChrome = () => {
    if (!boleto) return
    const root = document.querySelector('[data-boleto-print-root] [data-boleto-face]')
    if (!root) {
      setError('No hay preview del boleto. Cierra y vuelve a abrir. (El camino principal es Imprimir boleto.)')
      return
    }
    const b = boleto
    try {
      printBoletoIsolated(root.outerHTML)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se abrió la ventana de impresión')
      return
    }
    // Se registra al abrir el diálogo de Chrome: no hay forma de saber si el
    // operador confirmó ni si la Brother aceptó el job (puede salir 29×90).
    void registrar(b, 'chrome').then((r) => {
      setToast({
        texto: r
          ? `Chrome · diálogo abierto y registrado (×${r.total}) · ${b.nombre}`
          : `Chrome · diálogo abierto, pero no se pudo registrar · ${b.nombre}`,
        tono: r ? 'ok' : 'aviso',
      })
    })
  }

  const imprimirQl = async () => {
    if (!boleto) return
    const b = boleto
    setPrinting(b.folio)
    printingRef.current = true
    setError(null)
    try {
      const png = await renderBoletoPngBase64(b)
      const res = await printPngViaAgent(png, {
        title: b.nombre,
        body: `${b.tipo}\n${b.folio}`,
        footer: 'FICTI Accesos',
        colorMode: 'auto',
      })
      if (!res.ok) {
        // Si el agente contestó (aunque con error) sigue estando online; solo
        // se marca offline cuando ni siquiera hubo respuesta de red.
        setBridgeReady(res.reachable === true)
        const detail =
          res.error ||
          `El agente de impresión no respondió. Instala la impresora en esta PC (${PRINT_BRIDGE_INSTALLER}, dentro del ZIP) e inténtalo de nuevo.`
        // NEVER window.print() fallback — that sends SPA title as 29×90
        window.alert(`No se imprimió el boleto:\n\n${detail}\n\nNo se usó Chrome. Corrige lo indicado e inténtalo de nuevo.`)
        throw new Error(detail)
      }
      setBridgeReady(true)
      setBridgePrinter(res.printer ?? null)
      if (res.colorMode) setBridgeColorMode(res.colorMode)

      // Ya salió por la QL: se registra en la BD. Si el registro falla, se avisa sin bloquear.
      const reg = await registrar(b, 'ql', {
        impresora: (res.printer ?? '').slice(0, 120) || null,
        modoColor: res.colorMode ?? null,
        jobId: jobIdParaApi(res.jobId),
      })
      const rollo = describeColorMode(res.colorMode) ?? res.mediaName ?? '62 mm'
      setToast(
        reg
          ? { texto: `Boleto impreso y registrado (×${reg.total}) · ${b.nombre} · ${rollo}`, tono: 'ok' }
          : { texto: `Impreso, pero no se pudo registrar · ${b.nombre}`, tono: 'aviso' },
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo imprimir el boleto')
    } finally {
      printingRef.current = false
      setPrinting(null)
    }
  }

  const abrirPdf = async () => {
    if (!boleto) return
    const b = boleto
    setPrinting(b.folio)
    try {
      await abrirPdfGafete(b.tipoKey, b.id)
      // Se registra al abrir el PDF: no hay garantía de que el operador lo imprima.
      const r = await registrar(b, 'pdf')
      setToast({
        texto: r
          ? `PDF 62×100 abierto y registrado (×${r.total}) · ${b.nombre}`
          : `PDF abierto, pero no se pudo registrar · ${b.nombre}`,
        tono: r ? 'ok' : 'aviso',
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir el PDF')
    } finally {
      setPrinting(null)
    }
  }

  /** "Marcar como no impreso": borra todas las impresiones registradas del boleto. */
  const desmarcar = async () => {
    if (!boleto) return
    const b = boleto
    const n = b.impresiones ?? 0
    if (
      !window.confirm(
        `¿Marcar el boleto de ${b.nombre} como no impreso?\n\nSe borran ${n === 1 ? '1 impresión registrada' : `${n} impresiones registradas`} y el contador vuelve a 0.`,
      )
    ) {
      return
    }
    setUnmarking(true)
    setError(null)
    try {
      const r = await borrarImpresiones(b.tipoKey, b.id)
      aplicarContador(b.tipoKey, b.id, r.total, null)
      setToast({ texto: `Marcado como no impreso (${r.borradas} borradas) · ${b.nombre}`, tono: 'ok' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo marcar como no impreso')
    } finally {
      setUnmarking(false)
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

  const rollo = describeColorMode(bridgeColorMode)

  return (
    <main className={styles.page}>
      {sesion?.puedeImprimir ? (
        <div className={styles.chipFila} aria-live="polite">
          {bridgeReady === true && bridgePrinterOnline === false ? (
            <span className={styles.chipWarn} role="status">
              Impresora apagada o desconectada · enciende la {bridgePrinter || 'Brother QL-800'} y revisa el USB
            </span>
          ) : bridgeReady === true ? (
            <span className={styles.chipOk}>
              Impresora lista · {bridgePrinter || 'Brother QL-800'}
              {rollo ? ` · ${rollo}` : ''}
            </span>
          ) : bridgeReady === false ? (
            <button
              type="button"
              className={styles.chipOff}
              onClick={() => setMostrarInstalar((v) => !v)}
              aria-expanded={mostrarInstalar}
            >
              Impresora no instalada en esta PC → Instalar
            </button>
          ) : (
            <span className={styles.chipProbe}>Comprobando impresora…</span>
          )}
        </div>
      ) : null}

      {mostrarInstalar && bridgeReady === false ? (
        <section className={styles.instalarBloque} ref={instalarRef}>
          <PrintBridgeInstall onReprobe={() => void probe()} probing={bridgeProbing} />
        </section>
      ) : null}

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
            <span>Enter y luego el botón Imprimir boleto</span>
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
        {toast ? (
          <span className={toast.tono === 'ok' ? styles.ok : styles.aviso} role="status">
            {toast.texto}
          </span>
        ) : null}
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
                    {h.dentro ? <span className={styles.dentro}>Ya dentro</span> : null}
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
            )
          })}
        </ul>
      ) : null}

      {boleto ? (
        <BoletoPrintModal
          data={boleto}
          busy={printing === boleto.folio}
          bridgeReady={bridgeReady}
          bridgePrinter={bridgePrinter}
          bridgeColorMode={bridgeColorMode}
          bridgePrinterOnline={bridgePrinterOnline}
          bridgeProbing={bridgeProbing}
          impresiones={boleto.impresiones ?? 0}
          ultimaImpresion={boleto.ultimaImpresion ?? null}
          unmarking={unmarking}
          onClose={() => setBoleto(null)}
          onPrintQl={() => void imprimirQl()}
          onPrintChrome={imprimirChrome}
          onPdf={() => void abrirPdf()}
          onReprobe={() => void probe()}
          onUnmark={() => void desmarcar()}
        />
      ) : null}
    </main>
  )
}
