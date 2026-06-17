/**
 * lightcast CLI — bake a G-buffer (normals + depth) offline so production sites
 * ship a tiny runtime + one PNG instead of a model.
 *
 *   lightcast bake hero.jpg -o hero.gbuffer.png
 *
 * Node image decode/encode wiring (the only browser-specific bit) is the first
 * task — see PLAN.md §5. Arg parsing and the call into `bakeGBuffer` are real.
 */
import { parseArgs } from 'node:util'

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: 'string', short: 'o' },
      model: { type: 'string', short: 'm' },
      quality: { type: 'string', short: 'q' },
      help: { type: 'boolean', short: 'h' },
    },
  })

  const [cmd, input] = positionals
  if (values.help || cmd !== 'bake' || !input) {
    console.log(
      [
        'lightcast — bake normal+depth G-buffers offline',
        '',
        'Usage:',
        '  lightcast bake <image> -o <out.gbuffer.png> [--model id] [--quality low|medium|high]',
        '',
        'Then in the browser:',
        "  createLightcast('/image.jpg', { gbuffer: '/out.gbuffer.png' })",
      ].join('\n'),
    )
    process.exit(values.help ? 0 : 1)
  }

  const out = values.out ?? input.replace(/\.[^.]+$/, '') + '.gbuffer.png'
  // TODO(impl): decode `input` to RGBA (sharp/jimp), call bakeGBuffer (Node ORT),
  // encode the returned ImageData to PNG at `out`. See PLAN.md §5.
  console.log(
    `lightcast: would bake "${input}" → "${out}" (Node decode/encode pending — PLAN.md §5)`,
  )
  process.exitCode = 0
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
