import { Link } from 'react-router-dom'
import AppShell from '../components/AppShell'
import styles from '../styles/flow.module.scss'

export default function HomePage() {
  return (
    <AppShell backTo="/" backLabel="Inicio" home>
      <div className={styles.homeShell}>
        <div className={styles.homeHero}>
          <div className={styles.homeBrand}>
            <p className={styles.kicker}>Sistema de acreditación</p>
            <h1 className={styles.homeTitle}>Registro de Asistentes</h1>
            <p className={styles.subtitle}>
              Selecciona tu perfil para continuar. El proceso se valida por correo y tu gafete
              digital se canjea en taquilla por el físico.
            </p>
          </div>
          <img
            className={styles.homeMascot}
            src="/ficti-muneco.png"
            alt=""
            aria-hidden
          />
        </div>

        <div className={styles.homeGrid}>
          <Link className={`${styles.homeCard} ${styles.empresa}`} to="/empresarios">
            <span className={styles.homeCardIcon} aria-hidden>
              <svg viewBox="0 0 48 48" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M8 40V18h10V8h12v10h10v22" />
                <path d="M8 40h32" />
                <path d="M14 24h4M22 24h4M30 24h4M14 30h4M22 30h4M30 30h4" />
                <path d="M22 40v-6h4v6" />
              </svg>
            </span>
            <strong>Empresa</strong>
            <span>Acreditación corporativa</span>
          </Link>
          <Link className={`${styles.homeCard} ${styles.estudiante}`} to="/estudiantes">
            <span className={styles.homeCardIcon} aria-hidden>
              <svg viewBox="0 0 48 48" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M8 20l16-8 16 8-16 8-16-8z" />
                <path d="M14 24v8c0 2.5 7 6 10 6s10-3.5 10-6v-8" />
                <path d="M40 20v12" />
              </svg>
            </span>
            <strong>Estudiante</strong>
            <span>Registro ágil estudiantil</span>
          </Link>
        </div>

        <div className={styles.homeMeta}>
          <span className={styles.homeMetaItem}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            Tiempo estimado: 2 a 4 minutos
          </span>
          <span className={styles.homeMetaDivider} aria-hidden />
          <span className={styles.homeMetaItem}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M3 7l9 7 9-7" />
            </svg>
            Confirmación por correo
          </span>
        </div>
      </div>
    </AppShell>
  )
}
