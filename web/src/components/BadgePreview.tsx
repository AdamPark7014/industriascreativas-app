import { LEYENDA_CANJE } from '../constants/registro'
import styles from '../styles/badge.module.scss'

type BadgePreviewProps = {
  variant: 'empresa' | 'estudiante'
  nombre: string
  empresa?: string
  cargo?: string
}

export default function BadgePreview({ variant, nombre, empresa, cargo }: BadgePreviewProps) {
  const colorClass = variant === 'empresa' ? styles.rosa : styles.azul

  return (
    <div className={`${styles.badge} ${colorClass}`} aria-label="Vista previa del gafete">
      <img className={styles.logo} src="/logo-gabor.svg" alt="Logo Gabor" />
      <div className={styles.qrPlaceholder}>QR</div>
      <p className={styles.name}>{nombre || 'NOMBRE'}</p>
      {variant === 'empresa' ? (
        <>
          <p className={styles.meta}>{empresa || 'EMPRESA'}</p>
          <p className={styles.meta}>{cargo || 'CARGO'}</p>
        </>
      ) : null}
      <p className={styles.hint}>{LEYENDA_CANJE}</p>
    </div>
  )
}
