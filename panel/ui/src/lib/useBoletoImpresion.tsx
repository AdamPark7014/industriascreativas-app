import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  abrirPdfGafete,
  borrarImpresiones,
  cargarBoleto,
  jobIdParaApi,
  registrarImpresion,
  tiene,
  type BoletoPayload,
  type ImpresionVia,
  type RegistrarImpresionBody,
  type RegistrarImpresionResp,
  type Sesion,
} from '../api'
import BoletoPrintModal from '../components/BoletoPrintModal'
import PrintBridgeInstall from '../components/PrintBridgeInstall'
import styles from '../components/impresora.module.scss'
import { printBoletoIsolated, renderBoletoPngBase64 } from './boletoRender'
import { getDeviceId } from './deviceId'
import {
  PRINT_BRIDGE_INSTALLER,
  describeColorMode,
  printPngViaAgent,
  probePrintAgent,
  type PrintColorMode,
} from './printAgent'

/** Sondeo del agente local (/health): al montar y cada 20 s. */
const PROBE_INTERVAL_MS = 20_000

export type Toast = { texto: string; tono: 'ok' | 'aviso' }

type BoletoAbierto = BoletoPayload & { tipoKey: string; id: number }

export type PrevioImpresion = { impresiones?: number; ultimaImpresion?: string | null }

/** Etiqueta corta de esta PC para el registro de impresión (≤ 60 chars, sin símbolos raros). */
export function etiquetaDispositivo(): string {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  const plataforma = (nav.userAgentData?.platform || navigator.platform || 'pc').trim()
  return `${plataforma} ${getDeviceId()}`.replace(/[^\w.\-:@ ]+/g, '').slice(0, 60)
}

const claveDe = (tipo: string, id: number) => `${tipo}:${id}`

type Opciones = {
  sesion: Sesion | null
  /** Contador nuevo de impresiones, para refrescar la lista o la ficha que lo muestra. */
  onContador?: (tipo: string, id: number, total: number, ultima: string | null) => void
  /** Texto del botón que cierra el preview. */
  textoCerrar?: string
}

/**
 * Flujo completo del boleto de puerta: estado del agente local, preview,
 * QL-800 / Chrome / PDF, registro en BD y "marcar como no impreso".
 * Lo comparten Buscar, Registro en sitio y la ficha de la persona.
 */
export function useBoletoImpresion({ sesion, onContador, textoCerrar }: Opciones) {
  const puedeImprimir = Boolean(sesion?.puedeImprimir)
  const puedeDesmarcar = tiene(sesion, 'desmarcar')
  const [boleto, setBoleto] = useState<BoletoAbierto | null>(null)
  const [printing, setPrinting] = useState<string | null>(null)
  const [unmarking, setUnmarking] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [bridgeReady, setBridgeReady] = useState<boolean | null>(null)
  const [bridgePrinter, setBridgePrinter] = useState<string | null>(null)
  const [bridgeColorMode, setBridgeColorMode] = useState<PrintColorMode | null>(null)
  /** false = la QL-800 está apagada o sin USB según Windows (el agente sí responde). */
  const [bridgePrinterOnline, setBridgePrinterOnline] = useState<boolean | null>(null)
  const [bridgeProbing, setBridgeProbing] = useState(false)
  const [mostrarInstalar, setMostrarInstalar] = useState(false)
  const instalarRef = useRef<HTMLElement>(null)
  const probeSeq = useRef(0)
  const printingRef = useRef(false)
  const onContadorRef = useRef(onContador)

  useEffect(() => {
    onContadorRef.current = onContador
  }, [onContador])

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
    if (!puedeImprimir) return
    void probe()
    const t = window.setInterval(() => {
      if (!printingRef.current) void probe()
    }, PROBE_INTERVAL_MS)
    return () => {
      window.clearInterval(t)
      probeSeq.current++
    }
  }, [probe, puedeImprimir])

  // Al abrir el preview se vuelve a comprobar (el operador pudo instalar mientras tanto).
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

  /** Aplica el contador que devuelve el API al preview abierto y avisa a quien lista. */
  const aplicarContador = useCallback((tipoKey: string, id: number, total: number, ultima: string | null) => {
    onContadorRef.current?.(tipoKey, id, total, ultima)
    setBoleto((prev) =>
      prev && prev.tipoKey === tipoKey && prev.id === id
        ? { ...prev, impresiones: total, ultimaImpresion: ultima }
        : prev,
    )
  }, [])

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

  /** Abre el preview del boleto; `previo` evita que el contador parpadee en 0. */
  const abrir = useCallback(
    async (tipo: string, id: number, previo: PrevioImpresion = {}) => {
      if (!puedeImprimir) {
        setError('Tu rol puede consultar acreditaciones, pero no imprimir boletos.')
        return
      }
      setPrinting(claveDe(tipo, id))
      setError(null)
      setToast(null)
      try {
        const data = await cargarBoleto(tipo, id)
        setBoleto({
          ...data,
          tipoKey: tipo,
          id,
          impresiones: data.impresiones ?? previo.impresiones ?? 0,
          ultimaImpresion: data.ultimaImpresion ?? previo.ultimaImpresion ?? null,
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo preparar el boleto')
      } finally {
        setPrinting(null)
      }
    },
    [puedeImprimir],
  )

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
    setPrinting(claveDe(b.tipoKey, b.id))
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
    setPrinting(claveDe(b.tipoKey, b.id))
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

  const rollo = describeColorMode(bridgeColorMode)

  const estado: ReactNode = puedeImprimir ? (
    <>
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
      {mostrarInstalar && bridgeReady === false ? (
        <section className={styles.instalarBloque} ref={instalarRef}>
          <PrintBridgeInstall onReprobe={() => void probe()} probing={bridgeProbing} />
        </section>
      ) : null}
    </>
  ) : null

  const modal: ReactNode = boleto ? (
    <BoletoPrintModal
      data={boleto}
      busy={printing === claveDe(boleto.tipoKey, boleto.id)}
      bridgeReady={bridgeReady}
      bridgePrinter={bridgePrinter}
      bridgeColorMode={bridgeColorMode}
      bridgePrinterOnline={bridgePrinterOnline}
      bridgeProbing={bridgeProbing}
      impresiones={boleto.impresiones ?? 0}
      ultimaImpresion={boleto.ultimaImpresion ?? null}
      unmarking={unmarking}
      textoCerrar={textoCerrar}
      onClose={() => setBoleto(null)}
      onPrintQl={() => void imprimirQl()}
      onPrintChrome={imprimirChrome}
      onPdf={() => void abrirPdf()}
      onReprobe={() => void probe()}
      onUnmark={puedeDesmarcar ? () => void desmarcar() : undefined}
    />
  ) : null

  return {
    abrir,
    ocupado: (tipo: string, id: number) => printing === claveDe(tipo, id),
    toast,
    setToast,
    error,
    setError,
    estado,
    modal,
  }
}
