import { describe, it, expect } from 'vitest'
import { normalsFromDepth, detailEnhanceHeight } from '../src/gbuffer'

describe('detailEnhanceHeight', () => {
  it('amplifies mid-frequency structure (unsharp boost)', () => {
    const w = 96
    const h = 96
    const depth = new Float32Array(w * h).fill(0.5)
    // A soft raised region in the middle.
    for (let y = 36; y < 60; y++) for (let x = 36; x < 60; x++) depth[y * w + x] = 0.62
    const out = detailEnhanceHeight(depth, w, h, 1.2)
    let mn = Infinity
    let mx = -Infinity
    for (let i = 0; i < out.length; i++) {
      mn = Math.min(mn, out[i]!)
      mx = Math.max(mx, out[i]!)
    }
    // Unsharp overshoots beyond the original [0.5, 0.62] range at the structure's
    // edges → more pronounced relief for the relight to shade.
    expect(mx).toBeGreaterThan(0.62)
    expect(mn).toBeLessThan(0.5)
    // Flat far-field is essentially unchanged.
    expect(out[5 * w + 5]!).toBeCloseTo(0.5, 2)
  })
})

describe('normalsFromDepth', () => {
  it('tilts the normal on a smooth depth ramp', () => {
    const w = 64
    const h = 8
    const depth = new Float32Array(w * h)
    // Gentle, sub-cliff ramp: depth rises across +x (preserved by the edge filter).
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) depth[y * w + x] = (x / (w - 1)) * 0.3
    const n = normalsFromDepth(depth, w, h, 1.5)
    const i = (4 * w + 32) * 3
    // Depth rising in +x tilts the normal toward -x; it stays mostly camera-facing.
    expect(n[i]!).toBeLessThan(0)
    expect(n[i + 2]!).toBeGreaterThan(0.5)
  })

  it('clamps a hard cliff to a bounded soft edge (no blowout, no dead band)', () => {
    const w = 128
    const h = 8
    const depth = new Float32Array(w * h)
    // Flat foreground (1.0) and background (0.0) split by a hard cliff at x=64.
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) depth[y * w + x] = x < 64 ? 1 : 0
    const n = normalsFromDepth(depth, w, h, 1)
    const i = (4 * w + 64) * 3
    // The tilt is *bounded* (clamp) so the normal never blows out near-sideways…
    expect(n[i + 2]!).toBeGreaterThan(0.75)
    // …but it still tilts, so shading reaches the contour (no flat dead band).
    expect(Math.abs(n[i]!)).toBeGreaterThan(0.3)
    expect(Math.abs(n[i]!)).toBeLessThan(0.7)
  })

  it('keeps the edge shaded but bounded across a softened cliff', () => {
    // Depth resize/blur smears a cliff into a short ramp. Across it, normals must
    // stay bounded (no rim blowout) yet still tilt (no dead, unshaded band).
    const w = 128
    const h = 8
    const depth = new Float32Array(w * h)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const tt = Math.min(1, Math.max(0, (x - 62) / 4)) // 4px ramp centred ~x=64
        depth[y * w + x] = 1 - tt
      }
    const n = normalsFromDepth(depth, w, h, 1)
    let maxTilt = 0
    for (let x = 60; x <= 68; x++) {
      const nz = n[(4 * w + x) * 3 + 2]!
      expect(nz).toBeGreaterThan(0.7) // never blown out
      maxTilt = Math.max(maxTilt, Math.abs(n[(4 * w + x) * 3]!))
    }
    expect(maxTilt).toBeGreaterThan(0.2) // the edge is genuinely shaded, not dead-flat
  })

  it('produces unit-length normals', () => {
    const w = 8
    const h = 8
    const depth = new Float32Array(w * h)
    for (let i = 0; i < depth.length; i++) depth[i] = Math.random()
    const n = normalsFromDepth(depth, w, h, 1.5)
    for (let i = 0; i < w * h; i++) {
      const len = Math.hypot(n[i * 3]!, n[i * 3 + 1]!, n[i * 3 + 2]!)
      expect(len).toBeCloseTo(1, 5)
    }
  })
})
