import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

type DetectedCode = { rawValue: string }
type BarcodeDetectorLike = {
  detect(source: CanvasImageSource): Promise<DetectedCode[]>
}
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike

export type CameraStatus =
  | 'idle'
  | 'requesting'
  | 'running'
  | 'denied'
  | 'unsupported'
  | 'error'

const DECODE_INTERVAL_MS = 160
const REPEAT_WINDOW_MS = 2800

function detectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === 'undefined') return null
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector ?? null
}

function cameraSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices !== 'undefined' &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  )
}

export function useCameraCapture(options: {
  onDecode: (value: string) => void
  paused?: boolean
}): {
  videoRef: RefObject<HTMLVideoElement | null>
  status: CameraStatus
  error: string
  active: boolean
  decoderSupported: boolean
  start: () => void
  stop: () => void
} {
  const { onDecode, paused = false } = options
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const onDecodeRef = useRef(onDecode)
  const pausedRef = useRef(paused)
  const lastValueRef = useRef<{ value: string; at: number } | null>(null)
  const [active, setActive] = useState(false)
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [error, setError] = useState('')
  const [decoderSupported, setDecoderSupported] = useState(true)

  onDecodeRef.current = onDecode
  pausedRef.current = paused

  useEffect(() => {
    setDecoderSupported(detectorCtor() !== null)
  }, [])

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setActive(false)
    setStatus('idle')
  }, [])

  const start = useCallback(() => {
    if (!cameraSupported()) {
      setStatus('unsupported')
      setError('Este dispositivo no expone cámara.')
      return
    }
    setStatus('requesting')
    setError('')
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        })
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          video.setAttribute('playsinline', 'true')
          await video.play()
        }
        setActive(true)
        setStatus('running')
      } catch (cause) {
        const name = cause instanceof DOMException ? cause.name : ''
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          setStatus('denied')
          setError('Permiso de cámara denegado. Usa el lector USB.')
        } else {
          setStatus('error')
          setError(cause instanceof Error ? cause.message : 'No se pudo abrir la cámara')
        }
        stop()
      }
    })()
  }, [stop])

  useEffect(() => {
    if (!active || status !== 'running') return
    const Ctor = detectorCtor()
    if (!Ctor) return
    let cancelled = false
    let detector: BarcodeDetectorLike
    try {
      detector = new Ctor({ formats: ['qr_code'] })
    } catch {
      return
    }
    const tick = async () => {
      if (cancelled || pausedRef.current) return
      const video = videoRef.current
      if (!video || video.readyState < 2) return
      try {
        const codes = await detector.detect(video)
        const raw = codes[0]?.rawValue?.trim()
        if (!raw) return
        const now = Date.now()
        const last = lastValueRef.current
        if (last && last.value === raw && now - last.at < REPEAT_WINDOW_MS) return
        lastValueRef.current = { value: raw, at: now }
        onDecodeRef.current(raw)
      } catch {
        /* frame skip */
      }
    }
    const id = window.setInterval(() => void tick(), DECODE_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [active, status])

  useEffect(() => () => stop(), [stop])

  return { videoRef, status, error, active, decoderSupported, start, stop }
}
