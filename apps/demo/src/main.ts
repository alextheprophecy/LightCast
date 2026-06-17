import { createLightcast } from 'lightcast'

const app = document.getElementById('app')!

async function relight(src: string) {
  app.innerHTML = 'estimating geometry…'
  try {
    const scene = await createLightcast(src, {
      light: { azimuth: 35, elevation: 45, temperature: 5500 },
      controls: 'pointer',
      onProgress: (stage, pct) => (app.innerHTML = `${stage}: ${Math.round(pct)}%`),
    })
    app.innerHTML = ''
    scene.mount(app)
  } catch (err) {
    app.innerHTML = `<pre style="color:#f88">${err instanceof Error ? err.message : err}</pre>`
  }
}

// Drag-and-drop any image.
document.addEventListener('dragover', (e) => e.preventDefault())
document.addEventListener('drop', (e) => {
  e.preventDefault()
  const file = e.dataTransfer?.files?.[0]
  if (file) relight(URL.createObjectURL(file))
})

relight('/sample.jpg')
