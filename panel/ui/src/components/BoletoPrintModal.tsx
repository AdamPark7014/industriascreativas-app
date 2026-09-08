import { useEffect, useId, useRef } from 'react'
import BoletoFace, { type BoletoData } from './BoletoFace'
import { PRINT_BRIDGE_HELP, PRINT_BRIDGE_ZIP_URL } from '../lib/printAgent'
import styles from './boleto-print.module.scss'
import './boleto-face.css'

type Props = {
  data: BoletoData
  busy?: boolean
  bridgeReady?: boolean | null
  bridgePrinter?: string | null
  bridgeProbing?: boolean
  onClose: () => void
  /** Secundario: diálogo Chrome (puede remapear a 29×90). */
  onPrintChrome: () => void
  onPdf: () => void
  onPrintQl?: () => void
}

/** Modal de preview + acciones QL (primario) / Chrome con aviso / PDF. */
export default function BoletoPrintModal({
  data,
  busy,
  bridgeReady,
  bridgePrinter,
  bridgeProbing,
  onClose,
  onPrintChrome,
  onPdf,
  onPrintQl,
}: Props) {
  const tituloId = useId()
  const printRef = useRef<HTMLDivElement>(null)
  const qlOnline = bridgeReady === true
  const qlOffline = bridgeReady === false

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && onPrintQl && qlOnline) onPrintQl()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose, onPrintQl, qlOnline])

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
              Formato {data.formato}. Impresión correcta:{' '}
              <b>Imprimir en QL (agente local)</b> → fuerza 62×100. Chrome print es
              solo respaldo y puede salir 29×90.
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

            {bridgeProbing ? (
              <p className={styles.estadoProbe}>Comprobando agente local (127.0.0.1:9631)…</p>
            ) : null}

            {qlOnline ? (
              <p className={styles.estadoOk} role="status">
                QL lista · {bridgePrinter || 'Brother QL-800'}
              </p>
            ) : null}

            {qlOffline ? (
              <div className={styles.offline} role="alert">
                <strong>Agente QL offline en esta PC</strong>
                <p>{PRINT_BRIDGE_HELP}</p>
                <ol>
                  <li>Conecta Brother QL-800 (USB) y enciéndela.</li>
                  <li>Instala el driver Brother (aparece en Impresoras).</li>
                  <li>
                    Descarga el agente, descomprime y ejecuta <code>start.cmd</code>.
                  </li>
                </ol>
                <a className={styles.descarga} href={PRINT_BRIDGE_ZIP_URL} download>
                  Descargar print-bridge (ZIP)
                </a>
                <p className={styles.offlineHint}>
                  Node.js 20+ en PATH. Luego vuelve a abrir este modal.
                </p>
              </div>
            ) : null}

            <ol className={styles.pasosLista}>
              <li>Revisa nombre, tipo y folio.</li>
              <li>
                Primario: <b>Imprimir en QL</b> (agente local, media 62 mm continua).
              </li>
              <li>PDF si necesitas archivo.</li>
            </ol>

            <div className={styles.acciones}>
              {onPrintQl ? (
                <button
                  type="button"
                  className={styles.qlPrimary}
                  disabled={busy}
                  onClick={onPrintQl}
                  title={
                    qlOffline
                      ? 'Agente offline — clic muestra el error (sin Chrome)'
                      : 'POST PNG → http://127.0.0.1:9631/print-label'
                  }
                >
                  {busy
                    ? 'Enviando a QL…'
                    : qlOffline
                      ? 'Imprimir en QL (agente offline — reintentar)'
                      : 'Imprimir en QL (agente local)'}
                </button>
              ) : null}

              <div className={styles.avisoChrome}>
                <p>
                  <b>Atención:</b> Chrome no fija el form Brother. Si usas este
                  botón, elige a mano papel <b>62mm Cinta continua</b>, márgenes
                  ninguno, encabezados/pies OFF. Puede salir 29×90.
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
