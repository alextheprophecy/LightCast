<div align="center">

# lightcast

**Relight any photo from a single image — in the browser.**
Automatic surface normals + depth. Drag the light. No server. No 3D model. One import.

[![npm](https://img.shields.io/badge/npm-lightcast-ffd76e)](https://www.npmjs.com/package/lightcast)
[![license](https://img.shields.io/badge/license-MIT-ffd76e)](./LICENSE)

**[▶ Live demo](https://alextheprophecy.github.io/LightCast/)** — runs entirely on your device (works on mobile).

```bash
npm i lightcast
```

</div>

---

## Why

Relighting a photo is everywhere in product shots, portraits and ads — but every existing path hits a wall:

- **[IC-Light](https://github.com/lllyasviel/IC-Light) / Neural Gaffer / UniRelight** are diffusion models: Python + GPU, seconds per frame, **not interactive, not embeddable**.
- **Photoshop dodge-and-burn** is gorgeous but it's **manual artist work** — the universal blocker.
- **Blender relighting** needs an actual **3D mesh** — you have a JPEG, not geometry.

`lightcast` closes the gap: **image → automatic normals + depth → interactive relighting**, 100% client-side, in a package you `import`. Geometry is estimated in-browser via [Depth Anything V2](https://github.com/DepthAnything/Depth-Anything-V2) (run through [transformers.js](https://github.com/huggingface/transformers.js) on WebGPU→WASM), with surface normals derived analytically from the depth gradient — small and mobile-friendly, and swappable for a true normals model like [Metric3D v2](https://github.com/YvanYin/Metric3D). Relighting is a hand-written WebGL2 shader with **zero peer dependencies** (no three.js).

It's the sibling of [**depthcast**](https://github.com/alextheprophecy/depthcast): same idea — estimate a dense per-pixel buffer from one image, then drive a real-time WebGL effect — applied to **light** instead of **parallax**.

## Quickstart

```ts
import { createLightcast } from 'lightcast'

const scene = await createLightcast('/portrait.jpg', {
  light: { azimuth: 35, elevation: 45, temperature: 5500 },
  controls: 'pointer', // move the mouse → move the light
})
scene.mount(document.getElementById('app')!)
```

Move your mouse — the light sweeps across the face, and a soft contact shadow follows.

### React

```tsx
import { Relight } from '@lightcast/react'

export default function Hero() {
  return <Relight src="/product.jpg" preset="studio" style={{ height: 480 }} />
}
```

`<Relight />` is **SSR-safe** — renders nothing on the server, hydrates cleanly in Next.js / Remix.

## Two modes

### 1. Runtime — the magic ✨

Pass an image; normals + depth are estimated in-browser; relight live. Perfect for editors, prototypes and UGC. The model lazy-loads from CDN and is **cached** after first use.

### 2. Precompute — production 🚀

Bake the **G-buffer** once with the CLI into a single packed PNG (normals in RGB, depth in alpha). Ship `image + image.gbuffer.png + ~15 KB runtime`. **No model is ever sent to your visitors** — the relight is pure WebGL.

```bash
npx @lightcast/cli bake hero.jpg -o hero.gbuffer.png
```

```ts
await createLightcast('/hero.jpg', { gbuffer: '/hero.gbuffer.png' }) // inference skipped
```

## The interesting part: de-lighting

The original photo **already has light baked in**. Naïvely shading on top doubles it — relight a
left-lit face from the right and the old left light is still there. So lightcast first **removes** the
original shading to recover an approximate **albedo**, then re-applies new light. Three strategies via
`delight`:

- **`grade`** _(default)_ — flatten the existing low-frequency shading (retinex-style), then re-shade. Cheap, runs anywhere.
- **`intrinsic`** — a lightweight albedo/shading decomposition for cleaner, stronger relights.
- **`none`** — multiply-only; tints rather than truly relights.

Plus **screen-space contact shadows** ray-marched against the depth buffer — the detail that makes it read as 3D, not a filter.

## How it works

```
input → loader → gbuffer (Metric3D v2 · normals + depth · WebGPU→WASM)
      → delight (recover albedo) → renderer (WebGL2 relight + contact shadows)
      → controls (pointer · orbit · scroll) + damped light loop
```

See [`PLAN.md`](./PLAN.md) for the full design, feasibility analysis and roadmap.

## Packages

| package                                | what                        |
| -------------------------------------- | --------------------------- |
| [`lightcast`](./packages/core)         | framework-agnostic core     |
| [`@lightcast/react`](./packages/react) | `<Relight />` wrapper       |
| [`@lightcast/cli`](./packages/cli)     | `bake` the G-buffer offline |

## License

MIT © [alextheprophecy](https://github.com/alextheprophecy). Model weights are downloaded from Hugging Face under their respective (permissive) licenses.
