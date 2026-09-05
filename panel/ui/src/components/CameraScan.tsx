import { useCameraCapture } from '../lib/useCameraCapture'
import styles from './camera-scan.module.scss'

type Props = {
  onScan: (code: string) => void
  disabled?: boolean
  active: boolean
  onToggle: (on: boolean) => void
}

export default function CameraScan({ onScan, disabled, active, onToggle }: Props) {
  const camera = useCameraCapture({
    onDecode: (value) => {
      if (!disabled) onScan(value)
    },
    paused: disabled || !active,
  })

  const start = camera.start
  const stop = camera.stop

  const toggle = () => {
    if (active) {
      stop()
      onToggle(false)
    } else {
      onToggle(true)
      start()
    }
  }

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.toggle}
        onClick={toggle}
        disabled={disabled}
      >
        {active ? 'Cerrar cámara' : 'Abrir cámara'}
      </button>
      {active ? (
        <div className={styles.visor}>
          <video ref={camera.videoRef} className={styles.video} muted playsInline />
          <div className={styles.marco} aria-hidden />
          <p className={styles.status}>
            {camera.status === 'requesting'
              ? 'Solicitando cámara…'
              : camera.status === 'denied'
                ? camera.error || 'Cámara bloqueada'
                : camera.status === 'unsupported'
                  ? 'Cámara no disponible — usa USB'
                  : camera.decoderSupported
                    ? 'Centra el QR en el marco'
                    : 'Cámara activa (sin decodificador automático: usa USB)'}
          </p>
        </div>
      ) : null}
    </div>
  )
}
