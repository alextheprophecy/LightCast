# lightcast

Relight any photo from a single image in the browser — automatic surface normals + depth, real-time WebGL shading, no server.

```bash
npm i lightcast
```

```ts
import { createLightcast } from 'lightcast'

const scene = await createLightcast('/portrait.jpg', {
  light: { azimuth: 35, elevation: 45, temperature: 5500 },
  controls: 'pointer',
})
scene.mount(document.getElementById('app')!)
```

Framework-agnostic core: geometry via Metric3D v2 (normals + depth in one pass, WebGPU→WASM via
onnxruntime-web) + a hand-written, dependency-free WebGL2 relight renderer with de-lighting (albedo
recovery) and screen-space contact shadows.

📖 Full docs, design and roadmap: **https://github.com/alextheprophecy/lightcast**

MIT.
