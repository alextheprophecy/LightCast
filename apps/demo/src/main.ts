import {
  createLightcast,
  type LightScene,
  type LightcastOptions,
  type LightPreset,
} from 'lightcast'
import { env } from '@huggingface/transformers'

// --- Make the hosted demo work on static hosting (GitHub Pages) + mobile ---
// GitHub Pages can't send COOP/COEP headers, so SharedArrayBuffer (threaded
// WASM) is unavailable: force single-threaded so the WASM backend still runs.
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.numThreads = 1
}

const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const dropzone = $<HTMLDivElement>('dropzone')
const fileInput = $<HTMLInputElement>('file')
const samplesEl = $<HTMLDivElement>('samples')
const viewport = $<HTMLDivElement>('viewport')
const progress = $<HTMLDivElement>('progress')
const progressBar = progress.querySelector('.bar') as HTMLElement
const progressText = progress.querySelector('span') as HTMLElement
const controls = $<HTMLElement>('controls')

const elevation = $<HTMLInputElement>('elevation')
const intensity = $<HTMLInputElement>('intensity')
const ambient = $<HTMLInputElement>('ambient')
const specular = $<HTMLInputElement>('specular')
const relief = $<HTMLInputElement>('relief')
const shadows = $<HTMLInputElement>('shadows')
const color = $<HTMLInputElement>('color')
const preset = $<HTMLSelectElement>('preset')
const resetBtn = $<HTMLButtonElement>('reset')

const SAMPLES = [
  'https://images.unsplash.com/photo-1503443207922-dff7d543fd0e?w=900&q=80',
  'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=900&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=900&q=80',
  'https://images.unsplash.com/photo-1525857597365-5f6dbff2e36e?w=900&q=80',
]

const STAGE_LABELS: Record<string, string> = {
  model: 'Downloading model',
  inference: 'Estimating geometry',
  gbuffer: 'Building G-buffer',
}

let scene: LightScene | null = null
let azimuth = 35

function setProgress(stage: string, pct: number) {
  progress.hidden = false
  progressBar.style.setProperty('--pct', `${Math.round(pct)}%`)
  progressText.textContent = `${STAGE_LABELS[stage] ?? stage}… ${Math.round(pct)}%`
}

function currentLight() {
  return {
    azimuth,
    elevation: Number(elevation.value),
    color: color.value,
    intensity: Number(intensity.value),
  }
}

function applyLight() {
  scene?.setLight(currentLight())
}

function applyOptions() {
  scene?.update({ ambient: Number(ambient.value), specular: Number(specular.value) })
}

async function load(src: string | File) {
  scene?.dispose()
  scene = null
  dropzone.hidden = true
  samplesEl.hidden = true
  viewport.hidden = false
  controls.hidden = true
  setProgress('model', 0)

  const options: LightcastOptions = {
    light: currentLight(),
    ambient: Number(ambient.value),
    specular: Number(specular.value),
    shadows: shadows.checked,
    normalStrength: Number(relief.value),
    // Single-threaded WASM on static hosting. fp16 (medium) gives smoother depth
    // than q8 on desktop, which means cleaner normals; mobile stays light.
    device: isMobile ? 'wasm' : 'auto',
    quality: isMobile ? 'low' : 'medium',
    maxResolution: isMobile ? 640 : 1024,
    onProgress: setProgress,
  }

  try {
    scene = await createLightcast(src, options)
    progress.hidden = true
    scene.mount(viewport)
    controls.hidden = false
    if (preset.value) scene.play(preset.value as LightPreset)
  } catch (err) {
    progress.hidden = false
    progressText.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`
  }
}

// --- pointer drives the key light (azimuth from x, elevation from y) ---
viewport.addEventListener('pointermove', (e) => {
  if (!scene || preset.value) return
  const rect = scene.canvas.getBoundingClientRect()
  const u = (e.clientX - rect.left) / rect.width
  const v = (e.clientY - rect.top) / rect.height
  azimuth = -180 + u * 360
  elevation.value = String(Math.round(85 - Math.min(1, Math.max(0, v)) * 70))
  applyLight()
})

// --- controls ---
for (const el of [elevation, intensity, color]) el.addEventListener('input', applyLight)
for (const el of [ambient, specular]) el.addEventListener('input', applyOptions)
shadows.addEventListener('change', () => scene?.update({ shadows: shadows.checked }))
// Relief re-derives normals from the cached depth (no model re-run) — cheap enough
// to drive live from the slider.
relief.addEventListener('input', () => scene?.setRelief(Number(relief.value)))
preset.addEventListener('change', () => {
  if (!scene) return
  if (preset.value) scene.play(preset.value as LightPreset)
  else {
    scene.pause()
    applyLight()
  }
})
resetBtn.addEventListener('click', () => {
  azimuth = 35
  elevation.value = '45'
  intensity.value = '1.1'
  ambient.value = '0.25'
  specular.value = '0.3'
  relief.value = '1'
  shadows.checked = true
  color.value = '#fff3e0'
  preset.value = ''
  scene?.pause()
  scene?.setRelief(1)
  scene?.update({ shadows: true })
  applyLight()
  applyOptions()
})

// --- dropzone + file input ---
dropzone.addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (file) load(file)
})
document.addEventListener('dragover', (e) => {
  e.preventDefault()
  dropzone.classList.add('drag')
})
document.addEventListener('dragleave', () => dropzone.classList.remove('drag'))
document.addEventListener('drop', (e) => {
  e.preventDefault()
  dropzone.classList.remove('drag')
  const file = e.dataTransfer?.files?.[0]
  if (file) load(file)
})

// --- sample thumbnails ---
for (const url of SAMPLES) {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = url
  img.addEventListener('click', () => load(url))
  samplesEl.appendChild(img)
}
