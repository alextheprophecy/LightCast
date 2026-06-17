# @lightcast/cli

Bake normal+depth G-buffers offline so production sites ship a tiny runtime + one PNG instead of a model.

```bash
npx @lightcast/cli bake hero.jpg -o hero.gbuffer.png
```

```ts
import { createLightcast } from 'lightcast'
await createLightcast('/hero.jpg', { gbuffer: '/hero.gbuffer.png' }) // inference skipped
```

MIT.
