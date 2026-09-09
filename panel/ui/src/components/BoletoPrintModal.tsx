import { useEffect, useId, useRef, useState } from 'react'
import BoletoFace, { type BoletoData } from './BoletoFace'
import PrintBridgeInstall from './PrintBridgeInstall'
import { horaCorta } from '../api'
import { PRINT_BRIDGE_CHROME_HINT, describeColorMode, type PrintColorMode } from '../lib/printAgent'
import styles from './boleto-print.module.scss'
import './boleto-face.css'

type Props = {
  data: BoletoData
  busy?: boolean
  bridgeReady?: boolean | null
  bridgePrinter?: string | null
  /** Rollo detectado por el agente (último modo que imprimió bien). */
  bridgeColorMode?: PrintColorMode | null
  bridgeProbing?: boolean
  /** Impresiones registradas de este boleto (0 si nunca). */
  impresiones?: number
  ultimaImpresion?: string | null
  unmarking?: boolean
  onClose: () => void
  /** Primario: PNG → agente local (Brother QL-800). */
  onPrintQl: () => void
  /** "Más opciones": diálogo Chrome (puede remapear a 29×90). */
  onPrintChrome: () => void
  /** "Más opciones": PDF 62×100. */
  onPdf: () => void
  /** Vuelve a sondear /health del agente local. */
  onReprobe?: () => void
  /** "Marcar como no impreso": borra el registro de impresiones. */
  onUnmark?: () => void
}

/** Modal de preview con un solo botón: Imprimir boleto. */
export default function BoletoPrintModal({
  data,
  busy,
  bridgeReady,
  bridgePrinter,
  bridgeColorMode,
  bridgeProbing,
  impresiones = 0,
  ultimaImpresion,
  unmarking,
  onClose,
  onPrintQl,
  onPrintChrome,
  onPdf,
  onReprobe,
  onUnmark,
}: Props) {
  const tituloId = useId()
  const printRef = useRef<HTMLDivElement>(null)
  const [masAbierto, setMasAbierto] = useState(false)
  const qlOnline = bridgeReady === true
  const qlOffline = bridgeReady === false
  const rollo = describeColorMode(bridgeColorMode)
  const hora = horaCorta(ultimaImpresion)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && qlOnline && !busy) {
        e.preventDefault()
        onPrintQl()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose, onPrintQl, qlOnline, busy])

  return (
    <div className={styles.capa} role="presentation" onClick={onClose}>
      <div
        className={styles.dialogo}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.cab}>
          <div>
            <p className={styles.kicker}>Vista previa del boleto</p>
            <h2 id={tituloId}>¿Se ve bien para imprimir?</h2>
            <p className={styles.ayuda}>
              Sale tal cual se ve: rollo 62 mm negro/rojo en la Brother QL-800.
            </p>
          </div>
          <button type="button" className={styles.cerrar} onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </header>

        <div className={styles.cuerpo}>
          <div className={styles.preview} data-boleto-print-root ref={printRef}>
            <BoletoFace data={data} />
          </div>

          <aside className={styles.pasos}>
            <h3>Impresora en esta PC</h3>

            {bridgeProbing && bridgeReady == null ? (
              <p className={styles.estadoProbe}>Comprobando impresora…</p>
            ) : null}

            {qlOnline ? (
              <p className={styles.estadoOk} role="status">
                Impresora lista · {bridgePrinter || 'Brother QL-800'}
                {rollo ? ` · ${rollo}` : ''}
              </p>
            ) : null}

            {impresiones > 0 ? (
              <div className={styles.impreso} role="status">
                <span>
                  Ya impreso {impresiones === 1 ? '1 vez' : `${impresiones} veces`}
                  {hora ? ` · última ${hora}` : ''}
                </span>
                {onUnmark ? (
                  <button
                    type="button"
                    className={styles.enlaceSutil}
                    disabled={unmarking || busy}
                    onClick={onUnmark}
                  >
                    {unmarking ? 'Quitando…' : 'Marcar como no impreso'}
                  </button>
                ) : null}
              </div>
            ) : null}

            <div className={styles.acciones}>
              {qlOffline ? (
                <PrintBridgeInstall compact onReprobe={onReprobe} probing={bridgeProbing} />
              ) : (
                <>
                  <button
                    type="button"
                    className={styles.primarioGrande}
                    disabled={busy || (bridgeProbing && bridgeReady == null)}
                    onClick={onPrintQl}
                    title="Ctrl+Enter · PNG 59×94 → agente local 127.0.0.1:9631"
                  >
                    {busy ? 'Imprimiendo…' : 'Imprimir boleto'}
                  </button>
                  <p className={styles.ayudaLinea}>
                    Ctrl+Enter también imprime. {PRINT_BRIDGE_CHROME_HINT}
                  </p>
                </>
              )}

              <details
                className={styles.mas}
                open={masAbierto}
                onToggle={(e) => setMasAbierto((e.currentTarget as HTMLDetailsElement).open)}
              >
                <summary>Más opciones</summary>
                <div className={styles.masCuerpo}>
                  <div className={styles.avisoChrome}>
                    <p>
                      <b>Chrome no fija el papel Brother.</b> Si usas este botón, elige a mano{' '}
                      <b>62mm Cinta continua</b>, márgenes ninguno, encabezados/pies OFF. Puede
                      salir 29×90.
                    </p>
                    <button
                      type="button"
                      className={styles.secundarioPeligro}
                      disabled={busy}
                      onClick={onPrintChrome}
                    >
                      {busy ? 'Preparando…' : 'Imprimir con Chrome (no recomendado)'}
                    </button>
                  </div>
                  <button type="button" className={styles.secundario} disabled={busy} onClick={onPdf}>
                    Abrir PDF
                  </button>
                </div>
              </details>

              <button type="button" className={styles.fantasma} onClick={onClose}>
                Seguir buscando
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
