/** Pure light/color math — unit-tested. No DOM, no GL. */

/** Approximate Kelvin color temperature → linear-ish RGB (0..1), normalized to green=1. */
export function kelvinToRgb(kelvin: number): [number, number, number] {
  const t = Math.min(40000, Math.max(1000, kelvin)) / 100
  let r: number, g: number, b: number
  if (t <= 66) {
    r = 255
    g = 99.4708025861 * Math.log(t) - 161.1195681661
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592)
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492)
  }
  if (t >= 66) b = 255
  else if (t <= 19) b = 0
  else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307
  const clamp = (v: number) => Math.min(255, Math.max(0, v)) / 255
  return [clamp(r), clamp(g), clamp(b)]
}

/** "#rrggbb" → linear-ish RGB (0..1). Falls back to white on bad input. */
export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return [1, 1, 1]
  const v = parseInt(m[1]!, 16)
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]
}

/**
 * Azimuth/elevation in degrees → unit light direction in view space.
 * Azimuth 0 = from the right, 90 = from above the viewer; elevation tilts toward camera.
 */
export function lightDirection(azimuthDeg: number, elevationDeg: number): [number, number, number] {
  const az = (azimuthDeg * Math.PI) / 180
  const el = (elevationDeg * Math.PI) / 180
  const x = Math.cos(el) * Math.cos(az)
  const y = Math.sin(el)
  const z = Math.cos(el) * Math.sin(az)
  const len = Math.hypot(x, y, z) || 1
  return [x / len, y / len, z / len]
}
