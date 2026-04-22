# AI Product Image Workflow — Design Spec

**Date:** 2026-04-22
**Status:** Draft (awaiting user review)
**Form factor:** Personal Electron desktop app (Node.js + React + TypeScript)

## 1. Goal

A local Electron desktop application that takes one raw e-commerce product photo and produces one (or more) finished marketing images, each with:

- The original product subject preserved and placed in a new AI-generated scene
- An English marketing copy overlay (headline / subhead / bullets / CTA)
- A configurable output aspect ratio (1:1 / 3:4 / 9:16 / 16:9 / custom WxH)

The user drops an image into the app, optionally tweaks a few parameters, clicks **Generate**, and watches the pipeline run stage-by-stage. All heavy generation uses cloud APIs; no local GPU required.

## 2. Non-Goals

- Multi-user, auth, billing, or SaaS features
- Video generation
- In-image AI text rendering (text is always overlaid programmatically via Canvas)
- Fine-tuning / LoRA training
- Full offline mode (the compose stage always requires an image-edit API)

## 3. Architecture Overview

The pipeline has **5 sequential stages**. Each stage reads the previous stage's artifact from disk and writes its own artifact, so any stage can be retried or replayed independently.

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ 1. Extract   │→│ 2. Understand │→│ 3. Plan      │→│ 4. Compose   │→│ 5. Overlay   │
│ local CPU    │  │ VLM          │  │ LLM          │  │ Image edit    │  │ Canvas text  │
│ @imgly/bg-   │  │ Gemini Flash │  │ Claude Sonnet│  │ Nano Banana  │  │ napi-rs canvas│
│ removal-node │  │              │  │              │  │              │  │              │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
```

### Stage Contracts

| # | Stage | Input | Output | Provider |
|---|-------|-------|--------|----------|
| 1 | Extract | original product image | transparent-background PNG (used as VLM reference only) | `@imgly/background-removal-node` (ONNX, local CPU) |
| 2 | Understand | original image | `ProductUnderstanding` JSON | `gemini-2.5-flash` |
| 3 | Plan | `ProductUnderstanding` + size + style hints | `CreativePlan` JSON (scene prompt + English copy + layout) | `claude-sonnet-4-6` |
| 4 | Compose | original image + scene prompt + target size | new composed image (product in new scene) | `gemini-2.5-flash-image` (Nano Banana), fallback `flux-kontext-pro` |
| 5 | Overlay | composed image + copy + layout template | final image with English text | `@napi-rs/canvas` (local) |

### Key Design Decisions

1. **Every stage is pluggable.** Each stage exposes a narrow TypeScript interface; concrete providers (Nano Banana, Flux Kontext, Photoroom, Claude, Gemini, …) are plug-ins registered at startup. The pipeline orchestrator has zero knowledge of any specific provider — it only talks to interfaces. Adding a new model = adding one file under `providers/<stage>/` and registering it. Model selection is driven entirely by runtime config (Settings UI), never hardcoded in orchestration code. See Section 3a.

2. **Extract is for VLM reference only, not for compositing.** The compose stage (4) uses a multimodal edit model that takes the *original* image and recreates it in a new scene in one shot. The clean cutout simply helps the VLM identify the product more accurately.

3. **Plan output is strictly structured (Zod schema).** No free-text prompts flowing between stages. This keeps the renderer UI and the overlay stage deterministic.

4. **Every intermediate artifact lands on disk** under `runs/<timestamp>_<slug>/`. This enables per-stage retry, replay, and A/B comparison across compose models.

5. **Text is rendered by Canvas, never by the image model.** AI in-image text is unreliable for English marketing copy; Canvas gives pixel-level control over font, size, position, stroke, shadow.

### Data Schemas (Zod)

```ts
ProductUnderstanding = {
  category: string;               // "sneaker", "skincare_cream", ...
  material: string[];             // ["leather", "rubber"]
  color_palette: string[];        // ["off-white", "beige"]
  style_tone: string;             // "minimalist" | "sporty" | "luxurious" | ...
  target_audience: string;
  key_features: string[];         // selling points
};

CreativePlan = {
  scene_prompt: string;           // natural-language prompt for compose stage
  composition_hint: string;       // product placement guidance
  copy: {
    headline: string;             // <= 6 words
    subhead: string;              // <= 12 words
    bullets: string[];            // 0–3 items
    cta: string;                  // <= 3 words, optional
  };
  overlay_layout: "top_banner" | "side_panel" | "bottom_caption" | "centered_hero";
};

RunMetadata = {
  run_id: string;
  input_path: string;
  size: string;                   // "1:1" | "1080x1920" | ...
  stages: StageTiming[];          // per-stage model, duration, cost, tokens
  total_cost_usd: number;
  created_at: string;
};
```

## 3a. Provider Abstraction & Pluggability

Every stage is defined by an interface in `src/main/pipeline/contracts.ts`. All concrete implementations live under `src/main/providers/<stage>/<provider-id>.ts` and register themselves into a central registry at startup. The orchestrator resolves providers by ID from user settings; swapping a provider never touches pipeline code.

### Stage Interfaces

```ts
interface StageProvider<TIn, TOut> {
  readonly id: string;              // "gemini-2.5-flash-image", "flux-kontext-pro", ...
  readonly stage: StageName;        // "extract" | "understand" | "plan" | "compose" | "overlay"
  readonly displayName: string;     // shown in Settings UI
  readonly requiresCredentials: string[];  // e.g. ["GOOGLE_API_KEY"]
  readonly costModel: CostModel;    // function (input) -> estimated USD
  readonly capabilities: Capability[]; // e.g. ["aspect:any", "max-resolution:2048"]

  healthCheck(): Promise<ProviderHealth>;   // called on startup + Settings save
  run(input: TIn, ctx: RunContext): Promise<TOut>;
}

type ExtractProvider   = StageProvider<ExtractInput, ExtractOutput>;
type UnderstandProvider = StageProvider<UnderstandInput, ProductUnderstanding>;
type PlanProvider      = StageProvider<PlanInput, CreativePlan>;
type ComposeProvider   = StageProvider<ComposeInput, ComposeOutput>;
type OverlayProvider   = StageProvider<OverlayInput, OverlayOutput>;
```

### Registry

```ts
// src/main/providers/registry.ts
class ProviderRegistry {
  register(p: StageProvider<any, any>): void;
  get(stage: StageName, id: string): StageProvider<any, any>;
  listByStage(stage: StageName): StageProvider<any, any>[];
  resolveFromSettings(stage: StageName): StageProvider<any, any>;
}
```

At startup `src/main/providers/index.ts` imports every provider module, each of which calls `registry.register(...)`. Adding a new model is a three-step operation:
1. Create `src/main/providers/compose/my-new-model.ts` implementing `ComposeProvider`.
2. Add the export to `src/main/providers/index.ts`.
3. (Optional) Extend the Settings UI — it auto-populates dropdowns from `registry.listByStage(...)`, so this is usually free.

### Runtime Selection

Per-run, users can override any stage's provider via:

1. **Global defaults** in Settings (Settings → Models → per-stage dropdown, populated from registry).
2. **Per-run override** on the main screen (a "Compose model" dropdown already exists in the UX; the same pattern extends to all five stages behind a **Advanced** disclosure).
3. **Programmatic override** in the tRPC call (not user-facing, but enables future CLI or automation).

### Failure Routing

Each stage in Settings accepts an **ordered list** of provider IDs (primary + fallbacks), not a single ID. The orchestrator tries them in order on retryable errors (quota, timeout, safety refusal when `allow_fallback_on_refusal: true`). The UI surfaces which provider actually produced each stage's output.

### Credential Decoupling

Providers declare `requiresCredentials`. The Settings page only prompts for credentials that at least one *enabled* provider needs. Users with only Anthropic and fal.ai keys never see a Google or OpenAI field.

### Built-in Provider Inventory

Shipped in the first release (all selectable from dropdowns, none hardcoded as defaults in code — defaults are seeded into user settings on first run and editable immediately):

| Stage | Provider IDs |
|-------|--------------|
| Extract | `imgly-bg-removal`, `photoroom-api`, `bria-rmbg-api` |
| Understand | `gemini-2.5-flash`, `claude-haiku-4-5`, `gpt-5-mini`, `qwen-2.5-vl` |
| Plan | `claude-sonnet-4-6`, `claude-opus-4-7`, `gpt-5`, `gemini-2.5-pro`, `deepseek-v3` |
| Compose | `nano-banana`, `flux-kontext-pro`, `flux-kontext-max`, `seedream-4`, `gpt-image-1`, `qwen-image-edit` |
| Overlay | `napi-canvas` (built-in; future: `skia-advanced`) |

## 4. Shipped Providers (per-stage detail)

The tables below describe the providers that ship with the first release. None are compiled-in defaults — they're seeded into Settings and any can be re-ordered, disabled, or replaced without code changes.

### Stage 1 — Subject Extract (local or API)

| Provider ID | Cost | Quality | Notes |
|-------------|------|---------|-------|
| `imgly-bg-removal` | free | ★★★★ | ONNX-based, pure CPU, MIT license, 3–8s/image |
| `bria-rmbg-api` | free / commercial license | ★★★★★ | Better edges; commercial use needs a license |
| `photoroom-api` | ~$0.003/image | ★★★★★ | Purpose-built for e-commerce cutouts |

**Seeded choice on first run: `imgly-bg-removal`.** Output only feeds the VLM, so best-in-class matting is overkill. Users can promote `photoroom-api` at any time from Settings.

### Stage 2 — Product Understanding (VLM)

| Provider ID | Cost/image | Notes |
|-------------|------------|-------|
| `gemini-2.5-flash` | ~$0.001 | Cheap, fast, reliable JSON mode |
| `claude-haiku-4-5` | ~$0.004 | Richer descriptive output |
| `gpt-5-mini` | ~$0.003 | Balanced alternative |
| `qwen-2.5-vl` | ~$0.0005 | Cheapest via DashScope |

**Seeded choice on first run: `gemini-2.5-flash`.**

### Stage 3 — Scene & Copy Plan (LLM) ★ critical for copy quality

| Provider ID | Cost/call | Notes |
|-------------|-----------|-------|
| `claude-sonnet-4-6` | ~$0.005–0.02 | Noticeably better English marketing tone; stable structured output |
| `claude-opus-4-7` | ~$0.05 | For high-value products where tone matters most |
| `gpt-5` | ~$0.01 | Creative but occasionally over-embellishes |
| `gemini-2.5-pro` | ~$0.003 | Budget alternative |
| `deepseek-v3` | ~$0.0005 | Cheapest; acceptable English |

**Seeded choice on first run: `claude-sonnet-4-6`.** The English copy tone is the most visible quality lever in this pipeline; Sonnet is worth the small premium over cheaper LLMs. Switchable to any other shipped provider from Settings.

### Stage 4 — Compose Image (multimodal edit) ★★ core choice

| Provider ID | Cost/image | Subject consistency | Speed | Channel |
|-------------|------------|---------------------|-------|---------|
| `nano-banana` (`gemini-2.5-flash-image`) | ~$0.04 | ★★★★★ | 3–8s | Google AI Studio / Vertex AI |
| `flux-kontext-pro` | ~$0.04 | ★★★★★ | 5–15s | BFL / fal.ai / Replicate |
| `flux-kontext-max` | ~$0.08 | ★★★★★ | 8–20s | Same; higher fidelity |
| `seedream-4` | ~¥0.2 | ★★★★ | 5–15s | Volcengine (CN) |
| `qwen-image-edit` | ~$0.01 | ★★★★ | 10–20s | DashScope |
| `gpt-image-1` edit | $0.17–0.25 | ★★★★ | 15–30s | OpenAI |

**Seeded choice on first run: `nano-banana` (primary) + `flux-kontext-pro` (fallback).** Both currently lead the "place this product in a new scene while preserving identity" task. All six providers ship with the first release and can be reordered in Settings — no model is hardcoded in the orchestrator.

### Stage 5 — Text Overlay (local)

- **`@napi-rs/canvas`** (Skia-based) — supports custom fonts, strokes, shadows, advanced text layout.
- Fonts bundled in `resources/fonts/`: Inter, Playfair Display, Bebas Neue, DM Serif Display, Montserrat. Layout templates map product `style_tone` → font pairing.

### Cost Envelope — seeded configuration

```
Extract:     free        imgly-bg-removal
Understand:  ~$0.001     gemini-2.5-flash
Plan:        ~$0.010     claude-sonnet-4-6
Compose:     ~$0.040     nano-banana
Overlay:     free        napi-canvas
──────────────────────
Total:       ≈ $0.05 per image (≈ ¥0.35)
```

Two API accounts satisfy the seeded configuration: Google AI Studio + Anthropic. Swapping to other shipped providers may require additional keys (BFL / fal.ai / OpenAI / DashScope / Volcengine / Photoroom). Providers whose required credentials are absent are greyed out in the Settings dropdown with a "Add credentials" CTA; they never cause runtime errors because the registry filters unavailable providers from default selection lists.

## 5. Tech Stack

| Layer | Choice |
|-------|--------|
| Runtime | Node.js 20+ with TypeScript |
| Package manager | pnpm |
| Desktop shell | Electron + electron-vite (build) + electron-builder (package) |
| UI | React 18 + Tailwind CSS + shadcn/ui |
| LLM / VLM client | Vercel AI SDK (`ai` + `@ai-sdk/anthropic` + `@ai-sdk/google` + `@ai-sdk/openai`) |
| Structured output | `generateObject` + Zod |
| Background removal | `@imgly/background-removal-node` |
| Pixel operations | `sharp` |
| Text rendering | `@napi-rs/canvas` |
| Image-edit providers | direct SDK calls (`@google/genai`, BFL fetch, `@fal-ai/client`) |
| Settings storage | `electron-store` + Electron `safeStorage` (OS keychain) |
| Logging | `pino` |
| IPC | `electron-trpc` (type-safe main↔renderer RPC) |

## 6. Directory Structure

```
vibe_coding/
├── package.json
├── electron.vite.config.ts
├── tsconfig.json
├── .env.example
├── resources/
│   ├── icon.png
│   └── fonts/
├── src/
│   ├── main/                        # Electron main process
│   │   ├── index.ts                 # app entry, window creation
│   │   ├── ipc/                     # electron-trpc routers
│   │   │   ├── pipeline.router.ts
│   │   │   ├── runs.router.ts
│   │   │   ├── providers.router.ts  # list/inspect registered providers
│   │   │   └── settings.router.ts
│   │   ├── pipeline/
│   │   │   ├── orchestrator.ts      # stage sequencing + progress events
│   │   │   ├── contracts.ts         # StageProvider<TIn,TOut> interfaces
│   │   │   └── stages/              # per-stage runner (interface-only)
│   │   │       ├── extract.ts       # runs whichever ExtractProvider is selected
│   │   │       ├── understand.ts
│   │   │       ├── plan.ts
│   │   │       ├── compose.ts
│   │   │       └── overlay.ts
│   │   ├── providers/               # concrete implementations, grouped by stage
│   │   │   ├── index.ts             # imports all, populates registry
│   │   │   ├── registry.ts          # ProviderRegistry implementation
│   │   │   ├── extract/
│   │   │   │   ├── imgly-bg-removal.ts
│   │   │   │   ├── photoroom-api.ts
│   │   │   │   └── bria-rmbg-api.ts
│   │   │   ├── understand/
│   │   │   │   ├── gemini-2.5-flash.ts
│   │   │   │   ├── claude-haiku-4-5.ts
│   │   │   │   ├── gpt-5-mini.ts
│   │   │   │   └── qwen-2.5-vl.ts
│   │   │   ├── plan/
│   │   │   │   ├── claude-sonnet-4-6.ts
│   │   │   │   ├── claude-opus-4-7.ts
│   │   │   │   ├── gpt-5.ts
│   │   │   │   ├── gemini-2.5-pro.ts
│   │   │   │   └── deepseek-v3.ts
│   │   │   ├── compose/
│   │   │   │   ├── nano-banana.ts
│   │   │   │   ├── flux-kontext-pro.ts
│   │   │   │   ├── flux-kontext-max.ts
│   │   │   │   ├── seedream-4.ts
│   │   │   │   ├── qwen-image-edit.ts
│   │   │   │   └── gpt-image-1.ts
│   │   │   └── overlay/
│   │   │       └── napi-canvas.ts
│   │   ├── storage/
│   │   │   ├── runs-dir.ts
│   │   │   └── settings.ts
│   │   └── schemas.ts               # Zod schemas
│   ├── preload/
│   │   └── index.ts                 # exposes trpc client via contextBridge
│   └── renderer/
│       ├── main.tsx
│       ├── App.tsx
│       ├── routes/
│       │   ├── home.tsx             # upload + generate
│       │   ├── runs.tsx             # history gallery
│       │   └── settings.tsx         # API keys, defaults, budgets
│       ├── components/
│       │   ├── Dropzone.tsx
│       │   ├── StagePipeline.tsx    # live 5-step progress + previews
│       │   ├── LayoutPicker.tsx
│       │   ├── SizePicker.tsx
│       │   ├── ProviderPicker.tsx   # reusable per-stage dropdown
│       │   └── CostEstimator.tsx
│       ├── hooks/
│       │   └── useRunStream.ts      # subscribes to progress events
│       └── styles/
├── layouts/                         # JSON overlay templates
├── prompts/                         # LLM/VLM prompt templates
└── runs/                            # runtime output (user-data dir in production)
```

## 7. Main Window UX

Three-column layout inside the Electron window:

- **Left panel (280px):** Dropzone · Size · Style · Layout · Compose model · Candidates · Dry-run · Generate button · cost/latency estimate · **Advanced ▾** (expands to show per-stage provider dropdowns for Extract / Understand / Plan / Overlay)
- **Center panel (fluid):** Live 5-stage progress strip · current stage preview image · draft copy text · per-stage badge showing which provider ran
- **Right panel (320px):** Recent runs thumbnail grid · live log tail

### Settings → Models page

A dedicated Settings page lists all registered providers grouped by stage. For each stage the user sees:

- An **ordered list** of enabled providers (drag to reorder; first is primary, rest are fallbacks)
- A toggle per provider to enable/disable
- Credential status (green/red dot) per provider
- "Test" button that invokes the provider's `healthCheck()`
- "Add provider" affordance that hints at documentation for writing a new plugin

Changes take effect immediately on the next run — no restart required.

### Interaction Notes

- All parameters default to **Auto** (LLM decides) — user only intervenes if unsatisfied.
- Pipeline is visually incremental: every stage output streams to the center pane in real time via tRPC subscription.
- Clicking a recent run opens a detail page with a **Replay from Stage N** button plus a per-stage model override, enabling cheap A/B across any combination of providers without re-running upstream stages.

## 8. Error Handling

### Failure Classes

| Class | Example | Strategy |
|-------|---------|----------|
| Transient | 429, 5xx, network timeout | Exponential backoff, 3 retries |
| Input | Corrupt image, invalid size | Fail fast, show inline error |
| Model refusal | Content policy violation | Surface raw provider error verbatim |
| Stage timeout | Compose >60s | Abort, prompt to switch fallback model |

### Principles

1. **Each stage is independently retryable.** Failure preserves all upstream artifacts.
2. **Startup health check** invokes each enabled provider's `healthCheck()`. Missing/invalid credentials surface as a header banner; unhealthy providers are temporarily demoted to the end of their stage's fallback order.
3. **Fallback is user-configured, not hardcoded.** Each stage carries an ordered list of provider IDs in settings (primary first, fallbacks after). On retryable errors the orchestrator walks the list. Users who want strict single-provider behavior just keep the list at length 1.
4. **Errors never silently downgrade** — the UI and `metadata.json` always record which provider produced each stage's output, and a yellow "fallback used" badge appears when the primary was skipped.

## 9. Testing Strategy

| Layer | Tool | Scope |
|-------|------|-------|
| Unit | Vitest | Prompt builders, Zod schemas, layout engine (line-break / auto-size), cost estimator |
| Integration | Vitest + msw | Each stage against recorded API responses; asserts shape + timings |
| Visual regression | Vitest + pixelmatch | Stage 5 overlay against golden images (typography changes caught) |
| E2E | Playwright for Electron | Full flow: drop image → Generate → progress → final image visible; all APIs mocked via msw |
| Manual validation | Curated dataset | 10–15 diverse product images (apparel, 3C, food, beauty, home) committed to repo |

Unit + integration run in CI. Visual regression + E2E run locally only (Electron-on-CI is not worth the setup for a personal tool).

## 10. Cost Control

Four gates, layered:

1. **Pre-flight estimate** — before Generate, UI shows `Est. $0.05 · ~12s`, recomputed live as settings change.
2. **Per-run accounting** — `runs/<ts>/metadata.json` records every API call's tokens, images, and USD cost. Settings page aggregates by month and provider.
3. **Monthly budget** — user-set ceiling (default $20). Yellow banner at 80%, blocking dialog at 100% (overrideable).
4. **Dry-run mode** — skips Stage 4 (the expensive one); useful when iterating on Plan output.

### Cost-saving knobs (documented, user opt-in)

- Auto-resize input images to 2048px max-edge before API upload.
- Cache `ProductUnderstanding` by SHA-256 of input image (avoids re-running VLM while iterating on Plan).
- Default candidate count is 1; raise to 3–5 only when needed.
- Batch mode: same Plan → multiple sizes/layouts shares Stage 4 output, only Stage 5 repeats.

## 11. Security & Privacy

1. **API keys stored via Electron `safeStorage`** (OS keychain: macOS Keychain / Windows DPAPI / Linux libsecret), wrapped by `electron-store`. No plaintext `.env` in production.
2. **Keys never cross the IPC boundary.** All outbound API calls originate in the main process; the renderer receives only a sanitized "provider status" view (configured? healthy?).
3. **Electron security baseline:**
   - `contextIsolation: true`
   - `nodeIntegration: false`
   - Strict renderer CSP (allow `file://` for local `runs/` images only)
   - Preload exposes only the tRPC client, no arbitrary Node APIs
4. **All IPC inputs validated with Zod.** Reject path traversal, unexpected types.
5. **Transparent data egress.** First-run wizard explicitly tells the user: "Your product images are sent to Google / Anthropic / [selected compose provider]. Runs themselves are stored locally." User consent required to proceed.

## 12. Observability

- **`runs/<ts>/metadata.json`** — models used, seeds, prompts, per-stage duration, cost, and raw provider response summaries.
- **`runs/<ts>/run.log`** — pino structured logs (one JSON line per event); tailed live in the right panel.
- **Settings dashboard** — monthly usage rollup by provider; running total vs. budget.

## 13. First-Run Onboarding

1. Welcome screen with the data-egress disclosure.
2. API key entry form. The wizard walks the user through every stage and, per stage, asks which credentials they want to enable. At minimum the user must enable one provider for each of Understand / Plan / Compose (Extract defaults to the local `imgly-bg-removal`, Overlay is local).
3. Validation call per entered key via the corresponding provider's `healthCheck()`.
4. Seeded selection: for each stage, the first successfully-validated provider (in the recommended order documented in Section 4) becomes the primary; others become fallbacks. The user can reorder immediately on the same screen.
5. Drop into Home with a bundled sample product image pre-loaded for a first test run.

## 14. Open Questions / Deferred

- **Packaging & distribution:** electron-builder with notarization is planned, but auto-update (electron-updater) is deferred — a personal tool rarely needs it.
- **Multi-candidate mode:** scaffolded via a `candidates: number` parameter on the Compose stage, but the full workflow (parallel generation of N scene variants + VLM auto-scoring for best-pick selection) and its UI (grid picker) are deferred to v2.
- **Reference scene images** (IP-Adapter-style style transfer): parked; revisit if "I want this look" becomes a felt need.
- **Batch folder mode:** possible future addition; current MVP is one-image-at-a-time.
