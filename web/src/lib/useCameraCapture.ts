import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import jsQR from 'jsqr'

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

const DECODE_INTERVAL_MS = 90
const REPEAT_WINDOW_MS = 2000

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
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [active, setActive] = useState(false)
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [error, setError] = useState('')
  const [decoderSupported, setDecoderSupported] = useState(true)

  onDecodeRef.current = onDecode
  pausedRef.current = paused

  useEffect(() => {
    setDecoderSupported(true)
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
            width: { ideal: 960 },
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
    let cancelled = false
    let detector: BarcodeDetectorLike | null = null
    if (Ctor) {
      try {
        detector = new Ctor({ formats: ['qr_code'] })
      } catch {
        detector = null
      }
    }
    if (!canvasRef.current) canvasRef.current = document.createElement('canvas')

    const emit = (raw: string) => {
      const now = Date.now()
      const last = lastValueRef.current
      if (last && last.value === raw && now - last.at < REPEAT_WINDOW_MS) return
      lastValueRef.current = { value: raw, at: now }
      onDecodeRef.current(raw)
    }

    const tick = async () => {
      if (cancelled || pausedRef.current) return
      const video = videoRef.current
      if (!video || video.readyState < 2) return
      try {
        if (detector) {
          const codes = await detector.detect(video)
          const raw = codes[0]?.rawValue?.trim()
          if (raw) emit(raw)
          return
        }
        const canvas = canvasRef.current!
        const w = Math.min(480, video.videoWidth || 480)
        const h = Math.min(480, video.videoHeight || 480)
        if (w < 8 || h < 8) return
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return
        ctx.drawImage(video, 0, 0, w, h)
        const img = ctx.getImageData(0, 0, w, h)
        const code = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' })
        const raw = code?.data?.trim()
        if (raw) emit(raw)
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
