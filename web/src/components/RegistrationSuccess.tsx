import type { ReactNode } from 'react'
import { LEYENDA_CANJE } from '../constants/registro'
import styles from '../styles/flow.module.scss'

type Props = {
  title?: string
  children?: ReactNode
}

export function RegistrationSuccess({ title = 'Registro recibido', children }: Props) {
  return (
    <div className={styles.successCard}>
      <img className={styles.logo} src="/gabor-logo.png" alt="Gutierrez Grupo Papelero" />
      <h2>{title}</h2>
      <p>
        Te enviamos un correo de confirmación. Ábrelo para validar tu registro; después recibirás
        tu gafete digital con código QR.
      </p>
      <p className={styles.leyenda}>{LEYENDA_CANJE}</p>
      {children}
    </div>
  )
}
