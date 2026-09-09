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

  const leyenda = () => {
    if (camera.status === 'requesting') return 'Solicitando cámara…'
    if (camera.status === 'denied') return camera.error || 'Cámara bloqueada'
    if (camera.status === 'unsupported') return camera.error || 'Cámara no disponible — usa USB'
    if (camera.status === 'error') return camera.error || 'Error de cámara'
    return 'Centra el QR en el marco'
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
          {camera.status === 'running' ? (
            <div className={styles.controles}>
              {camera.torchAvailable ? (
                <button
                  type="button"
                  className={camera.torchOn ? styles.controlOn : styles.control}
                  onClick={camera.toggleTorch}
                  aria-pressed={camera.torchOn}
                >
                  {camera.torchOn ? 'Luz encendida' : 'Luz'}
                </button>
              ) : null}
              {camera.canSwitchCamera ? (
                <button type="button" className={styles.control} onClick={camera.switchCamera}>
                  Cambiar cámara
                </button>
              ) : null}
            </div>
          ) : null}
          <p className={styles.status}>{leyenda()}</p>
        </div>
      ) : null}
    </div>
  )
}
