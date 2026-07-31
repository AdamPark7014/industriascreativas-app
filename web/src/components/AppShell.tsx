import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import styles from '../styles/flow.module.scss'

type Props = {
  children: ReactNode
  backTo?: string
  backLabel?: string
}

export default function AppShell({
  children,
  backTo = '/',
  backLabel = 'Menú principal',
}: Props) {
  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link className={styles.brand} to="/">
          <img className={styles.brandLogo} src="/logo-gabor.svg" alt="Gabor FICTI" />
          <div className={styles.brandMeta}>
            <span className={styles.brandName}>Registro oficial</span>
            <span className={styles.brandTag}>Credenciales · Gafetes FICTI</span>
          </div>
        </Link>
        <Link className={styles.topLink} to={backTo}>
          {backLabel}
        </Link>
      </header>
      {children}
    </div>
  )
}
