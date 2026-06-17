# Contributing to lightcast

Thanks for your interest! lightcast is a pnpm monorepo.

## Setup

```bash
pnpm install
pnpm build        # build the libraries (core → react/cli depend on it)
pnpm dev          # run the demo app (apps/demo) at localhost:5173
```

## Layout

```
packages/core    # `lightcast` — G-buffer estimation + WebGL2 relight renderer
packages/react   # `@lightcast/react` — <Relight /> wrapper
packages/cli     # `@lightcast/cli` — offline G-buffer bake
apps/demo        # Vite playground
```

## Checks (must pass before a PR merges)

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Conventions

- `packages/core` stays runtime-light: `onnxruntime-web` for inference, hand-written WebGL2 for
  rendering. No `three`.
- The de-lighting math, light/color math and shadow params are **pure and unit-tested**. Add tests
  when you touch them.
- Keep the public API in `packages/core/src/types.ts` small and stable — treat it as a contract.
