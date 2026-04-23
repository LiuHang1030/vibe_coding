# AI Product Image Workflow — MVP Implementation Plan

**Related spec:** `docs/superpowers/specs/2026-04-22-ai-product-image-workflow-design.md` (committed as `03fbebc`)
**Plan date:** 2026-04-23

## Context

The user wants to build a local Electron desktop app that takes one raw e-commerce product photo and produces a finished marketing image: product extracted, placed in a new AI-generated scene, with English marketing copy overlaid. The full design was iterated through brainstorming and is captured in the spec above. A late architectural refinement made every pipeline stage pluggable via a `StageProvider` interface — no model is hardcoded in orchestration code.

This plan implements a **minimum viable end-to-end slice** that proves the pluggable architecture and produces a real output image from real APIs. Scope of this plan:

- Full project scaffold (Electron + Vite + TypeScript + React + Tailwind + shadcn/ui)
- Provider architecture: `StageProvider` contracts + `ProviderRegistry`
- One seeded provider per stage (5 providers total):
  - Extract: `imgly-bg-removal` (local ONNX)
  - Understand: `gemini-2.5-flash` (Vercel AI SDK)
  - Plan: `claude-sonnet-4-6` (Vercel AI SDK)
  - Compose: `nano-banana` (Google GenAI)
  - Overlay: `napi-canvas` (local)
- Pipeline orchestrator with stage-by-stage artifact persistence and progress events
- Runs directory storage + `metadata.json`
- API-key storage via Electron `safeStorage` + `electron-store`
- tRPC IPC between main and renderer
- Renderer: Home route (Dropzone + parameters + Generate + live pipeline progress + final image); basic Settings route (API-key entry)
- Unit tests for pure logic (schemas, registry, storage, orchestrator), provider tests with mocked SDKs, and one end-to-end smoke test with mocked providers

Explicitly **out of scope** (deferred to future plans — spec §14):
- Additional providers beyond the five seeded (Claude Haiku, GPT-5, Flux Kontext, Seedream, etc.)
- Runs history gallery + Replay UI
- Advanced Settings (drag-reorder fallback lists, per-provider health dashboard)
- Monthly budget dashboard + cost caps with modal
- Full first-run onboarding wizard
- Multi-candidate (N-best) compose mode
- electron-builder packaging / notarization
- Playwright E2E

## Architecture Decisions Locked In

1. **Package manager:** `pnpm`
2. **Build:** `electron-vite` (main + preload + renderer Vite builds)
3. **Language:** TypeScript, strict mode
4. **UI:** React 18 + Tailwind CSS + shadcn/ui (Radix primitives), React Router for routes
5. **State:** Zustand for renderer local state; tRPC for server state
6. **IPC:** `electron-trpc` with subscriptions for progress streaming
7. **LLM / VLM client:** Vercel AI SDK v4 (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/google`) with `generateObject` + Zod for structured output
8. **Image-edit client:** `@google/genai` for Nano Banana
9. **Background removal:** `@imgly/background-removal-node` (pure ONNX, CPU-only)
10. **Canvas text:** `@napi-rs/canvas`
11. **Testing:** Vitest + `msw` (for HTTP-mocked providers); `@testing-library/react` for renderer components; **no** Playwright in MVP
12. **Logging:** `pino` + `pino-pretty` (dev)

## File Structure

```
vibe_coding/
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── tsconfig.node.json
├── electron.vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── vitest.config.ts
├── .env.example
├── .eslintrc.cjs
├── resources/
│   ├── icon.png                         # placeholder
│   └── fonts/
│       ├── Inter-Regular.ttf            # bundled
│       └── Inter-Bold.ttf
├── layouts/
│   └── bottom-caption.json              # one seeded layout
├── src/
│   ├── main/
│   │   ├── index.ts                     # Electron entry, window creation
│   │   ├── schemas.ts                   # Zod schemas (shared types)
│   │   ├── pipeline/
│   │   │   ├── contracts.ts             # StageProvider<TIn, TOut>, per-stage specialisations
│   │   │   ├── orchestrator.ts          # sequential runner, emits progress
│   │   │   └── stage-runner.ts          # generic retry + fallback executor
│   │   ├── providers/
│   │   │   ├── registry.ts              # ProviderRegistry
│   │   │   ├── index.ts                 # registerAll() — imports every provider
│   │   │   ├── extract/
│   │   │   │   └── imgly-bg-removal.ts
│   │   │   ├── understand/
│   │   │   │   └── gemini-2-5-flash.ts
│   │   │   ├── plan/
│   │   │   │   └── claude-sonnet-4-6.ts
│   │   │   ├── compose/
│   │   │   │   └── nano-banana.ts
│   │   │   └── overlay/
│   │   │       ├── napi-canvas.ts
│   │   │       └── layout-engine.ts     # load template, decide text colour, wrap lines
│   │   ├── storage/
│   │   │   ├── runs-dir.ts              # create/list/resolve run directories
│   │   │   └── settings.ts              # safeStorage + electron-store wrapper
│   │   ├── ipc/
│   │   │   ├── trpc.ts                  # t.router / t.procedure factories
│   │   │   ├── context.ts               # createContext()
│   │   │   ├── app-router.ts            # merged appRouter
│   │   │   ├── pipeline.router.ts
│   │   │   ├── settings.router.ts
│   │   │   └── providers.router.ts
│   │   └── utils/
│   │       ├── image-io.ts              # load/save Buffer, resize via sharp
│   │       └── logger.ts                # pino instance
│   ├── preload/
│   │   └── index.ts                     # exposes ipcLink via contextBridge
│   └── renderer/
│       ├── index.html
│       ├── main.tsx
│       ├── App.tsx                      # router + providers
│       ├── trpc.ts                      # createTRPCReact<AppRouter>()
│       ├── routes/
│       │   ├── home.tsx
│       │   └── settings.tsx
│       ├── components/
│       │   ├── Dropzone.tsx
│       │   ├── StagePipeline.tsx
│       │   ├── ParamsPanel.tsx
│       │   └── ui/                      # shadcn/ui components (generated)
│       ├── hooks/
│       │   └── useRunStream.ts          # tRPC subscription wrapper
│       └── styles/
│           └── globals.css              # tailwind directives
├── tests/
│   ├── setup.ts
│   ├── fixtures/
│   │   └── sneaker.jpg                  # small public-domain test image (~200KB)
│   ├── schemas.test.ts
│   ├── registry.test.ts
│   ├── runs-dir.test.ts
│   ├── settings.test.ts
│   ├── stage-runner.test.ts
│   ├── orchestrator.test.ts
│   ├── providers/
│   │   ├── imgly-bg-removal.test.ts
│   │   ├── gemini-understand.test.ts
│   │   ├── claude-plan.test.ts
│   │   ├── nano-banana.test.ts
│   │   └── napi-canvas.test.ts
│   └── e2e-smoke.test.ts
└── runs/                                # .gitignored; Electron userData in production
```

## Prerequisites

- Node.js 20+ (`nvm use 20`)
- `pnpm` installed globally (`npm i -g pnpm`)
- A test image at `tests/fixtures/sneaker.jpg` — grab any public-domain sneaker photo (~800×800)
- For the final manual smoke run: a Google AI Studio API key (free tier works) and an Anthropic API key

---

## Task 1 — Repo Scaffold

**Files:** `package.json`, `tsconfig.json`, `tsconfig.node.json`, `electron.vite.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `vitest.config.ts`, `.gitignore` (append), `.env.example`, `.eslintrc.cjs`, `src/renderer/index.html`

- [ ] **Step 1.1 — Initialise package.json**

```bash
pnpm init
```

Edit `package.json` to:

```json
{
  "name": "vibe-product-studio",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "start": "electron-vite preview",
    "typecheck": "tsc --noEmit && tsc --noEmit -p tsconfig.node.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint . --ext .ts,.tsx"
  }
}
```

- [ ] **Step 1.2 — Install dependencies**

```bash
pnpm add electron-trpc @trpc/server @trpc/client @trpc/react-query @tanstack/react-query \
  zod pino pino-pretty electron-store \
  ai @ai-sdk/anthropic @ai-sdk/google @google/genai \
  @imgly/background-removal-node @napi-rs/canvas sharp \
  react react-dom react-router-dom zustand

pnpm add -D electron electron-vite vite @vitejs/plugin-react \
  typescript @types/node @types/react @types/react-dom \
  tailwindcss postcss autoprefixer \
  vitest @vitest/ui msw @testing-library/react @testing-library/jest-dom jsdom \
  eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-plugin-react
```

- [ ] **Step 1.3 — TypeScript configs**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": false,
    "baseUrl": ".",
    "paths": {
      "@main/*": ["src/main/*"],
      "@renderer/*": ["src/renderer/*"],
      "@shared/*": ["src/shared/*"]
    },
    "types": ["vite/client", "vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src/renderer/**/*", "tests/**/*"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "composite": true,
    "outDir": "out",
    "ignoreDeprecations": "6.0",
    "baseUrl": ".",
    "paths": {
      "@main/*": ["src/main/*"],
      "@renderer/*": ["src/renderer/*"],
      "@shared/*": ["src/shared/*"]
    }
  },
  "include": ["src/main/**/*", "src/preload/**/*", "electron.vite.config.ts"]
}
```

> **Note:** `composite: true` + the same `baseUrl`/`paths` as the root config are required. Without them, files inside `src/main/` that import via `@main/*` fail to resolve under the composite-project typecheck. `ignoreDeprecations: "6.0"` silences the TS 6 deprecation warning on `baseUrl`.

- [ ] **Step 1.4 — Electron-Vite config**

`electron.vite.config.ts`:
```ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@main': resolve('src/main') } },
    build: { outDir: 'out/main' }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { outDir: 'out/preload' }
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()],
    resolve: { alias: { '@renderer': resolve('src/renderer') } },
    build: { outDir: 'out/renderer', rollupOptions: { input: resolve('src/renderer/index.html') } }
  }
})
```

- [ ] **Step 1.5 — Tailwind + shadcn base**

`tailwind.config.ts`:
```ts
import type { Config } from 'tailwindcss'
export default {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: { extend: {} },
  plugins: []
} satisfies Config
```

`postcss.config.js`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } }
```

`src/renderer/styles/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root { color-scheme: dark; }
html, body, #root { height: 100%; margin: 0; background: #0a0a0a; color: #e5e5e5; font-family: system-ui, sans-serif; }
```

`src/renderer/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Product Studio</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 1.6 — Vitest config**

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    environmentMatchGlobs: [['tests/renderer/**', 'jsdom']]
  },
  resolve: {
    alias: {
      '@main': resolve('src/main'),
      '@renderer': resolve('src/renderer')
    }
  }
})
```

`tests/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 1.7 — Append to .gitignore**

Append:
```
node_modules/
out/
dist/
runs/
.env
.env.local
*.log
```

- [ ] **Step 1.8 — Verify**

```bash
pnpm typecheck
pnpm test --run --reporter=verbose
```

Expected: typecheck passes (even if no source yet); vitest reports "No tests found" (non-zero exit OK at this stage, treat as baseline).

- [ ] **Step 1.9 — Commit**

```bash
git add -A
git commit -m "chore: scaffold Electron + Vite + TS + Tailwind + Vitest"
```

---

## Task 2 — Zod Schemas

**Files:** create `src/main/schemas.ts`, `tests/schemas.test.ts`

- [ ] **Step 2.1 — Write failing test**

`tests/schemas.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import {
  ProductUnderstandingSchema,
  CreativePlanSchema,
  RunMetadataSchema,
  SizeSchema
} from '@main/schemas'

describe('schemas', () => {
  it('parses a valid ProductUnderstanding', () => {
    const parsed = ProductUnderstandingSchema.parse({
      category: 'sneaker',
      material: ['leather', 'rubber'],
      color_palette: ['white'],
      style_tone: 'minimalist',
      target_audience: 'young adults',
      key_features: ['lightweight', 'breathable']
    })
    expect(parsed.category).toBe('sneaker')
  })

  it('rejects CreativePlan missing headline', () => {
    expect(() =>
      CreativePlanSchema.parse({
        scene_prompt: 'beach',
        composition_hint: 'center',
        copy: { subhead: 'x', bullets: [] },
        overlay_layout: 'bottom_caption'
      })
    ).toThrow()
  })

  it('parses Size as "WxH" string', () => {
    expect(SizeSchema.parse('1080x1080')).toEqual({ width: 1080, height: 1080 })
  })

  it('parses Size as ratio "1:1" with default 1080 base', () => {
    expect(SizeSchema.parse('1:1')).toEqual({ width: 1080, height: 1080 })
  })

  it('RunMetadata round-trips', () => {
    const meta = {
      run_id: '2026-04-23T10-00-00_abc',
      input_path: '/tmp/a.jpg',
      size: '1:1',
      stages: [],
      total_cost_usd: 0,
      created_at: '2026-04-23T10:00:00.000Z'
    }
    expect(RunMetadataSchema.parse(meta)).toEqual(meta)
  })
})
```

- [ ] **Step 2.2 — Run, see it fail**

```bash
pnpm vitest run tests/schemas.test.ts
```
Expected: module-not-found for `@main/schemas`.

- [ ] **Step 2.3 — Implement `src/main/schemas.ts`**

```ts
import { z } from 'zod'

export const ProductUnderstandingSchema = z.object({
  category: z.string().min(1),
  material: z.array(z.string()),
  color_palette: z.array(z.string()),
  style_tone: z.string(),
  target_audience: z.string(),
  key_features: z.array(z.string())
})
export type ProductUnderstanding = z.infer<typeof ProductUnderstandingSchema>

export const OverlayLayoutSchema = z.enum([
  'top_banner', 'side_panel', 'bottom_caption', 'centered_hero'
])
export type OverlayLayout = z.infer<typeof OverlayLayoutSchema>

export const CopyBlockSchema = z.object({
  headline: z.string().min(1).max(64),
  subhead: z.string().min(1).max(128),
  bullets: z.array(z.string().max(64)).max(3),
  cta: z.string().max(32).optional()
})
export type CopyBlock = z.infer<typeof CopyBlockSchema>

export const CreativePlanSchema = z.object({
  scene_prompt: z.string().min(10),
  composition_hint: z.string(),
  copy: CopyBlockSchema,
  overlay_layout: OverlayLayoutSchema
})
export type CreativePlan = z.infer<typeof CreativePlanSchema>

export const SizeSchema = z.union([
  z.string().regex(/^\d+x\d+$/).transform(s => {
    const [w, h] = s.split('x').map(Number); return { width: w, height: h }
  }),
  z.string().regex(/^\d+:\d+$/).transform(s => {
    const [w, h] = s.split(':').map(Number); const base = 1080
    return { width: base, height: Math.round(base * h / w) }
  }),
  z.object({ width: z.number().int().positive(), height: z.number().int().positive() })
])
export type Size = { width: number; height: number }

export const StageNameSchema = z.enum(['extract', 'understand', 'plan', 'compose', 'overlay'])
export type StageName = z.infer<typeof StageNameSchema>

export const StageTimingSchema = z.object({
  stage: StageNameSchema,
  provider_id: z.string(),
  duration_ms: z.number(),
  cost_usd: z.number(),
  tokens_in: z.number().optional(),
  tokens_out: z.number().optional()
})

export const RunMetadataSchema = z.object({
  run_id: z.string(),
  input_path: z.string(),
  size: z.string(),
  stages: z.array(StageTimingSchema),
  total_cost_usd: z.number(),
  created_at: z.string()
})
export type RunMetadata = z.infer<typeof RunMetadataSchema>
```

- [ ] **Step 2.4 — Run tests, verify pass**

```bash
pnpm vitest run tests/schemas.test.ts
```
Expected: 5 passed.

- [ ] **Step 2.5 — Commit**

```bash
git add src/main/schemas.ts tests/schemas.test.ts
git commit -m "feat(schemas): add Zod contracts for understanding, plan, size, metadata"
```

---

## Task 3 — StageProvider Contracts

**Files:** create `src/main/pipeline/contracts.ts`

This is interface-only, no runtime tests needed (TypeScript compile is the test).

- [ ] **Step 3.1 — Write `contracts.ts`**

```ts
import type { StageName, ProductUnderstanding, CreativePlan, CopyBlock, Size, OverlayLayout } from '@main/schemas'

export interface RunContext {
  runId: string
  runDir: string
  logger: (msg: string, data?: Record<string, unknown>) => void
}

export interface CostModel {
  estimate(input: unknown): number
}

export interface ProviderHealth { ok: boolean; reason?: string }

export interface StageProvider<TIn, TOut> {
  readonly id: string
  readonly stage: StageName
  readonly displayName: string
  readonly requiresCredentials: string[]
  readonly costModel: CostModel
  healthCheck(getCredential: (key: string) => string | undefined): Promise<ProviderHealth>
  run(input: TIn, ctx: RunContext, getCredential: (key: string) => string | undefined): Promise<TOut>
}

// Per-stage IO
export interface ExtractInput { imagePath: string }
export interface ExtractOutput { cutoutPngPath: string }
export type ExtractProvider = StageProvider<ExtractInput, ExtractOutput>

export interface UnderstandInput { imagePath: string; cutoutPngPath: string }
export type UnderstandProvider = StageProvider<UnderstandInput, ProductUnderstanding>

export interface PlanInput {
  understanding: ProductUnderstanding
  size: Size
  stylePreference?: string
  layoutPreference?: OverlayLayout
  copyTone?: string
}
export type PlanProvider = StageProvider<PlanInput, CreativePlan>

export interface ComposeInput {
  originalImagePath: string
  scenePrompt: string
  size: Size
}
export interface ComposeOutput { composedPngPath: string }
export type ComposeProvider = StageProvider<ComposeInput, ComposeOutput>

export interface OverlayInput {
  composedPngPath: string
  copy: CopyBlock
  layout: OverlayLayout
  size: Size
}
export interface OverlayOutput { finalPngPath: string }
export type OverlayProvider = StageProvider<OverlayInput, OverlayOutput>
```

- [ ] **Step 3.2 — Typecheck passes**

```bash
pnpm typecheck
```
Expected: exits 0.

- [ ] **Step 3.3 — Commit**

```bash
git add src/main/pipeline/contracts.ts
git commit -m "feat(pipeline): add StageProvider interfaces per stage"
```

---

## Task 4 — ProviderRegistry

**Files:** create `src/main/providers/registry.ts`, `tests/registry.test.ts`

- [ ] **Step 4.1 — Test**

`tests/registry.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { ProviderRegistry } from '@main/providers/registry'
import type { StageProvider } from '@main/pipeline/contracts'

function fakeProvider(stage: any, id: string): StageProvider<any, any> {
  return {
    id, stage, displayName: id, requiresCredentials: [],
    costModel: { estimate: () => 0 },
    async healthCheck() { return { ok: true } },
    async run() { return {} }
  }
}

describe('ProviderRegistry', () => {
  let reg: ProviderRegistry
  beforeEach(() => { reg = new ProviderRegistry() })

  it('registers and retrieves a provider', () => {
    reg.register(fakeProvider('extract', 'a'))
    expect(reg.get('extract', 'a').id).toBe('a')
  })

  it('throws on duplicate id within the same stage', () => {
    reg.register(fakeProvider('extract', 'a'))
    expect(() => reg.register(fakeProvider('extract', 'a'))).toThrow(/duplicate/i)
  })

  it('allows same id across different stages', () => {
    reg.register(fakeProvider('extract', 'a'))
    reg.register(fakeProvider('plan', 'a'))
    expect(reg.get('plan', 'a').id).toBe('a')
  })

  it('lists by stage', () => {
    reg.register(fakeProvider('plan', 'p1'))
    reg.register(fakeProvider('plan', 'p2'))
    reg.register(fakeProvider('compose', 'c1'))
    expect(reg.listByStage('plan').map(p => p.id).sort()).toEqual(['p1', 'p2'])
  })

  it('resolves ordered list, picking first available', () => {
    reg.register(fakeProvider('plan', 'p1'))
    reg.register(fakeProvider('plan', 'p2'))
    expect(reg.resolveOrdered('plan', ['missing', 'p2', 'p1']).map(p => p.id)).toEqual(['p2', 'p1'])
  })
})
```

- [ ] **Step 4.2 — Run, expect fail**

```bash
pnpm vitest run tests/registry.test.ts
```

- [ ] **Step 4.3 — Implement**

`src/main/providers/registry.ts`:
```ts
import type { StageProvider } from '@main/pipeline/contracts'
import type { StageName } from '@main/schemas'

export class ProviderRegistry {
  private byStage = new Map<StageName, Map<string, StageProvider<any, any>>>()

  register(provider: StageProvider<any, any>): void {
    const stage = provider.stage
    if (!this.byStage.has(stage)) this.byStage.set(stage, new Map())
    const bucket = this.byStage.get(stage)!
    if (bucket.has(provider.id)) {
      throw new Error(`duplicate provider id "${provider.id}" for stage "${stage}"`)
    }
    bucket.set(provider.id, provider)
  }

  get(stage: StageName, id: string): StageProvider<any, any> {
    const p = this.byStage.get(stage)?.get(id)
    if (!p) throw new Error(`provider "${id}" not registered for stage "${stage}"`)
    return p
  }

  has(stage: StageName, id: string): boolean {
    return !!this.byStage.get(stage)?.has(id)
  }

  listByStage(stage: StageName): StageProvider<any, any>[] {
    return Array.from(this.byStage.get(stage)?.values() ?? [])
  }

  resolveOrdered(stage: StageName, ids: string[]): StageProvider<any, any>[] {
    return ids.filter(id => this.has(stage, id)).map(id => this.get(stage, id))
  }
}

// singleton, populated by providers/index.ts#registerAll()
export const registry = new ProviderRegistry()
```

- [ ] **Step 4.4 — Run, pass, commit**

```bash
pnpm vitest run tests/registry.test.ts
git add src/main/providers/registry.ts tests/registry.test.ts
git commit -m "feat(providers): add ProviderRegistry with stage-scoped IDs"
```

---

## Task 5 — Overlay Provider (napi-canvas) + Layout Engine

**Files:** create `src/main/providers/overlay/layout-engine.ts`, `src/main/providers/overlay/napi-canvas.ts`, `layouts/bottom-caption.json`, `tests/providers/napi-canvas.test.ts`; copy `Inter-Regular.ttf` and `Inter-Bold.ttf` into `resources/fonts/`.

- [ ] **Step 5.1 — Download Inter fonts into `resources/fonts/`**

Grab `Inter-Regular.ttf` and `Inter-Bold.ttf` from the Inter GitHub release. Commit both (they're OFL-licensed).

- [ ] **Step 5.2 — Layout template**

`layouts/bottom-caption.json`:
```json
{
  "id": "bottom_caption",
  "safe_area_pct": { "top": 0.6, "left": 0.08, "right": 0.08, "bottom": 0.08 },
  "headline": { "font": "Inter-Bold", "size_pct": 0.055, "align": "left" },
  "subhead":  { "font": "Inter-Regular", "size_pct": 0.028, "align": "left", "margin_top_pct": 0.012 },
  "bullets":  { "font": "Inter-Regular", "size_pct": 0.022, "align": "left", "gap_pct": 0.008 },
  "cta":      { "font": "Inter-Bold", "size_pct": 0.024, "align": "left", "margin_top_pct": 0.02,
                 "background_box": { "padding_pct": 0.01 } },
  "text_color_rule": "auto_contrast_against_bg",
  "shadow": { "blur": 12, "color": "rgba(0,0,0,0.35)", "offset_y": 2 }
}
```

- [ ] **Step 5.3 — Test**

`tests/providers/napi-canvas.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCanvas } from '@napi-rs/canvas'
import { napiCanvasOverlay } from '@main/providers/overlay/napi-canvas'

let inputPng: string
let workDir: string

beforeAll(async () => {
  workDir = await fs.mkdtemp(join(tmpdir(), 'ps-overlay-'))
  const c = createCanvas(1080, 1080); const g = c.getContext('2d')
  g.fillStyle = '#4a6a8a'; g.fillRect(0, 0, 1080, 1080)
  inputPng = join(workDir, 'in.png'); await fs.writeFile(inputPng, c.toBuffer('image/png'))
})

describe('napi-canvas overlay provider', () => {
  it('metadata is wired correctly', () => {
    expect(napiCanvasOverlay.id).toBe('napi-canvas')
    expect(napiCanvasOverlay.stage).toBe('overlay')
    expect(napiCanvasOverlay.requiresCredentials).toEqual([])
  })

  it('renders text and writes PNG to runDir', async () => {
    const out = await napiCanvasOverlay.run(
      {
        composedPngPath: inputPng,
        copy: { headline: 'Step Into Comfort', subhead: 'Everyday reimagined', bullets: ['Lightweight', 'Breathable'], cta: 'Shop Now' },
        layout: 'bottom_caption',
        size: { width: 1080, height: 1080 }
      },
      { runId: 't', runDir: workDir, logger: () => {} },
      () => undefined
    )
    const bytes = await fs.readFile(out.finalPngPath)
    expect(bytes.byteLength).toBeGreaterThan(1000)
    expect(out.finalPngPath).toContain('05_final.png')
  })
})
```

- [ ] **Step 5.4 — Implement layout engine**

`src/main/providers/overlay/layout-engine.ts`:
```ts
import { promises as fs } from 'node:fs'
import { resolve } from 'node:path'
import type { OverlayLayout } from '@main/schemas'

export interface LayoutTemplate {
  id: OverlayLayout
  safe_area_pct: { top: number; left: number; right: number; bottom: number }
  headline: { font: string; size_pct: number; align: 'left' | 'center' | 'right' }
  subhead:  { font: string; size_pct: number; align: 'left' | 'center' | 'right'; margin_top_pct: number }
  bullets:  { font: string; size_pct: number; align: 'left' | 'center' | 'right'; gap_pct: number }
  cta?:     { font: string; size_pct: number; align: 'left' | 'center' | 'right'; margin_top_pct: number; background_box?: { padding_pct: number } }
  text_color_rule: 'auto_contrast_against_bg' | 'always_white' | 'always_black'
  shadow?: { blur: number; color: string; offset_y: number }
}

export async function loadLayout(id: OverlayLayout): Promise<LayoutTemplate> {
  const path = resolve(process.cwd(), 'layouts', `${id.replace(/_/g, '-')}.json`)
  const raw = await fs.readFile(path, 'utf8')
  return JSON.parse(raw) as LayoutTemplate
}

// Sample a 64x64 region at the layout's anchor and decide light/dark text
export function autoContrastColor(avgLuminance: number): string {
  return avgLuminance > 0.5 ? '#101010' : '#ffffff'
}

export function wrapLines(ctx: { measureText(s: string): { width: number } }, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const tryLine = line ? `${line} ${w}` : w
    if (ctx.measureText(tryLine).width > maxWidth && line) { lines.push(line); line = w } else line = tryLine
  }
  if (line) lines.push(line)
  return lines
}
```

- [ ] **Step 5.5 — Implement napi-canvas provider**

`src/main/providers/overlay/napi-canvas.ts`:
```ts
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas'
import type { OverlayProvider } from '@main/pipeline/contracts'
import { loadLayout, autoContrastColor, wrapLines } from './layout-engine'

let fontsRegistered = false
function ensureFonts() {
  if (fontsRegistered) return
  const base = resolve(process.cwd(), 'resources', 'fonts')
  GlobalFonts.registerFromPath(join(base, 'Inter-Regular.ttf'), 'Inter-Regular')
  GlobalFonts.registerFromPath(join(base, 'Inter-Bold.ttf'), 'Inter-Bold')
  fontsRegistered = true
}

export const napiCanvasOverlay: OverlayProvider = {
  id: 'napi-canvas',
  stage: 'overlay',
  displayName: 'Built-in Canvas',
  requiresCredentials: [],
  costModel: { estimate: () => 0 },
  async healthCheck() { return { ok: true } },

  async run(input, ctx) {
    ensureFonts()
    const tpl = await loadLayout(input.layout)
    const src = await loadImage(input.composedPngPath)
    const canvas = createCanvas(input.size.width, input.size.height)
    const g = canvas.getContext('2d')
    g.drawImage(src, 0, 0, input.size.width, input.size.height)

    const { width: W, height: H } = input.size
    const safeX = W * tpl.safe_area_pct.left
    const safeRight = W * (1 - tpl.safe_area_pct.right)
    const safeTop = H * tpl.safe_area_pct.top
    const maxWidth = safeRight - safeX

    // sample bg luminance in the safe area
    const sample = g.getImageData(Math.round(safeX), Math.round(safeTop), Math.min(64, Math.round(maxWidth)), 64).data
    let lumSum = 0, n = 0
    for (let i = 0; i < sample.length; i += 4) { lumSum += (0.2126 * sample[i] + 0.7152 * sample[i+1] + 0.0722 * sample[i+2]) / 255; n++ }
    const textColor = tpl.text_color_rule === 'always_white' ? '#fff'
      : tpl.text_color_rule === 'always_black' ? '#000'
      : autoContrastColor(lumSum / n)

    if (tpl.shadow) { g.shadowBlur = tpl.shadow.blur; g.shadowColor = tpl.shadow.color; g.shadowOffsetY = tpl.shadow.offset_y }
    g.fillStyle = textColor
    g.textBaseline = 'top'

    let y = safeTop
    // headline
    g.font = `${Math.round(H * tpl.headline.size_pct)}px ${tpl.headline.font}`
    const headLines = wrapLines(g, input.copy.headline, maxWidth)
    const headSize = Math.round(H * tpl.headline.size_pct)
    for (const line of headLines) { g.fillText(line, safeX, y); y += headSize * 1.1 }

    // subhead
    y += H * tpl.subhead.margin_top_pct
    g.font = `${Math.round(H * tpl.subhead.size_pct)}px ${tpl.subhead.font}`
    const subSize = Math.round(H * tpl.subhead.size_pct)
    for (const line of wrapLines(g, input.copy.subhead, maxWidth)) { g.fillText(line, safeX, y); y += subSize * 1.15 }

    // bullets
    g.font = `${Math.round(H * tpl.bullets.size_pct)}px ${tpl.bullets.font}`
    const bulletSize = Math.round(H * tpl.bullets.size_pct)
    for (const b of input.copy.bullets ?? []) {
      y += H * tpl.bullets.gap_pct
      g.fillText(`•  ${b}`, safeX, y); y += bulletSize * 1.15
    }

    // cta
    if (input.copy.cta && tpl.cta) {
      y += H * tpl.cta.margin_top_pct
      g.font = `${Math.round(H * tpl.cta.size_pct)}px ${tpl.cta.font}`
      g.fillText(input.copy.cta, safeX, y)
    }

    const finalPngPath = join(ctx.runDir, '05_final.png')
    await fs.writeFile(finalPngPath, canvas.toBuffer('image/png'))
    return { finalPngPath }
  }
}
```

- [ ] **Step 5.6 — Run tests, fix, commit**

```bash
pnpm vitest run tests/providers/napi-canvas.test.ts
git add src/main/providers/overlay layouts/bottom-caption.json resources/fonts tests/providers/napi-canvas.test.ts
git commit -m "feat(overlay): napi-canvas provider + bottom-caption layout"
```

---

## Task 6 — Extract Provider (`imgly-bg-removal`)

**Files:** `src/main/providers/extract/imgly-bg-removal.ts`, `tests/providers/imgly-bg-removal.test.ts`

- [ ] **Step 6.1 — Test (mocked)**

```ts
// tests/providers/imgly-bg-removal.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('@imgly/background-removal-node', () => ({
  removeBackground: vi.fn(async () => new Blob([new Uint8Array([137,80,78,71])], { type: 'image/png' }))
}))

import { imglyBgRemoval } from '@main/providers/extract/imgly-bg-removal'

describe('imgly-bg-removal provider', () => {
  let workDir: string
  beforeEach(async () => { workDir = await fs.mkdtemp(join(tmpdir(), 'ps-extract-')) })

  it('is correctly wired', () => {
    expect(imglyBgRemoval.stage).toBe('extract')
    expect(imglyBgRemoval.id).toBe('imgly-bg-removal')
  })

  it('writes cutout PNG to runDir', async () => {
    const input = join(workDir, 'src.png'); await fs.writeFile(input, Buffer.from([1, 2, 3]))
    const out = await imglyBgRemoval.run({ imagePath: input }, { runId: 't', runDir: workDir, logger: () => {} }, () => undefined)
    expect(out.cutoutPngPath.endsWith('01_cutout.png')).toBe(true)
    const bytes = await fs.readFile(out.cutoutPngPath)
    expect(bytes.byteLength).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 6.2 — Implement**

```ts
// src/main/providers/extract/imgly-bg-removal.ts
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { removeBackground } from '@imgly/background-removal-node'
import type { ExtractProvider } from '@main/pipeline/contracts'

export const imglyBgRemoval: ExtractProvider = {
  id: 'imgly-bg-removal',
  stage: 'extract',
  displayName: 'img.ly Background Removal (local)',
  requiresCredentials: [],
  costModel: { estimate: () => 0 },
  async healthCheck() { return { ok: true } },

  async run(input, ctx) {
    const src = await fs.readFile(input.imagePath)
    const blob = await removeBackground(new Blob([src]))
    const buf = Buffer.from(await blob.arrayBuffer())
    const cutoutPngPath = join(ctx.runDir, '01_cutout.png')
    await fs.writeFile(cutoutPngPath, buf)
    ctx.logger('extract.done', { bytes: buf.byteLength })
    return { cutoutPngPath }
  }
}
```

- [ ] **Step 6.3 — Run, pass, commit**

```bash
pnpm vitest run tests/providers/imgly-bg-removal.test.ts
git add src/main/providers/extract tests/providers/imgly-bg-removal.test.ts
git commit -m "feat(extract): imgly-bg-removal provider"
```

---

## Task 7 — Understand Provider (`gemini-2.5-flash`)

**Files:** `src/main/providers/understand/gemini-2-5-flash.ts`, `tests/providers/gemini-understand.test.ts`

- [ ] **Step 7.1 — Test**

```ts
// tests/providers/gemini-understand.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const mockResult = {
  object: {
    category: 'sneaker', material: ['leather'], color_palette: ['off-white'],
    style_tone: 'minimalist', target_audience: 'young adults', key_features: ['breathable']
  },
  usage: { promptTokens: 120, completionTokens: 60 }
}

vi.mock('ai', () => ({ generateObject: vi.fn(async () => mockResult) }))
vi.mock('@ai-sdk/google', () => ({ google: () => 'MOCK_MODEL' }))

import { geminiUnderstand } from '@main/providers/understand/gemini-2-5-flash'

describe('gemini understand provider', () => {
  let workDir: string
  beforeEach(async () => { workDir = await fs.mkdtemp(join(tmpdir(), 'ps-understand-')) })

  it('fails healthCheck without credential', async () => {
    expect((await geminiUnderstand.healthCheck(() => undefined)).ok).toBe(false)
  })

  it('returns structured understanding', async () => {
    const img = join(workDir, 'in.png'); await fs.writeFile(img, Buffer.from([0]))
    const out = await geminiUnderstand.run(
      { imagePath: img, cutoutPngPath: img },
      { runId: 't', runDir: workDir, logger: () => {} },
      () => 'fake-key'
    )
    expect(out.category).toBe('sneaker')
  })
})
```

- [ ] **Step 7.2 — Implement**

```ts
// src/main/providers/understand/gemini-2-5-flash.ts
import { promises as fs } from 'node:fs'
import { generateObject } from 'ai'
import { google } from '@ai-sdk/google'
import type { UnderstandProvider } from '@main/pipeline/contracts'
import { ProductUnderstandingSchema } from '@main/schemas'

const PROMPT = `You analyse e-commerce product photos. Look at the attached image and fill the JSON schema:
- category: short lowercase noun (e.g. "sneaker", "moisturiser").
- material: list of materials visible.
- color_palette: 1-3 dominant colours.
- style_tone: one of minimalist/sporty/luxurious/playful/industrial/warm.
- target_audience: one short phrase.
- key_features: 3-5 selling points inferable from the image.
Be terse.`

export const geminiUnderstand: UnderstandProvider = {
  id: 'gemini-2.5-flash',
  stage: 'understand',
  displayName: 'Google Gemini 2.5 Flash',
  requiresCredentials: ['GOOGLE_API_KEY'],
  costModel: { estimate: () => 0.001 },

  async healthCheck(getCred) {
    if (!getCred('GOOGLE_API_KEY')) return { ok: false, reason: 'GOOGLE_API_KEY not set' }
    return { ok: true }
  },

  async run(input, ctx, getCred) {
    const key = getCred('GOOGLE_API_KEY')
    if (!key) throw new Error('GOOGLE_API_KEY missing')
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = key
    const image = await fs.readFile(input.imagePath)
    const { object, usage } = await generateObject({
      model: google('gemini-2.5-flash'),
      schema: ProductUnderstandingSchema,
      messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image', image }] }]
    })
    ctx.logger('understand.done', { tokensIn: usage?.promptTokens, tokensOut: usage?.completionTokens })
    return object
  }
}
```

- [ ] **Step 7.3 — Pass + commit**

```bash
pnpm vitest run tests/providers/gemini-understand.test.ts
git add src/main/providers/understand tests/providers/gemini-understand.test.ts
git commit -m "feat(understand): Gemini 2.5 Flash provider via Vercel AI SDK"
```

---

## Task 8 — Plan Provider (`claude-sonnet-4-6`)

**Files:** `src/main/providers/plan/claude-sonnet-4-6.ts`, `tests/providers/claude-plan.test.ts`

- [ ] **Step 8.1 — Test**

```ts
// tests/providers/claude-plan.test.ts
import { describe, it, expect, vi } from 'vitest'

const fakePlan = {
  scene_prompt: 'warm wooden surface with soft morning light',
  composition_hint: 'centered product, slight tilt',
  copy: { headline: 'Step Into Comfort', subhead: 'Everyday sneakers reimagined', bullets: ['Lightweight', 'Breathable'], cta: 'Shop Now' },
  overlay_layout: 'bottom_caption'
}

vi.mock('ai', () => ({ generateObject: vi.fn(async () => ({ object: fakePlan, usage: { promptTokens: 400, completionTokens: 120 } })) }))
vi.mock('@ai-sdk/anthropic', () => ({ anthropic: () => 'MOCK_MODEL' }))

import { claudeSonnetPlan } from '@main/providers/plan/claude-sonnet-4-6'

describe('claude plan provider', () => {
  it('health requires ANTHROPIC_API_KEY', async () => {
    expect((await claudeSonnetPlan.healthCheck(() => undefined)).ok).toBe(false)
  })
  it('produces a CreativePlan', async () => {
    const out = await claudeSonnetPlan.run(
      {
        understanding: { category: 'sneaker', material: [], color_palette: [], style_tone: 'minimalist', target_audience: '', key_features: [] },
        size: { width: 1080, height: 1080 }
      },
      { runId: 't', runDir: '/tmp', logger: () => {} },
      () => 'fake-key'
    )
    expect(out.copy.headline).toBe('Step Into Comfort')
  })
})
```

- [ ] **Step 8.2 — Implement**

```ts
// src/main/providers/plan/claude-sonnet-4-6.ts
import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import type { PlanProvider } from '@main/pipeline/contracts'
import { CreativePlanSchema } from '@main/schemas'

const SYSTEM = `You are a senior e-commerce creative director. Given a structured product understanding, you produce:
1) scene_prompt: a natural-language description of a tasteful scene for the product, <= 60 words, English, purely visual (no text overlays mentioned).
2) composition_hint: one sentence on product placement.
3) copy: short English marketing copy — headline (<= 6 words, punchy), subhead (<= 12 words), 2-3 bullet points (<= 6 words each), a CTA (<= 3 words).
4) overlay_layout: one of "top_banner" | "side_panel" | "bottom_caption" | "centered_hero".
Tone should match style_tone. Avoid clichés. Output JSON only.`

export const claudeSonnetPlan: PlanProvider = {
  id: 'claude-sonnet-4-6',
  stage: 'plan',
  displayName: 'Claude Sonnet 4.6',
  requiresCredentials: ['ANTHROPIC_API_KEY'],
  costModel: { estimate: () => 0.01 },

  async healthCheck(getCred) {
    return getCred('ANTHROPIC_API_KEY') ? { ok: true } : { ok: false, reason: 'ANTHROPIC_API_KEY not set' }
  },

  async run(input, ctx, getCred) {
    const key = getCred('ANTHROPIC_API_KEY')
    if (!key) throw new Error('ANTHROPIC_API_KEY missing')
    process.env.ANTHROPIC_API_KEY = key
    const userMsg = JSON.stringify({
      understanding: input.understanding,
      size: input.size,
      stylePreference: input.stylePreference,
      layoutPreference: input.layoutPreference,
      copyTone: input.copyTone
    })
    const { object, usage } = await generateObject({
      model: anthropic('claude-sonnet-4-6'),
      schema: CreativePlanSchema,
      system: SYSTEM,
      prompt: userMsg
    })
    ctx.logger('plan.done', { tokensIn: usage?.promptTokens, tokensOut: usage?.completionTokens })
    return object
  }
}
```

- [ ] **Step 8.3 — Pass + commit**

```bash
pnpm vitest run tests/providers/claude-plan.test.ts
git add src/main/providers/plan tests/providers/claude-plan.test.ts
git commit -m "feat(plan): Claude Sonnet 4.6 provider"
```

---

## Task 9 — Compose Provider (`nano-banana`)

**Files:** `src/main/providers/compose/nano-banana.ts`, `tests/providers/nano-banana.test.ts`

> The `@google/genai` image-generation API returns base64 inline parts; provider extracts and writes to disk.

- [ ] **Step 9.1 — Test**

```ts
// tests/providers/nano-banana.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const fakeResponse = { candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from([0,1,2,3]).toString('base64'), mimeType: 'image/png' } }] } }] }
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({ models: { generateContent: vi.fn(async () => fakeResponse) } }))
}))

import { nanoBanana } from '@main/providers/compose/nano-banana'

describe('nano-banana compose provider', () => {
  let workDir: string
  beforeEach(async () => { workDir = await fs.mkdtemp(join(tmpdir(), 'ps-compose-')) })

  it('wires metadata', () => { expect(nanoBanana.id).toBe('nano-banana') })

  it('writes composed PNG from inline base64 response', async () => {
    const input = join(workDir, 'src.png'); await fs.writeFile(input, Buffer.from([9]))
    const out = await nanoBanana.run(
      { originalImagePath: input, scenePrompt: 'a beach', size: { width: 1080, height: 1080 } },
      { runId: 't', runDir: workDir, logger: () => {} },
      () => 'fake-key'
    )
    expect(out.composedPngPath.endsWith('04_composed.png')).toBe(true)
    expect((await fs.readFile(out.composedPngPath)).byteLength).toBe(4)
  })
})
```

- [ ] **Step 9.2 — Implement**

```ts
// src/main/providers/compose/nano-banana.ts
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { GoogleGenAI } from '@google/genai'
import type { ComposeProvider } from '@main/pipeline/contracts'

function aspectRatioFromSize(s: { width: number; height: number }): string {
  const g = gcd(s.width, s.height); return `${s.width / g}:${s.height / g}`
}
function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b) }

export const nanoBanana: ComposeProvider = {
  id: 'nano-banana',
  stage: 'compose',
  displayName: 'Gemini 2.5 Flash Image (Nano Banana)',
  requiresCredentials: ['GOOGLE_API_KEY'],
  costModel: { estimate: () => 0.04 },

  async healthCheck(getCred) {
    return getCred('GOOGLE_API_KEY') ? { ok: true } : { ok: false, reason: 'GOOGLE_API_KEY not set' }
  },

  async run(input, ctx, getCred) {
    const key = getCred('GOOGLE_API_KEY')
    if (!key) throw new Error('GOOGLE_API_KEY missing')
    const client = new GoogleGenAI({ apiKey: key })

    const imgBytes = await fs.readFile(input.originalImagePath)
    const prompt = `Place the product from the reference image into this new scene: ${input.scenePrompt}.
Preserve the product's identity, proportions, and material details exactly. Match lighting and shadows to the new scene.
Target aspect ratio: ${aspectRatioFromSize(input.size)}.`

    const resp = await client.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [{ parts: [
        { text: prompt },
        { inlineData: { mimeType: 'image/png', data: imgBytes.toString('base64') } }
      ]}],
      config: { responseModalities: ['IMAGE'] }
    })

    const part = resp.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)
    if (!part?.inlineData?.data) throw new Error('nano-banana returned no image')
    const composedPngPath = join(ctx.runDir, '04_composed.png')
    await fs.writeFile(composedPngPath, Buffer.from(part.inlineData.data, 'base64'))
    ctx.logger('compose.done')
    return { composedPngPath }
  }
}
```

- [ ] **Step 9.3 — Pass + commit**

```bash
pnpm vitest run tests/providers/nano-banana.test.ts
git add src/main/providers/compose tests/providers/nano-banana.test.ts
git commit -m "feat(compose): Nano Banana (Gemini 2.5 Flash Image) provider"
```

---

## Task 10 — Provider Bootstrap

**File:** `src/main/providers/index.ts`

- [ ] **Step 10.1 — Write**

```ts
import { registry } from './registry'
import { imglyBgRemoval } from './extract/imgly-bg-removal'
import { geminiUnderstand } from './understand/gemini-2-5-flash'
import { claudeSonnetPlan } from './plan/claude-sonnet-4-6'
import { nanoBanana } from './compose/nano-banana'
import { napiCanvasOverlay } from './overlay/napi-canvas'

let booted = false
export function registerAll(): void {
  if (booted) return
  registry.register(imglyBgRemoval)
  registry.register(geminiUnderstand)
  registry.register(claudeSonnetPlan)
  registry.register(nanoBanana)
  registry.register(napiCanvasOverlay)
  booted = true
}

export { registry }
```

- [ ] **Step 10.2 — Smoke test (add to tests/registry.test.ts)**

Append:
```ts
import { ProviderRegistry } from '@main/providers/registry'
import { registerAll, registry } from '@main/providers'

it('registerAll populates one provider per stage', () => {
  registerAll()
  for (const stage of ['extract','understand','plan','compose','overlay'] as const) {
    expect(registry.listByStage(stage).length).toBeGreaterThanOrEqual(1)
  }
})
```

- [ ] **Step 10.3 — Pass + commit**

```bash
pnpm vitest run tests/registry.test.ts
git add src/main/providers/index.ts tests/registry.test.ts
git commit -m "feat(providers): registerAll() bootstraps the 5 seeded providers"
```

---

## Task 11 — Runs Directory Storage

**Files:** `src/main/storage/runs-dir.ts`, `tests/runs-dir.test.ts`

- [ ] **Step 11.1 — Test**

```ts
import { describe, it, expect } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRun, writeMetadata, readMetadata } from '@main/storage/runs-dir'

describe('runs-dir', () => {
  it('createRun makes a timestamped folder and returns runId+runDir', async () => {
    const baseDir = await fs.mkdtemp(join(tmpdir(), 'ps-runs-'))
    const { runId, runDir } = await createRun(baseDir, '/tmp/a.jpg', 'sneaker')
    expect(runId).toMatch(/\d{4}-\d{2}-\d{2}T/)
    expect(runId).toContain('_sneaker')
    const stat = await fs.stat(runDir); expect(stat.isDirectory()).toBe(true)
  })

  it('writeMetadata + readMetadata round-trip', async () => {
    const baseDir = await fs.mkdtemp(join(tmpdir(), 'ps-runs-'))
    const { runDir } = await createRun(baseDir, '/tmp/a.jpg', 'sneaker')
    const meta = { run_id: 'x', input_path: '/tmp/a.jpg', size: '1:1', stages: [], total_cost_usd: 0, created_at: new Date().toISOString() }
    await writeMetadata(runDir, meta)
    expect((await readMetadata(runDir)).run_id).toBe('x')
  })
})
```

- [ ] **Step 11.2 — Implement**

```ts
// src/main/storage/runs-dir.ts
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { RunMetadata } from '@main/schemas'
import { RunMetadataSchema } from '@main/schemas'

export async function createRun(baseDir: string, inputPath: string, slug: string): Promise<{ runId: string; runDir: string }> {
  const safeSlug = slug.replace(/[^a-z0-9_-]/gi, '_').slice(0, 40) || 'run'
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}_${safeSlug}`
  const runDir = join(baseDir, runId)
  await fs.mkdir(runDir, { recursive: true })
  await fs.copyFile(inputPath, join(runDir, '00_input' + (inputPath.match(/\.\w+$/)?.[0] ?? '.bin')))
  return { runId, runDir }
}

export async function writeMetadata(runDir: string, meta: RunMetadata): Promise<void> {
  await fs.writeFile(join(runDir, 'metadata.json'), JSON.stringify(meta, null, 2))
}

export async function readMetadata(runDir: string): Promise<RunMetadata> {
  const raw = JSON.parse(await fs.readFile(join(runDir, 'metadata.json'), 'utf8'))
  return RunMetadataSchema.parse(raw)
}
```

- [ ] **Step 11.3 — Pass + commit**

```bash
pnpm vitest run tests/runs-dir.test.ts
git add src/main/storage/runs-dir.ts tests/runs-dir.test.ts
git commit -m "feat(storage): runs directory creation + metadata read/write"
```

---

## Task 12 — Settings Storage (safeStorage + electron-store)

**Files:** `src/main/storage/settings.ts`, `tests/settings.test.ts`

> In tests we mock `electron` so the code can run outside Electron.

- [ ] **Step 12.1 — Test**

```ts
// tests/settings.test.ts
import { describe, it, expect, vi } from 'vitest'

const memKV: Record<string, any> = {}
vi.mock('electron-store', () => ({
  default: vi.fn().mockImplementation(() => ({
    get: (k: string) => memKV[k],
    set: (k: string, v: any) => { memKV[k] = v },
    delete: (k: string) => { delete memKV[k] }
  }))
}))
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(`enc:${s}`),
    decryptString: (b: Buffer) => b.toString().replace(/^enc:/, '')
  },
  app: { getPath: () => '/tmp' }
}))

import { Settings } from '@main/storage/settings'

describe('Settings', () => {
  it('round-trips an encrypted secret', () => {
    const s = new Settings()
    s.setCredential('GOOGLE_API_KEY', 'abc-123')
    expect(s.getCredential('GOOGLE_API_KEY')).toBe('abc-123')
  })

  it('returns undefined for missing keys', () => {
    expect(new Settings().getCredential('NONEXISTENT')).toBeUndefined()
  })

  it('persists primary provider per stage', () => {
    const s = new Settings()
    s.setPrimaryProvider('compose', 'nano-banana')
    expect(s.getPrimaryProvider('compose')).toBe('nano-banana')
  })
})
```

- [ ] **Step 12.2 — Implement**

```ts
// src/main/storage/settings.ts
import Store from 'electron-store'
import { safeStorage } from 'electron'
import type { StageName } from '@main/schemas'

type SettingsShape = {
  credentials?: Record<string, string>   // base64-encoded ciphertext
  primary?: Partial<Record<StageName, string>>
  fallbacks?: Partial<Record<StageName, string[]>>
  budgetUsdMonth?: number
}

export class Settings {
  private store = new Store<SettingsShape>({ name: 'settings', clearInvalidConfig: true })

  setCredential(key: string, value: string): void {
    const creds = { ...(this.store.get('credentials') ?? {}) }
    if (safeStorage.isEncryptionAvailable()) {
      creds[key] = safeStorage.encryptString(value).toString('base64')
    } else {
      creds[key] = Buffer.from(value).toString('base64')
    }
    this.store.set('credentials', creds)
  }

  getCredential(key: string): string | undefined {
    const entry = (this.store.get('credentials') ?? {})[key]
    if (!entry) return undefined
    const buf = Buffer.from(entry, 'base64')
    try {
      return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString()
    } catch { return undefined }
  }

  deleteCredential(key: string): void {
    const creds = { ...(this.store.get('credentials') ?? {}) }; delete creds[key]
    this.store.set('credentials', creds)
  }

  setPrimaryProvider(stage: StageName, id: string): void {
    const primary = { ...(this.store.get('primary') ?? {}) }; primary[stage] = id
    this.store.set('primary', primary)
  }

  getPrimaryProvider(stage: StageName): string | undefined {
    return (this.store.get('primary') ?? {})[stage]
  }

  setFallbacks(stage: StageName, ids: string[]): void {
    const fb = { ...(this.store.get('fallbacks') ?? {}) }; fb[stage] = ids
    this.store.set('fallbacks', fb)
  }

  getFallbacks(stage: StageName): string[] {
    return (this.store.get('fallbacks') ?? {})[stage] ?? []
  }

  getOrderedProviders(stage: StageName): string[] {
    const primary = this.getPrimaryProvider(stage)
    const fb = this.getFallbacks(stage)
    return primary ? [primary, ...fb.filter(x => x !== primary)] : fb
  }
}

export const settings = new Settings()
```

- [ ] **Step 12.3 — Pass + commit**

```bash
pnpm vitest run tests/settings.test.ts
git add src/main/storage/settings.ts tests/settings.test.ts
git commit -m "feat(storage): Settings wrapper with safeStorage-encrypted credentials"
```

---

## Task 13 — Stage Runner (retry + fallback)

**Files:** `src/main/pipeline/stage-runner.ts`, `tests/stage-runner.test.ts`

- [ ] **Step 13.1 — Test**

```ts
import { describe, it, expect, vi } from 'vitest'
import { runStage } from '@main/pipeline/stage-runner'

function makeProvider(id: string, run: (i: any) => Promise<any>) {
  return {
    id, stage: 'compose' as const, displayName: id, requiresCredentials: [],
    costModel: { estimate: () => 0 }, async healthCheck() { return { ok: true } }, run
  }
}

describe('runStage', () => {
  it('returns first successful provider result', async () => {
    const p1 = makeProvider('a', vi.fn().mockResolvedValue('ok-a'))
    const r = await runStage([p1], 'input', { runId: 't', runDir: '/tmp', logger: () => {} }, () => undefined)
    expect(r.output).toBe('ok-a'); expect(r.providerId).toBe('a')
  })

  it('falls over to next provider on retryable error', async () => {
    const p1 = makeProvider('a', vi.fn().mockRejectedValue(Object.assign(new Error('429'), { status: 429 })))
    const p2 = makeProvider('b', vi.fn().mockResolvedValue('ok-b'))
    const r = await runStage([p1, p2], 'input', { runId: 't', runDir: '/tmp', logger: () => {} }, () => undefined)
    expect(r.providerId).toBe('b')
  })

  it('throws aggregated error if all fail', async () => {
    const p1 = makeProvider('a', vi.fn().mockRejectedValue(new Error('boom')))
    const p2 = makeProvider('b', vi.fn().mockRejectedValue(new Error('boom')))
    await expect(runStage([p1, p2], 'input', { runId: 't', runDir: '/tmp', logger: () => {} }, () => undefined))
      .rejects.toThrow(/all.*providers.*failed/i)
  })
})
```

- [ ] **Step 13.2 — Implement**

```ts
// src/main/pipeline/stage-runner.ts
import type { StageProvider, RunContext } from './contracts'

export interface StageResult<T> {
  providerId: string
  output: T
  durationMs: number
  usedFallback: boolean
}

function isRetryable(err: any): boolean {
  const s = err?.status ?? err?.statusCode
  if (typeof s === 'number') return s === 408 || s === 429 || s >= 500
  return /timeout|ETIMEDOUT|ECONNRESET|fetch failed/i.test(String(err?.message ?? err))
}

export async function runStage<TIn, TOut>(
  providers: StageProvider<TIn, TOut>[],
  input: TIn,
  ctx: RunContext,
  getCredential: (key: string) => string | undefined
): Promise<StageResult<TOut>> {
  if (providers.length === 0) throw new Error('no providers configured for stage')
  const errors: string[] = []
  for (let i = 0; i < providers.length; i++) {
    const p = providers[i]
    const t0 = Date.now()
    try {
      const output = await p.run(input, ctx, getCredential)
      return { providerId: p.id, output, durationMs: Date.now() - t0, usedFallback: i > 0 }
    } catch (err: any) {
      errors.push(`${p.id}: ${err?.message ?? err}`)
      ctx.logger('stage.error', { providerId: p.id, error: err?.message })
      if (!isRetryable(err) && i < providers.length - 1) {
        // non-retryable: still try next provider (user may have configured fallbacks for this reason)
      }
    }
  }
  throw new Error(`all providers failed:\n${errors.join('\n')}`)
}
```

- [ ] **Step 13.3 — Pass + commit**

```bash
pnpm vitest run tests/stage-runner.test.ts
git add src/main/pipeline/stage-runner.ts tests/stage-runner.test.ts
git commit -m "feat(pipeline): generic stage runner with ordered fallback"
```

---

## Task 14 — Pipeline Orchestrator

**Files:** `src/main/pipeline/orchestrator.ts`, `tests/orchestrator.test.ts`

- [ ] **Step 14.1 — Test (mocked providers, full pipeline)**

```ts
// tests/orchestrator.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'

vi.mock('@main/providers', async () => {
  const { ProviderRegistry } = await import('@main/providers/registry')
  const r = new ProviderRegistry()
  const mk = (stage: any, id: string, out: any) => ({
    id, stage, displayName: id, requiresCredentials: [], costModel: { estimate: () => 0 },
    async healthCheck() { return { ok: true } }, run: async () => out
  })
  r.register(mk('extract', 'mock-extract', { cutoutPngPath: '/tmp/cut.png' }))
  r.register(mk('understand', 'mock-understand', {
    category: 'sneaker', material: [], color_palette: [], style_tone: 'minimalist',
    target_audience: 'x', key_features: []
  }))
  r.register(mk('plan', 'mock-plan', {
    scene_prompt: 'warm wood desk', composition_hint: 'center',
    copy: { headline: 'H', subhead: 'S', bullets: ['b'], cta: 'C' }, overlay_layout: 'bottom_caption'
  }))
  r.register(mk('compose', 'mock-compose', { composedPngPath: '/tmp/composed.png' }))
  r.register(mk('overlay', 'mock-overlay', { finalPngPath: '/tmp/final.png' }))
  return { registry: r, registerAll: () => {} }
})

import { runPipeline } from '@main/pipeline/orchestrator'

describe('orchestrator', () => {
  let baseDir: string
  beforeEach(async () => { baseDir = await fs.mkdtemp(join(tmpdir(), 'ps-orch-')) })

  it('runs all 5 stages and emits progress', async () => {
    const src = join(baseDir, 'in.jpg'); await fs.writeFile(src, Buffer.from([0,1,2]))
    const events: string[] = []
    const bus = new EventEmitter()
    bus.on('stage:start', e => events.push(`start:${e.stage}`))
    bus.on('stage:done', e => events.push(`done:${e.stage}`))

    const result = await runPipeline({
      baseDir, inputPath: src, size: { width: 1080, height: 1080 },
      providerSelection: {
        extract: ['mock-extract'], understand: ['mock-understand'],
        plan: ['mock-plan'], compose: ['mock-compose'], overlay: ['mock-overlay']
      },
      getCredential: () => 'k',
      events: bus
    })

    expect(result.finalPngPath).toBe('/tmp/final.png')
    expect(events).toEqual([
      'start:extract','done:extract','start:understand','done:understand',
      'start:plan','done:plan','start:compose','done:compose',
      'start:overlay','done:overlay'
    ])
  })
})
```

- [ ] **Step 14.2 — Implement**

```ts
// src/main/pipeline/orchestrator.ts
import { EventEmitter } from 'node:events'
import { basename } from 'node:path'
import type { StageName, Size, RunMetadata, OverlayLayout } from '@main/schemas'
import { registry, registerAll } from '@main/providers'
import { runStage } from './stage-runner'
import { createRun, writeMetadata } from '@main/storage/runs-dir'

export interface RunPipelineParams {
  baseDir: string
  inputPath: string
  size: Size
  providerSelection: Record<StageName, string[]>   // ordered ids per stage
  getCredential: (key: string) => string | undefined
  events?: EventEmitter
  stylePreference?: string
  layoutPreference?: OverlayLayout
  copyTone?: string
}

export interface RunPipelineResult {
  runId: string
  runDir: string
  finalPngPath: string
  metadata: RunMetadata
}

export async function runPipeline(p: RunPipelineParams): Promise<RunPipelineResult> {
  registerAll()
  const ev = p.events ?? new EventEmitter()
  const slug = basename(p.inputPath).replace(/\.\w+$/, '')
  const { runId, runDir } = await createRun(p.baseDir, p.inputPath, slug)
  const ctx = {
    runId, runDir,
    logger: (msg: string, data?: Record<string, unknown>) => ev.emit('log', { msg, data, runId })
  }
  const stages: StageName[] = ['extract', 'understand', 'plan', 'compose', 'overlay']
  const timings: RunMetadata['stages'] = []
  const state: any = { inputPath: p.inputPath, size: p.size, stylePreference: p.stylePreference,
                       layoutPreference: p.layoutPreference, copyTone: p.copyTone }

  for (const stage of stages) {
    const ids = p.providerSelection[stage]
    const providers = registry.resolveOrdered(stage, ids)
    if (providers.length === 0) throw new Error(`no enabled providers for ${stage}`)
    ev.emit('stage:start', { stage, providerId: providers[0].id })

    const input = buildStageInput(stage, state)
    const r = await runStage(providers, input, ctx, p.getCredential)
    applyStageOutput(stage, state, r.output)
    timings.push({
      stage, provider_id: r.providerId, duration_ms: r.durationMs,
      cost_usd: providers[0].costModel.estimate(input)
    })
    ev.emit('stage:done', { stage, providerId: r.providerId, output: r.output, durationMs: r.durationMs })
  }

  const meta: RunMetadata = {
    run_id: runId, input_path: p.inputPath, size: `${p.size.width}x${p.size.height}`,
    stages: timings, total_cost_usd: timings.reduce((a, t) => a + t.cost_usd, 0),
    created_at: new Date().toISOString()
  }
  await writeMetadata(runDir, meta)
  return { runId, runDir, finalPngPath: state.finalPngPath, metadata: meta }
}

function buildStageInput(stage: StageName, s: any): any {
  switch (stage) {
    case 'extract':   return { imagePath: s.inputPath }
    case 'understand': return { imagePath: s.inputPath, cutoutPngPath: s.cutoutPngPath }
    case 'plan':      return {
      understanding: s.understanding, size: s.size,
      stylePreference: s.stylePreference, layoutPreference: s.layoutPreference, copyTone: s.copyTone
    }
    case 'compose':   return { originalImagePath: s.inputPath, scenePrompt: s.plan.scene_prompt, size: s.size }
    case 'overlay':   return { composedPngPath: s.composedPngPath, copy: s.plan.copy, layout: s.plan.overlay_layout, size: s.size }
  }
}

function applyStageOutput(stage: StageName, s: any, out: any): void {
  if (stage === 'extract') s.cutoutPngPath = out.cutoutPngPath
  else if (stage === 'understand') s.understanding = out
  else if (stage === 'plan') s.plan = out
  else if (stage === 'compose') s.composedPngPath = out.composedPngPath
  else if (stage === 'overlay') s.finalPngPath = out.finalPngPath
}
```

- [ ] **Step 14.3 — Pass + commit**

```bash
pnpm vitest run tests/orchestrator.test.ts
git add src/main/pipeline/orchestrator.ts tests/orchestrator.test.ts
git commit -m "feat(pipeline): sequential orchestrator with progress events + metadata"
```

---

## Task 15 — tRPC Routers

**Files:** `src/main/ipc/trpc.ts`, `src/main/ipc/context.ts`, `src/main/ipc/pipeline.router.ts`, `src/main/ipc/settings.router.ts`, `src/main/ipc/providers.router.ts`, `src/main/ipc/app-router.ts`

No unit test needed for these — they're IPC glue. Type safety + the end-to-end smoke test (Task 20) cover them.

- [ ] **Step 15.1 — `trpc.ts`**

```ts
import { initTRPC } from '@trpc/server'
const t = initTRPC.create({ isServer: true })
export const router = t.router
export const publicProcedure = t.procedure
```

- [ ] **Step 15.2 — `providers.router.ts`**

```ts
import { z } from 'zod'
import { registerAll, registry } from '@main/providers'
import { StageNameSchema } from '@main/schemas'
import { router, publicProcedure } from './trpc'

registerAll()

export const providersRouter = router({
  listByStage: publicProcedure.input(z.object({ stage: StageNameSchema })).query(({ input }) =>
    registry.listByStage(input.stage).map(p => ({
      id: p.id, displayName: p.displayName, requiresCredentials: p.requiresCredentials,
      stage: p.stage, estimatedCostUsd: p.costModel.estimate({})
    }))
  )
})
```

- [ ] **Step 15.3 — `settings.router.ts`**

```ts
import { z } from 'zod'
import { settings } from '@main/storage/settings'
import { StageNameSchema } from '@main/schemas'
import { router, publicProcedure } from './trpc'

export const settingsRouter = router({
  getCredentialStatus: publicProcedure.input(z.object({ key: z.string() })).query(({ input }) =>
    ({ key: input.key, present: !!settings.getCredential(input.key) })
  ),
  setCredential: publicProcedure.input(z.object({ key: z.string(), value: z.string() })).mutation(({ input }) => {
    settings.setCredential(input.key, input.value); return { ok: true }
  }),
  deleteCredential: publicProcedure.input(z.object({ key: z.string() })).mutation(({ input }) => {
    settings.deleteCredential(input.key); return { ok: true }
  }),
  getPrimary: publicProcedure.input(z.object({ stage: StageNameSchema })).query(({ input }) =>
    ({ stage: input.stage, providerId: settings.getPrimaryProvider(input.stage) })
  ),
  setPrimary: publicProcedure.input(z.object({ stage: StageNameSchema, providerId: z.string() })).mutation(({ input }) => {
    settings.setPrimaryProvider(input.stage, input.providerId); return { ok: true }
  })
})
```

- [ ] **Step 15.4 — `pipeline.router.ts` (with subscription)**

```ts
import { z } from 'zod'
import { EventEmitter } from 'node:events'
import { observable } from '@trpc/server/observable'
import { app } from 'electron'
import { join } from 'node:path'
import { runPipeline } from '@main/pipeline/orchestrator'
import { settings } from '@main/storage/settings'
import { StageNameSchema } from '@main/schemas'
import { router, publicProcedure } from './trpc'

const bus = new EventEmitter()

const runInput = z.object({
  inputPath: z.string(),
  size: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
  stylePreference: z.string().optional(),
  layoutPreference: z.enum(['top_banner','side_panel','bottom_caption','centered_hero']).optional(),
  copyTone: z.string().optional()
})

export const pipelineRouter = router({
  progress: publicProcedure.subscription(() => observable<{ type: string; payload: any }>(emit => {
    const onStart = (e: any) => emit.next({ type: 'stage:start', payload: e })
    const onDone = (e: any) => emit.next({ type: 'stage:done', payload: e })
    const onLog = (e: any) => emit.next({ type: 'log', payload: e })
    bus.on('stage:start', onStart); bus.on('stage:done', onDone); bus.on('log', onLog)
    return () => { bus.off('stage:start', onStart); bus.off('stage:done', onDone); bus.off('log', onLog) }
  })),

  run: publicProcedure.input(runInput).mutation(async ({ input }) => {
    const baseDir = join(app.getPath('userData'), 'runs')
    const stages = ['extract','understand','plan','compose','overlay'] as const
    const providerSelection = Object.fromEntries(
      stages.map(s => [s, settings.getOrderedProviders(s)])
    ) as any
    return runPipeline({
      baseDir, inputPath: input.inputPath, size: input.size,
      providerSelection, getCredential: k => settings.getCredential(k),
      events: bus,
      stylePreference: input.stylePreference, layoutPreference: input.layoutPreference, copyTone: input.copyTone
    })
  })
})
```

- [ ] **Step 15.5 — `app-router.ts`**

```ts
import { router } from './trpc'
import { pipelineRouter } from './pipeline.router'
import { settingsRouter } from './settings.router'
import { providersRouter } from './providers.router'

export const appRouter = router({
  pipeline: pipelineRouter,
  settings: settingsRouter,
  providers: providersRouter
})
export type AppRouter = typeof appRouter
```

- [ ] **Step 15.6 — Commit**

```bash
git add src/main/ipc
git commit -m "feat(ipc): tRPC routers for pipeline/settings/providers with progress subscription"
```

---

## Task 16 — Main Process Entry + Preload

**Files:** `src/main/index.ts`, `src/preload/index.ts`

- [ ] **Step 16.1 — `src/main/index.ts`**

```ts
import { app, BrowserWindow } from 'electron'
import { createIPCHandler } from 'electron-trpc/main'
import { join } from 'node:path'
import { appRouter } from './ipc/app-router'

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 820, backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  })
  createIPCHandler({ router: appRouter, windows: [win] })

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
```

- [ ] **Step 16.2 — `src/preload/index.ts`**

```ts
import { contextBridge } from 'electron'
import { exposeElectronTRPC } from 'electron-trpc/main'

process.once('loaded', () => { exposeElectronTRPC() })

contextBridge.exposeInMainWorld('electronAPI', {
  selectFile: async () => null   // placeholder; Home uses drag+drop
})
```

- [ ] **Step 16.3 — Commit**

```bash
git add src/main/index.ts src/preload/index.ts
git commit -m "feat(app): Electron main window + tRPC IPC wiring"
```

---

## Task 17 — Renderer Shell

**Files:** `src/renderer/main.tsx`, `src/renderer/App.tsx`, `src/renderer/trpc.ts`

- [ ] **Step 17.1 — `trpc.ts`**

```ts
import { createTRPCReact } from '@trpc/react-query'
import { ipcLink } from 'electron-trpc/renderer'
import { QueryClient } from '@tanstack/react-query'
import type { AppRouter } from '../main/ipc/app-router'

export const trpc = createTRPCReact<AppRouter>()
export const queryClient = new QueryClient()
export const trpcClient = trpc.createClient({ links: [ipcLink()] })
```

- [ ] **Step 17.2 — `main.tsx`**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import './styles/globals.css'
import { App } from './App'
import { trpc, trpcClient, queryClient } from './trpc'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter><App /></BrowserRouter>
    </QueryClientProvider>
  </trpc.Provider>
)
```

- [ ] **Step 17.3 — `App.tsx`**

```tsx
import { NavLink, Route, Routes } from 'react-router-dom'
import { Home } from './routes/home'
import { SettingsPage } from './routes/settings'

export function App() {
  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-4 px-4 py-2 border-b border-neutral-800">
        <strong>Product Studio</strong>
        <nav className="flex gap-3 text-sm">
          <NavLink to="/" className={({isActive}) => isActive ? 'text-emerald-400' : 'text-neutral-400'}>Home</NavLink>
          <NavLink to="/settings" className={({isActive}) => isActive ? 'text-emerald-400' : 'text-neutral-400'}>Settings</NavLink>
        </nav>
      </header>
      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  )
}
```

- [ ] **Step 17.4 — Commit**

```bash
git add src/renderer/trpc.ts src/renderer/main.tsx src/renderer/App.tsx
git commit -m "feat(renderer): shell with router + tRPC provider"
```

---

## Task 18 — Home Route + Dropzone + StagePipeline

**Files:** `src/renderer/routes/home.tsx`, `src/renderer/components/Dropzone.tsx`, `src/renderer/components/StagePipeline.tsx`, `src/renderer/components/ParamsPanel.tsx`, `src/renderer/hooks/useRunStream.ts`

- [ ] **Step 18.1 — `Dropzone.tsx`**

```tsx
import { useCallback } from 'react'

export function Dropzone({ onFile }: { onFile: (path: string) => void }) {
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f && 'path' in f) onFile((f as any).path as string)
  }, [onFile])
  return (
    <div onDragOver={e => e.preventDefault()} onDrop={onDrop}
         className="border-2 border-dashed border-neutral-600 rounded p-6 text-center text-neutral-400 cursor-pointer">
      Drop product image here
    </div>
  )
}
```

- [ ] **Step 18.2 — `StagePipeline.tsx`**

```tsx
const STAGES = ['extract', 'understand', 'plan', 'compose', 'overlay'] as const

export function StagePipeline({ current, done }: { current: string | null; done: Set<string> }) {
  return (
    <div className="flex gap-2">
      {STAGES.map((s, i) => {
        const isDone = done.has(s)
        const isCurrent = current === s
        const cls = isDone ? 'bg-emerald-600' : isCurrent ? 'bg-amber-500' : 'bg-neutral-800'
        return (
          <div key={s} className={`flex-1 text-center py-1.5 rounded text-xs text-white ${cls}`}>
            {i + 1}. {s}{isDone ? ' ✓' : isCurrent ? ' ⟳' : ''}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 18.3 — `ParamsPanel.tsx`**

```tsx
import { useState } from 'react'

export interface ParamsValue {
  size: { width: number; height: number }
  stylePreference?: string
  layoutPreference?: 'top_banner' | 'side_panel' | 'bottom_caption' | 'centered_hero'
  copyTone?: string
}

export function ParamsPanel({ value, onChange }: { value: ParamsValue; onChange: (v: ParamsValue) => void }) {
  const [size, setSize] = useState('1080x1080')
  const applySize = (s: string) => {
    setSize(s); const [w, h] = s.split('x').map(Number)
    onChange({ ...value, size: { width: w, height: h } })
  }
  return (
    <div className="flex flex-col gap-2 text-sm">
      <label>Size
        <select className="w-full bg-neutral-900 border border-neutral-700 px-2 py-1" value={size} onChange={e => applySize(e.target.value)}>
          <option value="1080x1080">1:1 (1080×1080)</option>
          <option value="1080x1440">3:4 (1080×1440)</option>
          <option value="1080x1920">9:16 (1080×1920)</option>
          <option value="1920x1080">16:9 (1920×1080)</option>
        </select>
      </label>
      <label>Style
        <input className="w-full bg-neutral-900 border border-neutral-700 px-2 py-1"
               placeholder="Auto (leave blank)"
               onChange={e => onChange({ ...value, stylePreference: e.target.value || undefined })} />
      </label>
      <label>Copy tone
        <input className="w-full bg-neutral-900 border border-neutral-700 px-2 py-1"
               placeholder="Auto"
               onChange={e => onChange({ ...value, copyTone: e.target.value || undefined })} />
      </label>
    </div>
  )
}
```

- [ ] **Step 18.4 — `useRunStream.ts`**

```ts
import { useEffect, useState } from 'react'
import { trpc } from '@renderer/trpc'

export function useRunStream() {
  const [current, setCurrent] = useState<string | null>(null)
  const [done, setDone] = useState<Set<string>>(new Set())
  const [log, setLog] = useState<string[]>([])

  trpc.pipeline.progress.useSubscription(undefined, {
    onData(ev: any) {
      if (ev.type === 'stage:start') setCurrent(ev.payload.stage)
      if (ev.type === 'stage:done') setDone(prev => new Set(prev).add(ev.payload.stage))
      if (ev.type === 'log') setLog(prev => [...prev, JSON.stringify(ev.payload)].slice(-100))
    }
  })

  const reset = () => { setCurrent(null); setDone(new Set()); setLog([]) }
  return { current, done, log, reset }
}
```

- [ ] **Step 18.5 — `home.tsx`**

```tsx
import { useState } from 'react'
import { Dropzone } from '@renderer/components/Dropzone'
import { StagePipeline } from '@renderer/components/StagePipeline'
import { ParamsPanel, type ParamsValue } from '@renderer/components/ParamsPanel'
import { useRunStream } from '@renderer/hooks/useRunStream'
import { trpc } from '@renderer/trpc'

export function Home() {
  const [inputPath, setInputPath] = useState<string | null>(null)
  const [params, setParams] = useState<ParamsValue>({ size: { width: 1080, height: 1080 } })
  const [finalImage, setFinalImage] = useState<string | null>(null)
  const { current, done, log, reset } = useRunStream()

  const run = trpc.pipeline.run.useMutation({
    onSuccess(res) { setFinalImage(`file://${res.finalPngPath}`) }
  })

  return (
    <div className="grid h-full grid-cols-[280px_1fr_320px]">
      <aside className="p-4 border-r border-neutral-800 flex flex-col gap-4">
        <Dropzone onFile={setInputPath} />
        {inputPath && <div className="text-xs text-neutral-400 break-all">{inputPath}</div>}
        <ParamsPanel value={params} onChange={setParams} />
        <button disabled={!inputPath || run.isPending}
                className="bg-emerald-600 text-white rounded py-2 disabled:opacity-40"
                onClick={() => { reset(); setFinalImage(null); run.mutate({ inputPath: inputPath!, ...params }) }}>
          {run.isPending ? 'Generating…' : 'Generate ✨'}
        </button>
        {run.error && <div className="text-xs text-red-400 whitespace-pre-wrap">{String(run.error.message)}</div>}
      </aside>

      <section className="p-4 flex flex-col gap-4">
        <StagePipeline current={current} done={done} />
        <div className="flex-1 bg-neutral-900 rounded p-2 flex items-center justify-center">
          {finalImage
            ? <img src={finalImage} className="max-w-full max-h-full object-contain" alt="final" />
            : <span className="text-neutral-600">No output yet</span>}
        </div>
      </section>

      <aside className="p-4 border-l border-neutral-800 overflow-auto text-xs font-mono text-neutral-500">
        {log.length === 0 ? <span className="text-neutral-700">No events</span> : log.map((l, i) => <div key={i}>{l}</div>)}
      </aside>
    </div>
  )
}
```

- [ ] **Step 18.6 — Commit**

```bash
git add src/renderer/routes/home.tsx src/renderer/components src/renderer/hooks
git commit -m "feat(renderer): Home route with Dropzone + StagePipeline + progress stream"
```

---

## Task 19 — Settings Route

**Files:** `src/renderer/routes/settings.tsx`

- [ ] **Step 19.1 — Implementation**

```tsx
import { useState } from 'react'
import { trpc } from '@renderer/trpc'

function CredentialRow({ credKey, label }: { credKey: string; label: string }) {
  const status = trpc.settings.getCredentialStatus.useQuery({ key: credKey })
  const setter = trpc.settings.setCredential.useMutation({ onSuccess: () => status.refetch() })
  const deleter = trpc.settings.deleteCredential.useMutation({ onSuccess: () => status.refetch() })
  const [value, setValue] = useState('')

  return (
    <div className="flex flex-col gap-1 border-b border-neutral-800 py-3">
      <div className="flex items-center gap-2">
        <strong>{label}</strong>
        <span className={status.data?.present ? 'text-emerald-400' : 'text-neutral-500'}>
          {status.data?.present ? 'configured' : 'not set'}
        </span>
      </div>
      <div className="flex gap-2">
        <input type="password" className="flex-1 bg-neutral-900 border border-neutral-700 px-2 py-1"
               placeholder="paste API key" value={value} onChange={e => setValue(e.target.value)} />
        <button className="bg-emerald-600 text-white px-3 rounded"
                onClick={() => { setter.mutate({ key: credKey, value }); setValue('') }}>Save</button>
        {status.data?.present &&
          <button className="bg-neutral-700 text-white px-3 rounded" onClick={() => deleter.mutate({ key: credKey })}>Clear</button>}
      </div>
    </div>
  )
}

export function SettingsPage() {
  return (
    <div className="max-w-xl mx-auto p-6">
      <h2 className="text-lg font-semibold mb-4">API credentials</h2>
      <CredentialRow credKey="GOOGLE_API_KEY" label="Google AI Studio (Gemini + Nano Banana)" />
      <CredentialRow credKey="ANTHROPIC_API_KEY" label="Anthropic (Claude Sonnet 4.6)" />
      <p className="text-xs text-neutral-500 mt-4">
        Keys are stored encrypted via OS keychain (safeStorage) and never leave the main process.
      </p>
    </div>
  )
}
```

- [ ] **Step 19.2 — Commit**

```bash
git add src/renderer/routes/settings.tsx
git commit -m "feat(renderer): Settings page for API key entry"
```

---

## Task 20 — End-to-End Smoke Test

**File:** `tests/e2e-smoke.test.ts`

- [ ] **Step 20.1 — Write smoke test (all providers mocked)**

```ts
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// swap registry with mocks that use the real napi-canvas overlay (to exercise PNG I/O)
vi.mock('@main/providers', async () => {
  const { ProviderRegistry } = await import('@main/providers/registry')
  const { napiCanvasOverlay } = await import('@main/providers/overlay/napi-canvas')
  const r = new ProviderRegistry()
  const mk = (stage: any, id: string, out: any) => ({
    id, stage, displayName: id, requiresCredentials: [], costModel: { estimate: () => 0 },
    async healthCheck() { return { ok: true } }, run: async () => out
  })
  r.register(mk('extract', 'mock-extract', { cutoutPngPath: 'unused' }))
  r.register(mk('understand', 'mock-understand', {
    category: 'sneaker', material: ['canvas'], color_palette: ['white'], style_tone: 'minimalist',
    target_audience: 'adults', key_features: ['comfortable']
  }))
  r.register(mk('plan', 'mock-plan', {
    scene_prompt: 'warm wooden surface', composition_hint: 'center',
    copy: { headline: 'Step Into Comfort', subhead: 'Everyday sneakers reimagined',
            bullets: ['Lightweight','Breathable'], cta: 'Shop Now' },
    overlay_layout: 'bottom_caption'
  }))
  return {
    registry: (() => {
      // compose mock produces a real blue PNG so overlay has something to draw on
      const { createCanvas } = require('@napi-rs/canvas')
      r.register({
        id: 'mock-compose', stage: 'compose', displayName: 'mock', requiresCredentials: [],
        costModel: { estimate: () => 0 },
        async healthCheck() { return { ok: true } },
        async run(_input: any, ctx: any) {
          const c = createCanvas(1080, 1080); const g = c.getContext('2d')
          g.fillStyle = '#335577'; g.fillRect(0, 0, 1080, 1080)
          const p = join(ctx.runDir, '04_composed.png')
          await (await import('node:fs')).promises.writeFile(p, c.toBuffer('image/png'))
          return { composedPngPath: p }
        }
      })
      r.register(napiCanvasOverlay)
      return r
    })(),
    registerAll: () => {}
  }
})

import { runPipeline } from '@main/pipeline/orchestrator'

let baseDir: string
beforeAll(async () => { baseDir = await fs.mkdtemp(join(tmpdir(), 'ps-e2e-')) })

describe('end-to-end smoke (all mocked except overlay)', () => {
  it('produces a non-empty final PNG and valid metadata.json', async () => {
    const input = join(baseDir, 'in.jpg')
    await fs.writeFile(input, Buffer.from([0xff, 0xd8, 0xff]))

    const result = await runPipeline({
      baseDir, inputPath: input, size: { width: 1080, height: 1080 },
      providerSelection: {
        extract: ['mock-extract'], understand: ['mock-understand'],
        plan: ['mock-plan'], compose: ['mock-compose'], overlay: ['napi-canvas']
      },
      getCredential: () => undefined
    })

    const finalBytes = await fs.readFile(result.finalPngPath)
    expect(finalBytes.byteLength).toBeGreaterThan(5000)
    expect(result.metadata.stages).toHaveLength(5)
    expect(result.metadata.stages.map(s => s.stage)).toEqual(['extract','understand','plan','compose','overlay'])
  })
})
```

- [ ] **Step 20.2 — Pass + commit**

```bash
pnpm vitest run tests/e2e-smoke.test.ts
git add tests/e2e-smoke.test.ts
git commit -m "test(e2e): smoke test across all 5 stages producing real final PNG"
```

---

## Task 21 — Manual Integration Smoke (real APIs)

Not automated. Executed once locally by the developer to confirm the pipeline works end-to-end against real services.

- [ ] **Step 21.1 — Set API keys via the running app**

```bash
pnpm dev
```

In the app:
1. Navigate to Settings, paste `GOOGLE_API_KEY` and `ANTHROPIC_API_KEY`, Save each.
2. Seed primary providers by launching a dev shell and calling `setPrimary` via devtools, OR add a one-off bootstrap call in `src/main/index.ts` that sets the five primaries on first launch if absent.

Bootstrap snippet to add to `src/main/index.ts` just after `app.whenReady().then(...)`:
```ts
import { settings } from './storage/settings'
const seeds = {
  extract: 'imgly-bg-removal', understand: 'gemini-2.5-flash',
  plan: 'claude-sonnet-4-6', compose: 'nano-banana', overlay: 'napi-canvas'
} as const
for (const [stage, id] of Object.entries(seeds)) {
  if (!settings.getPrimaryProvider(stage as any)) settings.setPrimaryProvider(stage as any, id)
}
```

- [ ] **Step 21.2 — Drop any product image onto Home, click Generate**

Expected within ~15–30 seconds:
- The 5-stage strip marches extract → overlay, each turning green.
- Final composed image appears in the center pane.
- `runs/<timestamp>/metadata.json` exists with five entries and total_cost_usd ≈ 0.05.
- `runs/<timestamp>/05_final.png` opens and shows the English copy overlaid.

- [ ] **Step 21.3 — Commit bootstrap snippet**

```bash
git add src/main/index.ts
git commit -m "feat(app): seed primary providers on first launch"
```

---

## Verification (end-to-end)

After all tasks complete:

1. **Automated tests**
   ```bash
   pnpm typecheck && pnpm test
   ```
   All tests pass. Roughly 25+ test cases across schemas, registry, providers, runner, orchestrator, storage, and the e2e smoke.

2. **Manual app run**
   ```bash
   pnpm dev
   ```
   - Settings: both API-key rows flip to "configured" after Save.
   - Home: drag a product image (JPEG/PNG up to ~5MB), Generate. All 5 stage chips turn green in sequence within ~30s. Final PNG renders in the center pane. `runs/<runId>/05_final.png` opens outside the app.

3. **Pluggability sanity check**
   - Open `src/main/providers/index.ts` and comment out `registry.register(nanoBanana)`. Run `pnpm dev`, attempt Generate. Expected: the compose stage fails with a clear "no enabled providers for compose" error. Un-comment, restart, succeeds.
   - Add a stub provider file `src/main/providers/compose/fake-compose.ts` exporting a `ComposeProvider` that returns a canned buffer, register it in `index.ts`, set it as primary via devtools, and verify it runs — confirming zero orchestration changes needed to add a new model.

## Post-plan notes

Once this MVP plan is complete, the next logical plan additions (each small enough for its own spec→plan cycle) are:
- **Additional providers** — Claude Haiku, GPT-5, Flux Kontext, Seedream, etc. (each ~30 min of work given the interface).
- **Runs gallery + Replay UI** — `/runs` route listing `runs/` directory, opening each run with a Replay-from-Stage button.
- **Advanced Settings** — drag-reorder fallback lists, per-provider health dashboard, monthly budget dashboard.
- **electron-builder packaging** — `.dmg` / `.exe` targets with code signing.
- **Playwright E2E** — full app-level test driving the Electron window.
