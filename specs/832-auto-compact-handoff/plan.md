# Implementation Plan: Auto-Compact Handoff Document

**Branch**: `832-auto-compact-handoff` | **Date**: 2026-09-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/832-auto-compact-handoff/spec.md`

## Summary

Every auto-compaction should leave behind more than a freeform summary. Today the engine
(`AgentFullCompactionService`) auto-compacts at the configured threshold or on overflow
recovery, splices a summarizer-produced summary into the history, and moves on; the summary
is unstructured, lives only inside the conversation, and cannot be picked up cold.

This feature adds a pre-replacement artifact step to that same flow: when a compaction with
`source: 'auto'` begins and the `compaction-handoff` experimental flag is on, the service
runs one extra LLM call (same squeeze-model cascade) that renders a structured handoff
document — resume pointer, session gist, current state, in-flight threads with next actions,
gotchas, files and artifacts touched, open questions — and persists it write-once as an
atomic file beside the session's other records. The model-facing replacement summary gains a
pointer to the document, the `compaction.completed` event (and the durable
`context.apply_compaction` record via `CompactionResult`) carries its path, and the TUI
completion header shows it. Generation failure warns and degrades to today's behavior; it
can never block or fail the compaction.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js `>=24.15.0` (root `engines`), pnpm `10.33.0`
workspace.

**Primary Dependencies**: none added. Zod (config/event schemas), vitest (tests). Behavior
lands in `@moonshot-ai/agent-core-v2`; `packages/kap-server`, `packages/klient`, and
`apps/kimi-code` mirror the widened event surface only.

**Storage**: the session's existing storage area under
`<home>/sessions/<workspaceId>/<sessionId>/agents/<agentId>/` — one new write-once file per
handoff at `handoff/<timestamp>-<seq>.md`, written through `IBlobStore` (atomic), following
the `AgentPlanService` precedent. No new store, no config-file changes.

**Testing**: vitest, targeted files (`pnpm vitest run <path>`). Primary suites:
`packages/agent-core-v2/test/agent/fullCompaction/` (engine behavior),
`test/session/compaction/` (flag/config), `test/wire/wireManifest.test.ts` (freshness),
`packages/kap-server/test/sessionEventBroadcaster.test.ts`,
`apps/kimi-code/test/tui/controllers/session-event-handler-compaction.test.ts` and
`apps/kimi-code/test/tui/components/dialogs/compaction.test.ts`.

**Target Platform**: macOS / Linux / Windows CLI and the kap-server host. No
platform-specific code.

**Project Type**: monorepo — engine packages plus a CLI/TUI app.

**Performance Goals**: zero steady-state cost. With the flag off (default), auto-compaction
performs exactly the calls it performs today. With the flag on, one extra LLM request per
auto-compaction (an operation that is by definition rare and session-saving), executed
before the history is replaced.

**Constraints**:

- `packages/agent-core-v2`, `packages/kap-server`, `packages/transcript` are comment-free
  zones — no comments or JSDoc anywhere under `src/`/`test/`/`scripts/`
  (`scripts/check-no-comments.mjs`, run by `pnpm lint`).
- No external dependency may be added.
- Optional object properties are passed as `undefined`, never via conditional spread, and
  their types do not additionally allow `undefined`.
- Business domains own no persistence: no `node:fs` in the compaction domain — writes go
  through `IBlobStore` (`packages/agent-core-v2/AGENTS.md`, "Persistence").
- New telemetry properties must be registered in `src/app/telemetry/events.ts` before
  emission; file paths are never registered as telemetry properties.
- Durable wire record changes require `pnpm gen:wire-manifest`
  (`test/wire/wireManifest.test.ts` enforces freshness).
- Tests live under `<package>/test/**`; new tests extend the existing fullCompaction test
  files wherever one exists.

**Scale/Scope**: one extra file per auto-compaction per agent, bounded by how often a
session crosses the compaction threshold. No new user-facing configuration beyond the flag.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**The project constitution is still an unfilled template.** `.specify/memory/constitution.md`
contains only placeholders, so there are no ratified gates to check this feature against.
Every gate below is quoted from a binding source that does exist — the root `AGENTS.md`, the
package `AGENTS.md` files, and `scripts/check-*.mjs` — and each names its enforcement point.

| Gate | Source | Status for this feature |
|------|--------|-------------------------|
| Comment-free zones: no comments or JSDoc in `agent-core-v2`/`kap-server`/`transcript` `src/`/`test/`/`scripts/` | root `AGENTS.md`; enforced by `scripts/check-no-comments.mjs` under `pnpm lint` | Pass — new engine files are comment-free |
| No new external dependency | root `AGENTS.md` | Pass — zod and vitest already exist |
| Optional properties: no conditional spread, no `T \| undefined` in optional slot types | root `AGENTS.md` | Pass — `CompactionResult.handoffPath?: string` |
| Business domains own no persistence; no `node:fs` in business code | `packages/agent-core-v2/AGENTS.md` ("Persistence") | Pass — the handoff file is written through `IBlobStore.put`, which performs the atomic storage write; the path is derived from the agent's storage scope, not hand-joined onto fs |
| Telemetry events registered before emission; no file paths as properties | `packages/agent-core-v2/AGENTS.md` ("Telemetry") | Pass — the existing `compaction_finished` payload gains a registered boolean `handoff_generated`; the path travels only in events/transcript, never telemetry |
| Durable wire records regenerated after schema change | `packages/agent-core-v2/AGENTS.md` ("Docs"); `test/wire/wireManifest.test.ts` | Pass — `pnpm gen:wire-manifest` runs after `ContextApplyCompaction`/`CompactionResult` gain `handoffPath` |
| Experimental features are flag-gated, default off, declared in the owning domain | root `AGENTS.md` ("Experimental Features"); `docs/flag.md` reference in package AGENTS.md | Pass — `compaction-handoff` flag declared in `src/agent/fullCompaction/flag.ts`, default `false`, per-flag env `KIMI_CODE_EXPERIMENTAL_COMPACTION_HANDOFF` |
| Fork-owned behavior must survive the daily upstream sync | root `AGENTS.md` ("Fork Upstream Sync Policy") | **Action required** — the new files and markers are appended to `.github/FORK_OWNED_FILES` at delivery time |
| Changeset required before PR | root `AGENTS.md` + `gen-changesets` skill | **Action required** — one changeset under `.changeset/` at delivery time if/when a PR is requested; no `major` without explicit user confirmation |

Re-check after Phase 1 design: unchanged. The design adds no dependency, no comment, no raw
fs access, and no new config section (so no config-manifest regeneration).

## Project Structure

### Documentation (this feature)

```text
specs/832-auto-compact-handoff/
├── plan.md              # This file
├── research.md          # Phase 0 output — decisions (a)-(g)
├── data-model.md        # Phase 1 output — entities, fields, naming, validation
├── quickstart.md        # Phase 1 output — runnable validation scenarios
├── contracts/           # Phase 1 output
│   ├── handoff-generation.md   # engine-side generation + persistence contract
│   └── compaction-events.md    # widened event surface: engine → kap-server → klient → TUI
└── tasks.md             # Phase 2 output (/skill:speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
packages/agent-core-v2/
├── src/agent/fullCompaction/
│   ├── flag.ts                       # NEW: compaction-handoff flag definition (registerFlagDefinition)
│   ├── handoffInstruction.ts         # NEW: renders handoff-instruction.md (+ previous-handoff pointer)
│   ├── handoff-instruction.md        # NEW: handoff prompt template (fixed section structure)
│   ├── handoffDocument.ts            # NEW: generation orchestration — LLM call, blob write,
│   │                                 #   naming/sequence, resume pointer; returns {path, doc}
│   ├── types.ts                      # CompactionResult += handoffPath?: string
│   └── fullCompactionService.ts      # compactionRound: when source==='auto' && flag on, generate
│                                     #   handoff before applyCompaction; append pointer footer to the
│                                     #   model-facing summary; try/catch → WarningIssued degrade
├── src/agent/contextMemory/contextEvents.ts   # ContextApplyCompaction schema union shape 1 += handoffPath?
├── src/app/telemetry/events.ts                # compaction_finished properties += handoff_generated
└── docs/wire-manifest.d.ts                    # regenerated (pnpm gen:wire-manifest)

packages/kap-server/
└── src/protocol/events-zod.ts        # compactionResultSchema += handoffPath optional

packages/klient/
└── src/contract/agent/events.ts      # compactionCompletedEventSchema.result += handoffPath optional

apps/kimi-code/
├── src/tui/controllers/session-event-handler.ts  # pass result.handoffPath through to the block
├── src/tui/controllers/session-replay.ts         # replay path passes handoffPath into compactionData
├── src/tui/types.ts                              # CompactionTranscriptData += handoffPath?: string
└── src/tui/components/dialogs/compaction.ts      # buildHeader: "Handoff saved: <path>" line

.github/FORK_OWNED_FILES             # guard-list entries for the new fork-owned files
.changeset/<generated>.md            # delivery-time changeset (only when a PR is requested)
```

Tests (extend the existing file for the component where one exists):

```text
packages/agent-core-v2/test/agent/fullCompaction/fullCompaction.test.ts   # auto+flag → handoff file,
                                     #   pointer in summary, event payload; flag off → no call/file;
                                     #   generation failure → compaction completes; manual → skipped;
                                     #   second compaction → new file, resume pointer
packages/agent-core-v2/test/agent/fullCompaction/handoffDocument.test.ts  # NEW: naming/sequence,
                                     #   blob write, resume pointer, prompt rendering
packages/agent-core-v2/test/wire/wireManifest.test.ts                     # regenerated manifest freshness
packages/kap-server/test/sessionEventBroadcaster.test.ts                  # completed event carries path
apps/kimi-code/test/tui/controllers/session-event-handler-compaction.test.ts  # path flows to block
apps/kimi-code/test/tui/components/dialogs/compaction.test.ts             # header shows handoff line
```

**Structure Decision**: no new package and no new domain. The feature splits along the
boundary the engine already draws: the **fullCompaction domain** owns the whole behavior
(flag, prompt, generation, persistence via the existing stores, summary pointer), the
**contextMemory domain** carries the path inside the existing durable compaction record, and
the edge packages (kap-server zod, klient contract, TUI) only mirror the widened payload.
Nothing upstream of the engine changes behavior: manual compaction is untouched, and the
flag keeps the feature off everywhere until enabled.

## Complexity Tracking

> Recorded because the Constitution Check found no ratified constitution to violate, but one
> deliberate structural change needs justification.

| Change | Why needed | Simpler alternative rejected because |
|--------|------------|--------------------------------------|
| `CompactionResult` gains `handoffPath?: string`, flowing into the durable `context.apply_compaction` record and the observable `compaction.completed` event | One source of truth for "this compaction produced this handoff": replay, live TUI, kap-server and klient all read the same field instead of inventing per-surface side channels; FR-005/FR-006 both read it | A free-text pointer only inside the summary string: FR-006 requires the *event payload* to carry the path (clients must not parse prose), and replay would lose the pointer's structure. A separate durable `handoff.created` event: a second record to replay/fold in every consumer for a fact that is already owned by the compaction result |

## Delivery notes

- Root `AGENTS.md` requires a changeset before any PR and forbids committing scratch or
  handoff notes; validation scripts used by quickstart.md belong under `.tmp/` (gitignored),
  and `handoffs/` is gitignored repo-wide.
- The `handoff` skill document that inspired the section structure lives at
  `~/.agents/skills/handoff/SKILL.md` (user-level, outside the repo); the template embedded
  in `handoff-instruction.md` is a fork-owned rewrite of that structure, not a copy of any
  in-repo file.
