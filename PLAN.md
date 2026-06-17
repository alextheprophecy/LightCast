# lightcast — project plan

> **One line:** _Drag a light around any photo. In the browser._
> Estimate a per-pixel **geometry buffer** (surface normals + depth) from a single image with a
> feed-forward model, then **relight it in real time** with a hand-written WebGL2 shader —
> move the light, change its color/temperature, add rim/fill lights, fake a studio.

lightcast is the direct sibling of [depthcast](https://github.com/alextheprophecy/depthcast):
same DNA — _estimate a dense per-pixel buffer from one image, then drive a real-time WebGL effect_ —
applied to **lighting** instead of **parallax**. The two form a **"cast" family**.

---

## 1. The gap (why this earns stars)

Relighting a photo today means one of three walls, exactly like the depth/parallax space did:

| Existing path                                                    | Wall                                                                       |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **IC-Light / Neural Gaffer / UniRelight** (diffusion relighting) | Python + GPU, multi-second per frame, **not interactive, not embeddable**. |
| **Photoshop / manual dodge-and-burn**                            | Hand work by an artist. The universal blocker.                             |
| **3D / Blender relight**                                         | Requires actual geometry; you don't have a mesh, you have a JPEG.          |
| **Portrait-only face relight demos**                             | Faces only, dated, server-bound.                                           |

There is **no `npm i` library that relights an arbitrary photo client-side.** That is the gap.
lightcast closes it: **image → automatic normals+depth → interactive relighting**, 100% in the
browser, in a package you `import`.

## 2. Why it's feasible now (the unlock)

The blocker used to be: good monocular normals meant heavy diffusion models (StableNormal, Marigold,
Lotus) — too slow/large for the browser. The unlock:

- **Metric3D v2** has community **ONNX exports** (`metric3d-vit-small/large/giant`, fp16 + fp32,
  dynamic shapes) and produces **metric depth _and_ surface normals in a single feed-forward pass.**
  One model → the whole G-buffer. The `vit-small` variant is browser-sized.
- It runs in **`onnxruntime-web` on WebGPU** (WASM fallback), the same runtime depthcast leans on.
- Relighting from a normal+depth buffer is **classic real-time graphics** (Lambert + Blinn-Phong +
  screen-space shadows), so the render side is a hand-written WebGL2 shader with **zero peer deps** —
  exactly depthcast's renderer philosophy.

**Sources:** Metric3D v2 ONNX community exports (HF `onnx-community/metric3d-*`, fp16/fp32, dynamic
shapes, transformers.js-targeted); IC-Light (lllyasviel) confirming relighting is diffusion/Python today.

## 3. The one genuinely hard problem we own: **de-lighting**

depthcast owns _disocclusion_. lightcast owns **de-lighting (albedo recovery).**

If you just shade `normals · lightDir` and multiply onto the photo, you **double the lighting** that's
already baked into the pixels — a face lit from the left, relit from the right, looks wrong because the
original left-light is still there. To relight correctly you must first **remove the original shading**
to recover an approximate **albedo (base color)**, then re-apply new light.

Our strategy, escalating in cost (mirrors depthcast's `feather`/`inpaint`/`none`):

- **`grade`** _(default)_ — treat estimated shading as a low-frequency luminance field; divide it out
  (homomorphic / retinex-style) to flatten existing light, then re-shade. Cheap, runs anywhere, looks
  great for soft relights. **This is the headline trick.**
- **`intrinsic`** — run a lightweight **intrinsic-decomposition** pass (albedo/shading split) for a
  cleaner base layer; better for strong relights and colored lights.
- **`none`** — multiply-only, fastest, "tints" rather than truly relights.

Plus the rendering hard-parts we own in GLSL:

- **Screen-space contact shadows** ray-marched against the depth buffer, so a light from the side
  casts plausible shadows into the scene (the detail that sells "this is 3D, not a filter").
- **Normal-buffer relighting** with ambient + key + rim, temperature (Kelvin) control, and specular.

## 4. Architecture (mirrors depthcast)

```
input → loader (normalize + downscale)
      → gbuffer  (onnxruntime-web · Metric3D v2 · WebGPU→WASM) → { normals, depth }
      → delight  (recover albedo: grade / intrinsic)
      → renderer (hand-written WebGL2: relight shader + screen-space shadows)
      → controls (pointer moves the light · orbit · scroll) + damped light loop
```

The de-lighting math, light/color math, and shadow params are **pure and unit-tested**; the renderer
is dependency-free WebGL2 (custom GLSL, tiny vec/mat helpers shared in spirit with depthcast).

## 5. Two modes (the depthcast pattern)

1. **Runtime — magic ✨**: pass an image; normals+depth estimated in-browser; relight live. Great for
   tools, editors, UGC.
2. **Precompute — production 🚀**: bake the G-buffer once with the CLI into a **single packed PNG**
   (normals in RGB, depth in alpha). Ship `image + image.gbuffer.png + ~15 KB runtime`. **No model is
   ever sent to visitors** — the relight runs purely in WebGL.

```bash
npx @lightcast/cli bake hero.jpg -o hero.gbuffer.png
```

```ts
await createLightcast('/hero.jpg', { gbuffer: '/hero.gbuffer.png' }) // inference skipped
```

|                    | Runtime                         | Precompute               |
| ------------------ | ------------------------------- | ------------------------ |
| Shipped to visitor | ~15 KB runtime + Metric3D model | ~15 KB runtime + one PNG |
| First paint        | seconds (download + infer)      | instant                  |
| Best for           | editors, prototypes, UGC        | hero sections, prod, ads |

## 6. Public API (sketch)

```ts
const scene = await createLightcast(input, {
  model: 'onnx-community/metric3d-vit-small',
  device: 'auto', // webgpu → wasm
  delight: 'grade', // 'grade' | 'intrinsic' | 'none'
  light: { azimuth: 35, elevation: 45, color: '#fff', temperature: 5500, intensity: 1 },
  ambient: 0.25,
  specular: 0.3,
  shadows: true, // screen-space contact shadows from depth
  controls: 'pointer', // pointer moves the light
})
scene.mount(el)
scene.setLight({ azimuth: -20 }) // -1..1 or degrees; drive from anything
scene.play('studio') // 'studio' | 'orbit' | 'golden-hour' | 'flicker'
const webm = await scene.exportVideo({ path: 'orbit', durationMs: 4000 })
```

React: `<Relight src="/portrait.jpg" preset="studio" />` — SSR-safe, like `<Depth3D/>`.

## 7. Roadmap

- [ ] G-buffer estimation (Metric3D v2 ONNX, WebGPU→WASM) + packed-PNG precompute
- [ ] `grade` de-lighting + WebGL2 relight shader (ambient/key/rim, Kelvin)
- [ ] Screen-space contact shadows from depth
- [ ] `intrinsic` albedo decomposition pass
- [ ] React `<Relight/>` + `bake` CLI + WebM export
- [ ] HDRI / environment-map relighting (drag an .hdr)
- [ ] `react-three-fiber` adapter

## 8. Risks & mitigations

| Risk                                           | Mitigation                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Metric3D normals noisier than diffusion models | Bilateral-smooth normals using the depth edges; expose `quality` (small/large).             |
| De-lighting is approximate                     | Ship `grade` as honest "relight", `intrinsic` for fidelity; never claim physically-correct. |
| Model download size                            | Precompute mode ships zero model; cache model in browser for runtime mode.                  |
| WebGPU availability                            | WASM fallback (slower infer; relight is always real-time once the buffer exists).           |
