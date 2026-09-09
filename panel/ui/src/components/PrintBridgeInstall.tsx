import {
  PRINT_BRIDGE_CHROME_HINT,
  PRINT_BRIDGE_INSTALLER,
  PRINT_BRIDGE_ZIP_URL,
} from '../lib/printAgent'
import styles from './boleto-print.module.scss'

type Props = {
  /** Vuelve a sondear /health del agente local. */
  onReprobe?: () => void
  probing?: boolean
  /** Sin título ni marco (dentro del modal ya hay cabecera). */
  compact?: boolean
}

/**
 * Panel "Instalar impresora en esta PC": descarga del agente local (ZIP),
 * los 3 pasos y el botón para volver a comprobar. Se usa en el modal del
 * boleto y en la página Buscar.
 */
export default function PrintBridgeInstall({ onReprobe, probing, compact }: Props) {
  return (
    <div className={compact ? styles.instalar : `${styles.instalar} ${styles.instalarPanel}`} role="region" aria-label="Instalar impresora en esta PC">
      {!compact ? <strong className={styles.instalarTitulo}>Impresora no instalada en esta PC</strong> : null}
      <p className={styles.instalarIntro}>
        Una sola vez por PC: el agente queda en segundo plano y arranca con Windows.
      </p>
      <a className={styles.primarioGrande} href={PRINT_BRIDGE_ZIP_URL} download>
        Instalar impresora en esta PC
      </a>
      <ol className={styles.instalarPasos}>
        <li>Conecta la Brother QL-800 por USB, enciéndela e instala su driver.</li>
        <li>Descomprime el ZIP que acabas de descargar.</li>
        <li>
          Doble clic en <code>{PRINT_BRIDGE_INSTALLER}</code>. Listo.
        </li>
      </ol>
      {onReprobe ? (
        <button type="button" className={styles.secundario} disabled={probing} onClick={onReprobe}>
          {probing ? 'Comprobando…' : 'Ya la instalé, comprobar'}
        </button>
      ) : null}
      <p className={styles.ayudaLinea}>{PRINT_BRIDGE_CHROME_HINT}</p>
    </div>
  )
}
