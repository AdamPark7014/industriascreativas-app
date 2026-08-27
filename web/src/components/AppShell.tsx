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

/** Trazo de circuito de las esquinas inferiores del diseño de referencia. */
function Circuit({ className }: { className: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 300 150"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden
    >
      <path d="M0 96h48l18-18h52l16 16h44" />
      <path d="M0 124h74l20-20h60" />
      <path d="M0 68h26l22 22" />
      <path d="M84 150v-32l18-18h56" />
      <path d="M140 150v-18l14-14h48" />
      <circle cx="178" cy="94" r="3.4" fill="currentColor" stroke="none" />
      <circle cx="154" cy="104" r="3.4" fill="currentColor" stroke="none" />
      <circle cx="202" cy="118" r="3.4" fill="currentColor" stroke="none" />
      <rect x="44" y="74" width="7" height="7" fill="currentColor" stroke="none" />
      <rect x="90" y="100" width="7" height="7" fill="currentColor" stroke="none" />
    </svg>
  )
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
        <img
          className={styles.footerLogo}
          src="/gabor-logo-footer-white.png"
          alt="Gabor Grupo Papelero"
        />
      </footer>
      {home ? (
        <>
          <Circuit className={`${styles.circuit} ${styles.circuitLeft}`} />
          <Circuit className={`${styles.circuit} ${styles.circuitRight}`} />
        </>
      ) : null}
    </div>
  )
}
