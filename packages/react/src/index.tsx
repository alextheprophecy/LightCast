import { useEffect, useRef } from 'react'
import {
  createLightcast,
  type LightcastOptions,
  type LightPreset,
  type LightScene,
} from 'lightcast'

export interface RelightProps extends LightcastOptions {
  src: string
  preset?: LightPreset
  className?: string
  style?: React.CSSProperties
  onReady?: (scene: LightScene) => void
}

/**
 * Drop-in interactive relighting. SSR-safe: renders an empty container on the
 * server and initializes lightcast only after mount.
 */
export function Relight({ src, preset, className, style, onReady, ...options }: RelightProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let scene: LightScene | undefined
    let cancelled = false
    const host = ref.current
    if (!host) return

    createLightcast(src, options).then((s) => {
      if (cancelled) {
        s.dispose()
        return
      }
      scene = s
      s.mount(host)
      if (preset) s.play(preset)
      onReady?.(s)
    })

    return () => {
      cancelled = true
      scene?.dispose()
      if (host) host.innerHTML = ''
    }
  }, [src, preset])

  return <div ref={ref} className={className} style={{ position: 'relative', ...style }} />
}
