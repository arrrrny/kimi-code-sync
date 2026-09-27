# Phase 0 Research: Auto-Compact Handoff Document

Every decision below is grounded in the code as it exists on branch `832-auto-compact-handoff`
(based on master `aafdca9be`), at the line numbers cited. Where earlier reconnaissance notes
disagreed with the code, the code won and the correction is recorded.

## (a) Where generation hooks into the compaction flow

**Decision**: inside `AgentFullCompactionService.compactionRound`
(`packages/agent-core-v2/src/agent/fullCompaction/fullCompactionService.ts:934-953`), after
the summarization response is in hand but **before** `this.context.applyCompaction(...)`
(`:938-942`) replaces the history. The generation helper receives the same pre-compaction
history the summarizer saw.

**Rationale**: `applyCompaction` is the point of no return — it dispatches
`ContextApplyCompaction` and splices the kept messages + summary user message
(`src/agent/contextMemory/contextMemoryService.ts:96-128`), rebasing the token counter. FR-001
requires the handoff to be produced from the pre-compaction history, so the only correct side
of that call is before it. `compactionRound` is the one place that already holds the history,
the resolved model binding, the `llmRequester`, and the result assembly.

**Alternatives considered**:

- *The `onWillCompact` hook* (`fullCompaction.ts:22-34`, run at `fullCompactionService.ts:671`).
  Rejected: the hook payload `FullCompactionTask` is all-`readonly` and no hook output is
  consumed — subscribers can observe the task but cannot attach anything to the result. Using
  it would mean stashing the path in service state keyed by task and reading it later, which is
  a hidden channel where the domain should have a direct call. The hook stays what it is: an
  extension seam for *external* participants (the externalHooks feature registers it at
  `src/features/externalHooks/agent/agentExternalHooksService.ts:262-272`).
- *Inside the summarization prompt itself* (ask the model to emit summary + handoff in one
  call). Rejected: the summary prompt (`compaction-instruction.md`) is tuned for wire-safe
  summarization and its output is post-processed by `postProcessSummary` and the recovery
  footer; doubling its job couples two artifacts with different failure modes and makes the
  handoff's absence indistinguishable from a formatting miss. FR-007's clean failure boundary
  needs a separate call.
- *At `begin()`* (`fullCompactionService.ts:354-390`). Rejected: the flow between `begin` and
  `compactionRound` includes quiescence and pre-shrink steps (`preShrinkHistoryToWindowBudget`,
  `:998-1022`); generating before them would summarize a history that can still change shape.

**Note on the summarizer's own input**: for the overflow-recovery path the history may already
have been pre-shrunk; FR/spec edge case accepts the handoff being generated from the
pre-shrunk history the recovery path prepares — same input the summary itself sees.

## (b) How the content is generated

**Decision**: one extra LLM request per auto-compaction, issued through the same
`llmRequester.start(...)` the summarizer uses, with the same model binding produced by
`compactionModelBindingFor(...)` (`fullCompactionService.ts:683-765`, including the mid-flight
fallback at `:856-908` that emits the `'compaction-model-fallback'` warning). New
`requestKind: 'full_compaction_handoff'`; `llmRequesterService.requestKindForRecord`
(`src/agent/llmRequester/llmRequesterService.ts:1001-105`) learns to classify it as
`'compaction'` so the durable `llm.request` record (`llmRequestOps.ts:43`,
`kind: z.enum(['loop', 'compaction'])`) stays honest. Telemetry `request_kind` is a free
string (`requestKindForTelemetry`, `:986-990`), so no vocabulary change is needed there.

The prompt is a new template `handoff-instruction.md` beside the existing
`compaction-instruction.md`, rendered by `handoffInstruction.ts` (mirroring
`compactionInstruction.ts:9-15`). It instructs the model to produce the fixed section
structure of FR-002 — resume pointer, session gist, current state, in-flight threads with the
next concrete action for each, gotchas, files and artifacts touched, open questions — and is
rendered with two inputs: the previous handoff's path (when one exists) and the instruction
context already carried by the compaction. Output post-processing is deliberately minimal: the
document is stored as the model produced it (best effort), per the spec's "does not claim
structure it cannot verify" edge case.

**Rationale**: FR-009 mandates the cascade reuse; a separate lighter model would add a second
resolution path the fork's squeeze-model feature already owns. One call keeps the cost story
in the spec's assumptions.

**Alternatives considered**:

- *A new requestKind that reuses `'full_compaction'` verbatim*. Rejected: telemetry and the
  journal could not distinguish a handoff request from a summary request; the one-line
  `requestKindForRecord` extension is cheaper than permanent ambiguity.
- *Deriving the handoff without an LLM call* (wrap the summary + metadata in a template).
  Rejected: it would not contain the section *content* FR-002 requires (threads, gotchas,
  next actions) — those need reasoning over the history, which is exactly the call being paid
  for.

## (c) Where the document is persisted, and its name

**Decision**: `IBlobStore.put(agentScope, 'handoff/<name>.md', bytes)`
(`src/persistence/backends/node-fs/blobStoreService.ts:12-14` performs an atomic storage
write), with the agent scope from the same addressing the plan feature uses
(`src/workspace/sessionLifecycle/internal/addressing.ts:7-17`): the file lands at
`<home>/sessions/<workspaceId>/<sessionId>/agents/<agentId>/handoff/<name>.md` — beside
`wire.jsonl`, `state.json`, and `plans/<id>.md`. `<name>` is
`<ISO-local-date>T<time-with-ms>-<seq>.md` where `<seq>` is a monotonic per-service counter
starting at 1 (the service is Agent-scoped and lives as long as the agent, so the counter
spans the session's process lifetime; the millisecond timestamp keeps restarts unambiguous
and gives lexicographic order = chronological order). FR-004's "date and sequence visible"
is satisfied by the name itself; nothing is ever overwritten.

The host-visible path reported to clients and the summary pointer is the storage path
(`sessionDir/agents/<agentId>/handoff/<name>.md`), computed the way `AgentPlanService`
computes `planFilePathFor` (`src/features/plan/planService.ts:238-245`) — via
`ISessionContext.sessionDir` + the agent id — not by joining fs roots in the domain.

**Rationale**: `packages/agent-core-v2/AGENTS.md` ("Persistence") forbids `node:fs` in
business domains; `IBlobStore` is the sanctioned access pattern for a blob and its
implementation is exactly an atomic file write. The plan feature is the recorded precedent
for a per-agent markdown artifact (`planService.ts:199-219` keeps blob copies at
`plan/<id>/v<version>.md`). Write-once atomicity gives FR-003's "readable after the session
ends" and the "process exited mid-handoff" edge case (an interrupted write never produces a
partial file at the final path).

**Alternatives considered**:

- *`IAtomicDocumentStore`*: designed for read-modify-write documents, not append-only
  artifacts; a handoff is never read back by the engine in v1.
- *Only a host-fs write like `writeEmptyPlanFile`*: raw host writes are the plan feature's
  concession for its editable host file; the blob path is atomic and survives the same way,
  so the second mechanism buys nothing here.
- *Under `<sessionDir>/handoffs/` (session scope, not agent scope)*: the compaction is an
  Agent-scope concern (the service is Agent-scoped, `fullCompactionService.ts:1163-1169`);
  keeping the artifact in the agent's own scope means no cross-scope addressing.

## (d) How the replacement summary points at the document

**Decision**: a short pointer footer appended to the model-facing composed summary in
`compactionRound` — the same place the recovery footer is appended today
(`fullCompactionService.ts:938-942`): the model-facing text becomes
`${summaryText}\n\n${handoffFooter}\n\n${recoveryFooter}` (recovery footer absent when there
is none). The footer is rendered from a small template constant in the generation helper,
names the document as the first thing to read when resuming, and carries the storage path.
The human-facing `summary` field is not modified by the footer (the path reaches humans via
the event payload and the TUI header, FR-006/FR-010).

**Rationale**: the recovery footer already established the pattern of appending
resumption aids to the model-facing text (`renderRecoveryFooter`, `:1046-1052`); a resuming
model reads exactly that text, which is what FR-005 addresses.

## (e) How clients learn the path

**Decision**: `CompactionResult` (`src/agent/fullCompaction/types.ts:1-10`) gains
`handoffPath?: string`. It then flows through every existing consumer with no new event:

- The durable `ContextApplyCompaction` record schema shape 1
  (`src/agent/contextMemory/contextEvents.ts:71-98`) gains the optional field → journal
  replay keeps it → `pnpm gen:wire-manifest` refreshes `docs/wire-manifest.d.ts`
  (`test/wire/wireManifest.test.ts` enforces freshness).
- The observable `CompactionCompleted` (`compactionOps.ts:99-108`) already spreads the result
  minus `contextSummary` (`fullCompactionService.ts:620-631`), so `handoffPath` reaches
  clients automatically once it is on the result.
- kap-server's `compactionResultSchema` (`packages/kap-server/src/protocol/events-zod.ts:456-464`)
  and klient's `compactionCompletedEventSchema.result`
  (`packages/klient/src/contract/agent/events.ts:161-173`) gain the optional field, so the WS
  surface validates it (FR-006).
- The TUI live handler (`apps/kimi-code/src/tui/controllers/session-event-handler.ts:1142-1159`)
  passes `event.result.handoffPath` into the compaction block, whose header
  (`src/tui/components/dialogs/compaction.ts:163-188`) renders a `Handoff saved: <path>` line
  when present (FR-010); the replay path (`session-replay.ts:575-598` +
  `CompactionTranscriptData`, `src/tui/types.ts:182-189`) carries it the same way.

**Rationale**: FR-006 demands the path on the completion event and FR-005's resuming agent
benefits from replay keeping it; `CompactionResult` is the single payload every one of those
surfaces already shares. The optional field is backwards-compatible: absent ≡ no handoff
(flag off, generation failed, or a pre-feature journal).

**Alternatives considered**:

- *A new observable `compaction.handoff` event*: a second event to broadcast, zod-validate,
  contract-map, and order against `compaction.completed` in every consumer, for a fact that
  is one optional field on the event they already consume.
- *Path only inside the summary prose*: clients would parse prose (spec FR-006 explicitly
  rejected this), and replay would keep no structure.

## (f) Flag design

**Decision**: a new flag declared in the owning domain —
`src/agent/fullCompaction/flag.ts`, id `compaction-handoff`, env
`KIMI_CODE_EXPERIMENTAL_COMPACTION_HANDOFF`, `default: false`, `surface: 'core'`,
registered at import time via `registerFlagDefinition` (verbatim pattern of
`src/session/compaction/flag.ts`). The service checks `this.flags.enabled(...)` (injected
`@IFlagService`, as at `fullCompactionService.ts:172`) next to the `source === 'auto'` check.
Precedence is the platform's: per-flag env > `[experimental]` config > master env
(`KIMI_CODE_EXPERIMENTAL_FLAG`) > default. No new config section, so
`docs/config-manifest.toml` is untouched.

## (g) Failure semantics

**Decision**: the entire generation step is one try/catch boundary around the helper call in
`compactionRound`. On any failure — model error after the cascade's own fallback, unresolved
binding, blob write error — the helper returns `undefined`, the service dispatches a
`WarningIssued` event with code `'compaction-handoff-failed'` (the pattern of
`'compaction-model-fallback'`), the registered `compaction_finished` telemetry property
`handoff_generated: false` is recorded (path-shaped values are never telemetry properties —
"Telemetry" in the package AGENTS.md), and compaction proceeds with `handoffPath: undefined`
everywhere. A cancelled compaction after the blob write leaves the file in place (a valid
snapshot, per spec edge case); no cleanup runs because the document is not referenced by
anything until `applyCompaction` succeeds.

**Rationale**: FR-007/SC-003 — the compaction is the load-bearing path; the handoff is
strictly additive decoration on top of it. The existing compaction failure telemetry events
(`compaction_finished` / `compaction_failed`, emitted at `fullCompactionService.ts:955-986`)
are the natural place for the one boolean.
