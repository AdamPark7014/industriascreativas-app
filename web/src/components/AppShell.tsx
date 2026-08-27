import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import styles from '../styles/flow.module.scss'

type Props = {
  children: ReactNode
  backTo?: string
  backLabel?: string
  /** Home layout: white chrome, active INICIO link, decorative footer blocks */
  home?: boolean
}

export default function AppShell({
  children,
  backTo = '/',
  backLabel = 'Menú principal',
  home = false,
}: Props) {
  return (
    <div className={`${styles.page} ${home ? styles.pageHome : ''}`}>
      <header className={`${styles.topbar} ${home ? styles.topbarHome : ''}`}>
        <Link className={styles.brand} to="/">
          <div className={styles.partnerLogos} aria-label="Marcas del evento">
            <img
              className={`${styles.partnerLogo} ${styles.partnerLogoFicti}`}
              src="/ficti-logo.png"
              alt="FICTI"
            />
            <img
              className={`${styles.partnerLogo} ${styles.partnerLogoTech}`}
              src="/tech-capital-logo.png"
              alt="Tech Capital"
            />
          </div>
        </Link>
        <Link
          className={`${styles.topLink} ${home ? styles.topLinkActive : ''}`}
          to={backTo}
        >
          {backLabel}
        </Link>
      </header>
      {children}
      <footer className={`${styles.siteFooter} ${home ? styles.siteFooterHome : ''}`}>
        <img
          className={styles.footerLogo}
          src="/gabor-logo-footer.png"
          alt="Gabor Grupo Papelero"
        />
        {home ? (
          <>
            <img
              className={styles.footerBlocks}
              src="/cuadritos-colores.png"
              alt=""
              aria-hidden
            />
            <div className={styles.footerBar} aria-hidden />
          </>
        ) : null}
      </footer>
    </div>
  )
}
