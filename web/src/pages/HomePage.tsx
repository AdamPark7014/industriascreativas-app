import { Link } from 'react-router-dom'
import AppShell from '../components/AppShell'
import styles from '../styles/flow.module.scss'

export default function HomePage() {
  return (
    <AppShell backTo="/" backLabel="Inicio">
      <div className={styles.homeShell}>
        <div className={styles.homeBrand}>
          <img className={styles.homeBrandLogo} src="/logo-gabor.svg" alt="Gabor FICTI" />
          <p className={styles.kicker}>Sistema de acreditación</p>
          <h1 className={styles.title}>Registro de asistentes</h1>
          <p className={styles.subtitle}>
            Selecciona tu perfil para continuar. El proceso se valida por correo y tu gafete digital
            se canjea en taquilla por el físico.
          </p>
        </div>

        <div className={styles.homeGrid}>
          <Link className={`${styles.homeCard} ${styles.empresa}`} to="/empresarios">
            <strong>Empresa</strong>
            <span>Acreditación corporativa con gafete Rosa FICTI</span>
          </Link>
          <Link className={`${styles.homeCard} ${styles.estudiante}`} to="/estudiantes">
            <strong>Estudiante</strong>
            <span>Registro ágil con gafete Azul FICTI</span>
          </Link>
        </div>
        <p className={styles.homeNote}>Tiempo estimado: 2 a 4 minutos · Confirmación por correo</p>
      </div>
    </AppShell>
  )
}
