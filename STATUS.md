# Gloss — Status & Handoff

_Last updated: 2026-06-10_

Pick-up notes for resuming this project. For what the app *is* and how to run it, see `README.md`.

## TL;DR

A branching reading app is **built, reviewed, and committed** — all phases of the plan
(`~/.claude/plans/when-long-form-text-linked-reef.md`) are done. The only thing left
is a live end-to-end run, which is **blocked on an Anthropic API key** (none was
present at build time). Everything else is verified in a real browser.

## How to resume

```sh
cd ~/git/reader
cp .env.example .env        # add ANTHROPIC_API_KEY (see "Billing" below)
pnpm install               # if node_modules is gone
pnpm dev                   # server :8787, app http://localhost:5173
```

Then do the **pending E2E checks** (task list below).

## What's verified ✅

Driven in a real browser via chrome-devtools, up to the auth boundary:

- Monorepo scaffolding, both dev servers, Vite proxy, `/api/health`.
- Document create → markdown renders on the React Flow canvas.
- Text selection → floating toolbar (Explain / More context / Ask…) → branch node
  + span-anchored edge created.
- Highlight injection with quote-relocation (offsets into rendered text).
- SSE pipeline streams `start` → `delta`/`error` correctly (auth error surfaced
  inline, as expected without a key).
- Reload restores full canvas: nodes, edges, highlights, message history.
- Branch delete cascades to descendants (verified 2→1 nodes/marks/edges).
- Image paste → canvas downscale/encode → server saves asset → vision SSE
  (to auth boundary).
- All packages typecheck clean.

## What's NOT verified yet ⛔ (needs API key)

These all require live model calls:

1. Token-by-token streamed answer rendering in a branch.
2. **Prompt cache working**: `cache_read_input_tokens > 0` on the 2nd+ request for a
   document (server logs this per reply; also shown in the UI usage badge).
3. Nested-branch breadcrumb quality (branch off an AI answer → does the reply use
   ancestor context?).
4. Image transcription quality (paste a real screenshot → readable markdown).

➡️ The `ANTHROPIC_API_KEY` currently in `.env` is **invalid** (returns 401 `invalid
x-api-key`) — it's a placeholder. Replace it with a real Console key, then ask Claude
to "run the E2E verification". For OpenAI models, also add a valid `OPENAI_API_KEY`.

## Multi-provider + cost (added)

- **Providers:** Claude (Anthropic) and ChatGPT (OpenAI), behind a common
  streaming interface in `server/src/ai/providers/`. `chat.ts` dispatches by model.
- **Model picker:** top bar + home page. Provider-grouped; models whose provider
  has no API key show as disabled. Selection is global, persisted to localStorage.
- **Cost readout:** per-message (usage badge), per-branch (branch header), and
  **document total in the top bar**. Computed client-side from `shared/models.ts`
  pricing × stored per-message usage — it's an **estimate**; verify prices against
  provider pages (snapshot 2026-06, links in `models.ts`).
- **Keys:** set `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY` in `.env`. `/api/config`
  reports which are present; only keyed providers are selectable.
- **Default model: `claude-sonnet-4-6`** (`DEFAULT_MODEL` in `shared/models.ts`).
  $3/$15 per MTok, vision, 2048-token cache minimum. Per-message `model` is stored
  so cost stays accurate even if you switch models mid-document.

## Key decisions made
- **UX: spatial canvas** (React Flow) — user-chosen over inline/side-thread.
- **Stack: Vite+React client + Hono server**, structured so the server runs unchanged
  inside Electron later (v2 desktop build — designed for, not built).
- **API key: server-side `.env`** (user explicitly rejected bring-your-own-key).
- **v1 AI scope: whole-document awareness via prompt caching only.** No web
  search/fetch tools. (Candidate v2 features the user considered but didn't pick:
  cross-branch awareness, auto-suggested branch points.)

## Billing — how to get an API key

A **Max subscription does NOT give Console API credits** (what this app uses). Two paths:

1. **Now (recommended):** buy prepaid Console credits ($5 min) at
   console.anthropic.com → get an `ANTHROPIC_API_KEY`. With Sonnet 4.6 + caching, a
   branch reply on a ~10k-token doc is ≈1¢, so $5 lasts a long time.
2. **After June 15, 2026:** subscriptions gain a monthly programmatic credit pool
   (Max 5x: $100/mo, Max 20x: $200/mo) — but it only covers the **Claude Agent SDK**,
   not the plain Messages API this app uses. Spending those credits would require
   rewiring `server/src/ai/` to the Agent SDK with subscription auth. Revisit once the
   feature ships and its auth details are concrete.

## Architecture map

```
shared/src/    types.ts (data model), schemas.ts (zod), sse.ts (event contracts)
server/src/
  app.ts            createApp() — pure Hono, Electron-mountable
  index.ts          node entry (only file with @hono/node-server)
  config.ts         resolveDataDir(), port() — process.env only
  ai/client.ts      ← MODEL constant lives here
  ai/prompts.ts     ← prompt-cache correctness (system blocks byte-identical)
  ai/branchChat.ts  streaming call + history mapping
  ai/extractImage.ts vision transcription
  store/store.ts    in-memory + debounced atomic JSON writes, cascade delete
  routes/           documents.ts, branches.ts (SSE), canvas.ts
client/src/
  canvas/Canvas.tsx          React Flow setup, derived edges, position sync
  canvas/SelectionOverlay.tsx floating branch toolbar
  canvas/AnchorHandles.tsx   span-anchored edge handles
  reading/selection.ts       DOM Range → Anchor offset mapping
  reading/highlights.ts      <mark> injection + quote relocation
  state/canvasStore.ts       zustand: nodes, streaming, abort, cascade
  api/{client,sse,image}.ts  relative /api, POST-SSE reader, image encode
```

Data persists as JSON under `~/Library/Application Support/reader`
(override with `GLOSS_DATA_DIR`).

## Git log

- `7b8c6ce` Switch to claude-sonnet-4-6 for cost efficiency
- `d568c63` Apply confirmed findings from multi-agent review
- `8d8bea3` Initial build

## Multi-agent review outcome

A 19-agent review (3 reviewers × adversarial verification) ran post-build; 10 findings
confirmed, 8 applied (commit `d568c63`), 2 declined with reasons. Fixed: concurrent
write corruption, unbounded image payload (OOM), zombie-branch persistence on
delete-mid-stream, SSE parser crash on malformed frames, React Flow position
snap-back, autoscroll thrash.

## Likely next steps (after E2E passes)

- Optional cost tuning: add `output_config: { effort: 'medium' }` in
  `branchChat.ts` for cheaper simple-explain turns (only if replies feel pricey).
- v2: Electron packaging (server is already structured for it).
- Possible v2 AI features deferred from v1: cross-branch awareness, auto-suggested
  branch points, web search/fetch tools.
