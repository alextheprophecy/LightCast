/** Image loading + normalization. Browser-first; the CLI provides its own decoder. */

export interface LoadedImage {
  imageData: ImageData
  width: number
  height: number
}

/** Fit (w,h) within `max` on the longest edge, preserving aspect ratio. */
export function fitWithin(w: number, h: number, max: number): { width: number; height: number } {
  if (Math.max(w, h) <= max) return { width: w, height: h }
  const s = max / Math.max(w, h)
  return { width: Math.round(w * s), height: Math.round(h * s) }
}

async function toBitmap(
  input: Exclude<import('./types').ImageSource, ImageData>,
): Promise<ImageBitmap> {
  if (typeof input === 'string') {
    const res = await fetch(input)
    return createImageBitmap(await res.blob())
  }
  if (input instanceof Blob) return createImageBitmap(input)
  return createImageBitmap(input as CanvasImageSource)
}

/** Load any ImageSource into RGBA ImageData, downscaled to `maxResolution`. */
export async function loadImage(
  input: import('./types').ImageSource,
  maxResolution = 1024,
): Promise<LoadedImage> {
  let bmpW: number, bmpH: number
  let draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void

  if (typeof ImageData !== 'undefined' && input instanceof ImageData) {
    bmpW = input.width
    bmpH = input.height
    const src = input
    draw = (ctx) => ctx.putImageData(src, 0, 0)
  } else {
    const bmp = await toBitmap(input as Exclude<import('./types').ImageSource, ImageData>)
    bmpW = bmp.width
    bmpH = bmp.height
    draw = (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h)
  }

  const { width, height } = fitWithin(bmpW, bmpH, maxResolution)
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement('canvas'), { width, height })
  const ctx = (canvas as any).getContext('2d') as CanvasRenderingContext2D
  draw(ctx, width, height)
  const imageData = ctx.getImageData(0, 0, width, height)
  return { imageData, width, height }
}
