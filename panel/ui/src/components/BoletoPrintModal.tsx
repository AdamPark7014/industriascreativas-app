import { useEffect, useId, useRef } from 'react'
import BoletoFace, { type BoletoData } from './BoletoFace'
import styles from './boleto-print.module.scss'
import './boleto-face.css'

type Props = {
  data: BoletoData
  busy?: boolean
  onClose: () => void
  onPrint: () => void
  onPdf: () => void
}

/** Modal de preview + acciones Imprimir / PDF. */
export default function BoletoPrintModal({ data, busy, onClose, onPrint, onPdf }: Props) {
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
              Formato {data.formato}. En el diálogo de impresión elige papel 5×8 in (o
              «Tamaño real» / sin márgenes).
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
                Pulsa <b>Imprimir boleto</b> (recomendado).
              </li>
              <li>Si tu impresora pide PDF, usa <b>Abrir PDF</b>.</li>
            </ol>
            <div className={styles.acciones}>
              <button type="button" className={styles.primario} disabled={busy} onClick={onPrint}>
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
