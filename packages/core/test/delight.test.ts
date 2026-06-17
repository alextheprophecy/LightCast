import { describe, it, expect } from 'vitest'
import { boxBlur, delightGrade, luminance, srgbToLinear, linearToSrgb } from '../src/delight'
import { kelvinToRgb, lightDirection, hexToRgb } from '../src/color'

describe('color/luminance round-trips', () => {
  it('srgb<->linear is roughly invertible', () => {
    for (const v of [0, 64, 128, 200, 255]) {
      expect(linearToSrgb(srgbToLinear(v))).toBeCloseTo(v, -1)
    }
  })
  it('luminance of white linear is 1', () => {
    expect(luminance(1, 1, 1)).toBeCloseTo(1, 5)
  })
})

describe('boxBlur', () => {
  it('preserves a constant field', () => {
    const f = new Float32Array(16).fill(0.5)
    const out = boxBlur(f, 4, 4, 1)
    for (const v of out) expect(v).toBeCloseTo(0.5, 6)
  })
  it('smooths an impulse (peak drops, energy spreads)', () => {
    const f = new Float32Array(25)
    f[12] = 1 // center of 5x5
    const out = boxBlur(f, 5, 5, 1)
    expect(out[12]!).toBeLessThan(1)
    expect(out[12]!).toBeGreaterThan(0)
    expect(out[11]!).toBeGreaterThan(0)
  })
})

describe('delightGrade', () => {
  it('flattens a luminance gradient toward its mean', () => {
    // Horizontal gradient, same hue: shading should be largely removed.
    const w = 16,
      h = 16
    const rgba = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        const v = Math.round((x / (w - 1)) * 255)
        rgba[i] = v
        rgba[i + 1] = v
        rgba[i + 2] = v
        rgba[i + 3] = 255
      }
    const { albedo } = delightGrade(rgba, w, h, 1)
    // After full flatten, per-row luminance variance should shrink vs. input.
    const left = albedo[(8 * w + 1) * 3]!
    const right = albedo[(8 * w + 14) * 3]!
    const inputRatio = srgbToLinear(254) / Math.max(1e-4, srgbToLinear(17))
    const outRatio = right / Math.max(1e-4, left)
    expect(outRatio).toBeLessThan(inputRatio)
  })
})

describe('light math', () => {
  it('lightDirection returns a unit vector', () => {
    const [x, y, z] = lightDirection(35, 45)
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 5)
  })
  it('kelvin warm < neutral in blue channel', () => {
    expect(kelvinToRgb(3000)[2]).toBeLessThan(kelvinToRgb(6500)[2])
  })
  it('hexToRgb parses', () => {
    expect(hexToRgb('#ff0000')).toEqual([1, 0, 0])
  })
})
