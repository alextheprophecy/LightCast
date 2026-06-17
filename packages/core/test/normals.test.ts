import { describe, it, expect } from 'vitest'
import { normalsFromDepth } from '../src/gbuffer'

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

  it('keeps the normal facing forward across a depth cliff (no edge halo)', () => {
    const w = 32
    const h = 8
    const depth = new Float32Array(w * h)
    // Flat foreground (1.0) and background (0.0) split by a hard cliff at x=16.
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) depth[y * w + x] = x < 16 ? 1 : 0
    const n = normalsFromDepth(depth, w, h, 1)
    // Right at the cliff the edge-aware weight suppresses the gradient, so the
    // normal stays ~forward instead of tilting sideways into a bright/dark rim.
    const i = (4 * w + 16) * 3
    expect(n[i + 2]!).toBeGreaterThan(0.9)
    expect(Math.abs(n[i]!)).toBeLessThan(0.3)
  })

  it('stays forward across a softened cliff (no residual rim band)', () => {
    // A real silhouette is smeared by depth resize/blur into a short ramp. The
    // dilated edge suppression should keep the whole band camera-facing, not just
    // its steepest pixel — otherwise the shoulders rim.
    const w = 48
    const h = 8
    const depth = new Float32Array(w * h)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        // foreground 1 → background 0 over a 6px ramp centred at x=24
        const tt = Math.min(1, Math.max(0, (x - 21) / 6))
        depth[y * w + x] = 1 - tt
      }
    const n = normalsFromDepth(depth, w, h, 1)
    // Every pixel across the transition band should remain ~forward.
    for (let x = 19; x <= 29; x++) {
      const nz = n[(4 * w + x) * 3 + 2]!
      expect(nz).toBeGreaterThan(0.8)
    }
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
