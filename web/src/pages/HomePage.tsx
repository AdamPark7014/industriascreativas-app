import { Link } from 'react-router-dom'
import AppShell from '../components/AppShell'
import styles from '../styles/flow.module.scss'

export default function HomePage() {
  return (
    <AppShell backTo="/" backLabel="Inicio" home>
      <div className={styles.homeShell}>
        <div className={styles.homeLayout}>
          <div className={styles.homeHero}>
            <div className={styles.homeBrand}>
              <p className={styles.kicker}>
                <span className={styles.kickerDim}>Sistema de </span>
                <span className={styles.kickerBright}>Acreditación</span>
              </p>
              <h1 className={styles.homeTitle}>
                Registro de
                <span className={styles.homeTitleAccent}>Asistentes</span>
              </h1>
              <p className={styles.subtitle}>
                Selecciona tu perfil para continuar. El proceso se valida por correo y tu gafete
                digital se canjea en taquilla por el físico.
              </p>
            </div>

            <div className={styles.homeArt}>
              <img className={styles.homeArtLogo} src="/tech-capital-mark.png" alt="" aria-hidden />
              <img className={styles.homeMascot} src="/ficti-muneco.png" alt="" aria-hidden />
            </div>
          </div>

          <div className={styles.homeSide}>
            <div className={styles.homeGrid}>
              <Link className={`${styles.homeCard} ${styles.empresa}`} to="/empresarios">
                <span className={styles.homeCardIcon} aria-hidden>
                  <svg viewBox="0 0 48 48" width="30" height="30" fill="currentColor">
                    <path d="M6 44V10a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v34H6zm4-28h4v-4h-4v4zm8 0h4v-4h-4v4zm-8 8h4v-4h-4v4zm8 0h4v-4h-4v4zm-8 8h4v-4h-4v4zm8 0h4v-4h-4v4zm-4 12h4v-8h-4v8z" />
                    <path d="M30 44V20h10a2 2 0 0 1 2 2v22H30zm4-14h4v-4h-4v4zm0 8h4v-4h-4v4z" />
                  </svg>
                </span>
                <span className={styles.homeCardText}>
                  <strong>Empresa</strong>
                  <span>Acreditación corporativa</span>
                </span>
                <span className={styles.homeCardArrow} aria-hidden>
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12h15" />
                    <path d="M13 6l6 6-6 6" />
                  </svg>
                </span>
              </Link>

              <Link className={`${styles.homeCard} ${styles.estudiante}`} to="/estudiantes">
                <span className={styles.homeCardIcon} aria-hidden>
                  <svg viewBox="0 0 48 48" width="30" height="30" fill="currentColor">
                    <path d="M24 6L2 17l22 11 18-9v13h4V17L24 6z" />
                    <path d="M11 24.5V33c0 3.9 6.6 7 13 7s13-3.1 13-7v-8.5l-13 6.5-13-6.5z" />
                  </svg>
                </span>
                <span className={styles.homeCardText}>
                  <strong>Estudiante</strong>
                  <span>Registro ágil estudiantil</span>
                </span>
                <span className={styles.homeCardArrow} aria-hidden>
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12h15" />
                    <path d="M13 6l6 6-6 6" />
                  </svg>
                </span>
              </Link>
            </div>

            <div className={styles.homeMeta}>
              <span className={styles.homeMetaItem}>
                <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" strokeLinecap="round" />
                </svg>
                Tiempo estimado: 2 a 4 minutos
              </span>
              <span className={styles.homeMetaDivider} aria-hidden />
              <span className={styles.homeMetaItem}>
                <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="M3 7l9 7 9-7" strokeLinecap="round" />
                </svg>
                Confirmación por correo
              </span>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
