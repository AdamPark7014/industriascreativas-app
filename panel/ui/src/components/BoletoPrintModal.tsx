import { useEffect, useId, useRef } from 'react'
import BoletoFace, { type BoletoData } from './BoletoFace'
import styles from './boleto-print.module.scss'
import './boleto-face.css'

type Props = {
  data: BoletoData
  busy?: boolean
  bridgeReady?: boolean | null
  onClose: () => void
  onPrint: () => void
  onPdf: () => void
  onPrintQl?: () => void
}

/** Modal de preview + acciones Imprimir / PDF / QL local. */
export default function BoletoPrintModal({
  data,
  busy,
  bridgeReady,
  onClose,
  onPrint,
  onPdf,
  onPrintQl,
}: Props) {
  const tituloId = useId()
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onPrint()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose, onPrint])

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
              Formato {data.formato}. Si Chrome manda el job como 29×90, usa{' '}
              <b>Imprimir en QL (agente local)</b> o elige a mano papel{' '}
              <b>62mm Cinta continua</b>, márgenes ninguno, pies OFF.
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
            <h3>Pasos rápidos</h3>
            <ol>
              <li>Revisa nombre, tipo y folio.</li>
              <li>
                Con el puente local: <b>Imprimir en QL</b> (fuerza 62×100, evita 29×90).
              </li>
              <li>
                Sin puente: <b>Imprimir boleto</b> → papel <b>62mm Cinta continua</b>.
              </li>
              <li>Si hace falta, <b>Abrir PDF</b>.</li>
            </ol>
            <div className={styles.acciones}>
              {onPrintQl ? (
                <button
                  type="button"
                  className={styles.primario}
                  disabled={busy}
                  onClick={onPrintQl}
                  title={
                    bridgeReady === false
                      ? 'Arranca tools/print-bridge/start.cmd en esta PC'
                      : 'POST al agente local 127.0.0.1:9631'
                  }
                >
                  {busy
                    ? 'Enviando a QL…'
                    : bridgeReady === false
                      ? 'QL agente (offline)'
                      : 'Imprimir en QL (agente local)'}
                </button>
              ) : null}
              <button
                type="button"
                className={onPrintQl ? styles.secundario : styles.primario}
                disabled={busy}
                onClick={onPrint}
              >
                {busy ? 'Preparando…' : 'Imprimir boleto'}
              </button>
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
