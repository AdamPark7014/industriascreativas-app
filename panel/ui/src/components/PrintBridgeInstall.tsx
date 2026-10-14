import {
  PRINT_BRIDGE_CHROME_HINT,
  PRINT_BRIDGE_INSTALLER,
  PRINT_BRIDGE_ZIP_URL,
  getPrintAgentUrl,
  type PrintDiag,
} from '../lib/printAgent'
import styles from './boleto-print.module.scss'

type Props = {
  /** Vuelve a sondear /health del agente local. */
  onReprobe?: () => void
  probing?: boolean
  /** Sin título ni marco (dentro del modal ya hay cabecera). */
  compact?: boolean
  /** Resultado del último sondeo: qué falta y qué hacer. */
  diagnostico?: PrintDiag | null
}

/**
 * Panel "Instalar impresora en esta PC": descarga del agente local (ZIP),
 * los 3 pasos, el botón para volver a comprobar y, tras comprobar, qué fue
 * lo que falló (agente sin arrancar / Chrome / driver). Se usa en el modal
 * del boleto y en la página Buscar.
 */
export default function PrintBridgeInstall({ onReprobe, probing, compact, diagnostico }: Props) {
  const healthUrl = `${getPrintAgentUrl()}/health`
  const sinImpresora = diagnostico?.tipo === 'sin_impresora'
  return (
    <div className={compact ? styles.instalar : `${styles.instalar} ${styles.instalarPanel}`} role="region" aria-label="Instalar impresora en esta PC">
      {!compact ? (
        <strong className={styles.instalarTitulo}>
          {sinImpresora ? 'Agente instalado, falta la impresora en Windows' : 'Impresora no instalada en esta PC'}
        </strong>
      ) : null}

      {diagnostico ? (
        <div className={styles.diag} role="status" aria-live="polite">
          <p className={styles.diagTexto}>{diagnostico.texto}</p>
          {sinImpresora ? (
            <ol className={styles.instalarPasos}>
              <li>
                Instala el driver de la Brother QL-800 (
                <a href="https://support.brother.com/g/b/downloadtop.aspx?c=us&lang=en&prod=lpql800eus" target="_blank" rel="noreferrer">
                  página oficial
                </a>
                ) y conéctala por USB encendida: debe aparecer en Configuración → Impresoras.
              </li>
              <li>
                Vuelve a dar doble clic en <code>{PRINT_BRIDGE_INSTALLER}</code> (deja el papel en 62 mm e imprime una etiqueta de prueba) y pulsa «Ya la instalé, comprobar».
              </li>
            </ol>
          ) : (
            <ol className={styles.instalarPasos}>
              <li>
                Abre{' '}
                <a href={healthUrl} target="_blank" rel="noreferrer">
                  {healthUrl}
                </a>{' '}
                en esta misma PC. Si ves un texto con <code>"ok":true</code>, el agente está bien y lo
                que bloquea es Chrome: candado de la barra de direcciones → Permisos del sitio → <b>Red local: Permitir</b>, y recarga.
              </li>
              <li>
                Si la página no abre, el agente no está arrancado: clic derecho al ZIP → <b>Extraer todo</b>,
                y doble clic en <code>{PRINT_BRIDGE_INSTALLER}</code> dentro de la carpeta extraída. Lee el
                mensaje antes de pulsar una tecla: debe terminar en «Listo. En Accesos usa Imprimir en QL».
              </li>
              <li>Si el instalador dice que no hay QL-800, instala primero el driver Brother y repítelo.</li>
            </ol>
          )}
        </div>
      ) : null}

      <p className={styles.instalarIntro}>
        Una sola vez por PC: el agente queda en segundo plano y arranca con Windows.
      </p>
      <a className={styles.primarioGrande} href={PRINT_BRIDGE_ZIP_URL} download>
        Instalar impresora en esta PC
      </a>
      <ol className={styles.instalarPasos}>
        <li>Conecta la Brother QL-800 por USB, enciéndela e instala su driver.</li>
        <li>Descomprime el ZIP que acabas de descargar (clic derecho → Extraer todo).</li>
        <li>
          Doble clic en <code>{PRINT_BRIDGE_INSTALLER}</code> dentro de la carpeta extraída. Debe decir «Listo».
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
