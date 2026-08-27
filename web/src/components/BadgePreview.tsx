import styles from '../styles/badge.module.scss'

type BadgePreviewProps = {
  variant: 'empresa' | 'estudiante'
  nombre: string
  empresa?: string
  cargo?: string
  folio?: string | number
}

export default function BadgePreview({
  variant,
  nombre,
  folio,
}: BadgePreviewProps) {
  const tipo =
    variant === 'empresa' ? 'EMPRESA - ROSA FICTI' : 'ESTUDIANTE - AZUL FICTI'
  const colorClass = variant === 'empresa' ? styles.rosa : styles.verde

  return (
    <div className={`${styles.badge} ${colorClass}`} aria-label="Vista previa del boleto digital">
      <div className={styles.brandRow}>
        <span className={styles.gaborBox}>GABOR</span>
        <span className={styles.fictiWord}>FICTI</span>
      </div>
      <p className={styles.tipo}>{tipo}</p>
      <p className={styles.name}>{nombre || '—'}</p>
      {folio != null && folio !== '' ? (
        <p className={styles.folio}>Folio: {folio}</p>
      ) : (
        <p className={styles.folio}>Folio: —</p>
      )}
      <img className={styles.mascot} src="/ficti-muneco.png" alt="" aria-hidden />
      <div className={styles.qrPlaceholder} aria-hidden>
        <svg viewBox="0 0 48 48" width="72" height="72" aria-hidden>
          <rect x="2" y="2" width="18" height="18" fill="#111" />
          <rect x="6" y="6" width="10" height="10" fill="#fff" />
          <rect x="8" y="8" width="6" height="6" fill="#111" />
          <rect x="28" y="2" width="18" height="18" fill="#111" />
          <rect x="32" y="6" width="10" height="10" fill="#fff" />
          <rect x="34" y="8" width="6" height="6" fill="#111" />
          <rect x="2" y="28" width="18" height="18" fill="#111" />
          <rect x="6" y="32" width="10" height="10" fill="#fff" />
          <rect x="8" y="34" width="6" height="6" fill="#111" />
          <rect x="28" y="28" width="6" height="6" fill="#111" />
          <rect x="36" y="28" width="10" height="6" fill="#111" />
          <rect x="28" y="36" width="6" height="10" fill="#111" />
          <rect x="38" y="38" width="8" height="8" fill="#111" />
        </svg>
      </div>
      <p className={styles.leyenda}>
        Canjea tu boleto por un gafete físico en taquilla el día del evento.
      </p>
    </div>
  )
}
