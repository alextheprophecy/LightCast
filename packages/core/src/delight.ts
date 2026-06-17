/**
 * De-lighting — the genuinely hard problem lightcast owns.
 *
 * A photo already has light baked into its pixels. If you shade on top of it,
 * you double the existing lighting. To relight correctly we first estimate and
 * remove the original shading to recover an approximate **albedo** (base color),
 * then the renderer re-applies new light.
 *
 * The `grade` strategy implemented here is a fast, dependency-free retinex /
 * homomorphic approach: shading is mostly low-frequency luminance, so we divide
 * the image by a blurred version of its own luminance to flatten it, then renormalize.
 *
 * Everything here is pure (no DOM, no GL) so it is unit-tested directly.
 */

/** sRGB byte → linear float (0..1). */
export function srgbToLinear(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

/** linear float (0..1) → sRGB byte. */
export function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
  return Math.round(Math.min(1, Math.max(0, v)) * 255)
}

/** Rec. 709 relative luminance from linear RGB. */
export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * Separable box blur of a single-channel float field. `radius` in pixels.
 * Used to estimate the low-frequency shading field.
 */
export function boxBlur(
  src: Float32Array,
  width: number,
  height: number,
  radius: number,
): Float32Array {
  if (radius < 1) return src.slice()
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)
  const win = radius * 2 + 1

  // horizontal
  for (let y = 0; y < height; y++) {
    const row = y * width
    let acc = 0
    for (let x = -radius; x <= radius; x++) acc += src[row + Math.min(width - 1, Math.max(0, x))]!
    for (let x = 0; x < width; x++) {
      tmp[row + x] = acc / win
      const add = src[row + Math.min(width - 1, x + radius + 1)]!
      const sub = src[row + Math.max(0, x - radius)]!
      acc += add - sub
    }
  }
  // vertical
  for (let x = 0; x < width; x++) {
    let acc = 0
    for (let y = -radius; y <= radius; y++)
      acc += tmp[Math.min(height - 1, Math.max(0, y)) * width + x]!
    for (let y = 0; y < height; y++) {
      out[y * width + x] = acc / win
      const add = tmp[Math.min(height - 1, y + radius + 1) * width + x]!
      const sub = tmp[Math.max(0, y - radius) * width + x]!
      acc += add - sub
    }
  }
  return out
}

export interface DelightResult {
  /** Estimated albedo as linear RGB floats, length width*height*3. */
  albedo: Float32Array
  /** Estimated original shading field (luminance), length width*height. */
  shading: Float32Array
  width: number
  height: number
}

/**
 * `grade` de-lighting. Returns a flattened albedo and the removed shading field.
 *
 * @param strength 0 (keep original light) .. 1 (fully flatten). Default 0.8.
 */
export function delightGrade(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  strength = 0.8,
): DelightResult {
  const n = width * height
  const lin = new Float32Array(n * 3)
  const lum = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const r = srgbToLinear(rgba[i * 4]!)
    const g = srgbToLinear(rgba[i * 4 + 1]!)
    const b = srgbToLinear(rgba[i * 4 + 2]!)
    lin[i * 3] = r
    lin[i * 3 + 1] = g
    lin[i * 3 + 2] = b
    lum[i] = Math.max(1e-4, luminance(r, g, b))
  }

  // Low-frequency shading estimate; radius scales with image size.
  const radius = Math.max(2, Math.round(Math.min(width, height) * 0.06))
  const shading = boxBlur(lum, width, height, radius)

  // Mean shading so we re-normalize to roughly the original exposure.
  let mean = 0
  for (let i = 0; i < n; i++) mean += shading[i]!
  mean /= n

  const albedo = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    // Blend between original (strength 0) and fully flattened (strength 1).
    // Clamp the gain: across a high-contrast edge the blurred shading lags the
    // real luminance, and an unclamped ratio paints a bright/dark retinex halo.
    const gain = Math.min(1.6, Math.max(0.6, 1 - strength + strength * (mean / shading[i]!)))
    albedo[i * 3] = lin[i * 3]! * gain
    albedo[i * 3 + 1] = lin[i * 3 + 1]! * gain
    albedo[i * 3 + 2] = lin[i * 3 + 2]! * gain
  }
  return { albedo, shading, width, height }
}

/** Pack a linear-RGB albedo float array back into an sRGB RGBA ImageData-style buffer. */
export function albedoToRgba(
  albedo: Float32Array,
  width: number,
  height: number,
): Uint8ClampedArray {
  const n = width * height
  const out = new Uint8ClampedArray(n * 4)
  for (let i = 0; i < n; i++) {
    out[i * 4] = linearToSrgb(albedo[i * 3]!)
    out[i * 4 + 1] = linearToSrgb(albedo[i * 3 + 1]!)
    out[i * 4 + 2] = linearToSrgb(albedo[i * 3 + 2]!)
    out[i * 4 + 3] = 255
  }
  return out
}
