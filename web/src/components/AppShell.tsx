import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import styles from '../styles/flow.module.scss'

type Props = {
  children: ReactNode
  backTo?: string
  backLabel?: string
  /** Home layout: active INICIO link, hero a dos columnas, adornos de circuito */
  home?: boolean
  /** Tinta el flujo: rosa para empresas, verde para estudiantes */
  variant?: 'empresa' | 'estudiante'
}

export default function AppShell({
  children,
  backTo = '/',
  backLabel = 'Menú principal',
  home = false,
  variant,
}: Props) {
  const variantClass =
    variant === 'empresa'
      ? styles.pageEmpresa
      : variant === 'estudiante'
        ? styles.pageEstudiante
        : ''

  return (
    <div className={`${styles.page} ${home ? styles.pageHome : ''} ${variantClass}`}>
      <header className={`${styles.topbar} ${home ? styles.topbarHome : ''}`}>
        <Link className={styles.brand} to="/">
          <div className={styles.partnerLogos} aria-label="Marcas del evento">
            <img
              className={`${styles.partnerLogo} ${styles.partnerLogoFicti}`}
              src="/ficti-logo.png"
              alt="FICTI"
            />
            <span className={styles.partnerDivider} aria-hidden />
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
        <div className={styles.brandBand}>
          {/* Arte del cliente (CIRCUITO 2 / CIRCUITO 1). Son piezas distintas,
              una por lado, no la misma reflejada. Los PNG originales venian
              sobre negro sin alfa; estos llevan la transparencia sacada de la
              luminancia, que conserva el degradado del neon. */}
          <img
            className={`${styles.bandCircuit} ${styles.bandCircuitLeft}`}
            src="/circuito-izq.png"
            alt=""
            aria-hidden
          />
          <img
            className={styles.footerLogo}
            src="/gabor-logo-footer.png"
            alt="Gabor Grupo Papelero"
          />
          <img
            className={`${styles.bandCircuit} ${styles.bandCircuitRight}`}
            src="/circuito-der.png"
            alt=""
            aria-hidden
          />
        </div>
      </footer>
    </div>
  )
}
