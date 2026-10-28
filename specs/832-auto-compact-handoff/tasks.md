# Tasks: Auto-Compact Handoff Document

**Feature Branch**: `832-auto-compact-handoff`

**Input**: Design documents from `/specs/832-auto-compact-handoff/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Required. This feature is built test-first: every user story lists its test tasks
before its implementation tasks, and each test task must fail for the right reason before the
matching implementation lands. Run the named file only — `pnpm vitest run <path>` — never the
full suite (its baseline is red on three unrelated files; see
`.specify/memory/tdd-profile.md`).

**Organization**: Tasks are grouped by user story so each story can be implemented, tested,
and delivered on its own.

**Constraints carried into the task text below**:

- `packages/agent-core-v2` is a comment-free zone: no comments and no JSDoc of any kind
  anywhere under `src/`/`test/`/`scripts/`, enforced by `scripts/check-no-comments.mjs` under
  `pnpm lint`.
- No new external dependency is introduced (zod and vitest already exist).
- Optional object properties are passed as `undefined`, never via conditional spread, and
  their types do not additionally allow `undefined`.
- Persistence goes through `IBlobStore` — no `node:fs` in the compaction domain
  (`packages/agent-core-v2/AGENTS.md`, "Persistence").
- TUI work follows `.agents/skills/write-tui/SKILL.md`.
- Scratch files belong under the gitignored `.tmp/`, never in the source tree; `handoffs/`
  is gitignored repo-wide and never committed.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel — different files, no dependency on an incomplete task
- **[Story]**: Which user story the task belongs to (US1, US2, US3); omitted on Setup,
  Foundational, and Polish tasks
- **[A<n>] [U<n>] [C<n>]**: The test-list behavior this task covers, from
  `specs/832-auto-compact-handoff/tdd/test-list.md`. The marker is load-bearing, not a
  cross-reference: `/speckit.tdd.run` ticks a task only when it can read a behavior id from
  it, and only when every behavior it names is `DONE`. A task with no marker is
  non-behavioral work for `/speckit.implement`
- Every task names a concrete file path

## Path Conventions

Monorepo paths from the repository root. Engine behavior lives under
`packages/agent-core-v2/src/agent/fullCompaction/` plus one schema mirror in
`src/agent/contextMemory/`; the edge mirrors live in `packages/kap-server/src/protocol/`,
`packages/klient/src/contract/`, and `apps/kimi-code/src/tui/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Preconditions every story shares.

- [x] T001 [P] Read the persistence layering rules the engine AGENTS.md points at before touching stores, `.agents/skills/agent-core-dev/persistence.md`
- [x] T002 [P] Record the fork-owned files this feature creates or changes together with a unique, greppable survival marker for each (`compaction-handoff`, `full_compaction_handoff`, `compaction-handoff-failed`, `Handoff saved:`), ahead of the guard-list update in Phase 6, `.github/FORK_OWNED_FILES`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared result field and schema mirrors every story compiles against.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T003 [U6] Write the failing schema test for the widened compaction result — `handoffPath` accepted as optional on the `ContextApplyCompaction` union's current shape, absent field unchanged, both legacy shapes still parsing untouched, `packages/agent-core-v2/test/agent/fullCompaction/compactionOps.test.ts`
- [x] T004 [U6] Add `handoffPath?: string` to `CompactionResult` and to the matching zod object of the `ContextApplyCompaction` union, leaving the legacy shapes untouched, `packages/agent-core-v2/src/agent/fullCompaction/types.ts` and `packages/agent-core-v2/src/agent/contextMemory/contextEvents.ts`
- [x] T005 [P] [U7] Write the failing kap-server test — the completed-event schema accepts an optional `handoffPath` on the result and rejects a non-string one, `packages/kap-server/test/sessionEventBroadcaster.test.ts`
- [x] T006 [U7] Add the optional `handoffPath` to `compactionResultSchema`, `packages/kap-server/src/protocol/events-zod.ts`
- [x] T007 [P] [U8] Write the failing klient contract test — `compactionCompletedEventSchema` accepts an optional `handoffPath` on the result, `packages/klient/src/contract/agent/events.ts` companion test location per the contract's existing parity test setup
- [x] T008 [U8] Add the optional `handoffPath` to `compactionCompletedEventSchema.result`, `packages/klient/src/contract/agent/events.ts`
- [x] T009 [P] [U4] Write the failing classification test — a request source carrying `requestKind: 'full_compaction_handoff'` lands in the durable `llm.request` record as kind `compaction`, `packages/agent-core-v2/test/agent/fullCompaction/compactionOps.test.ts` or the file that already owns `requestKindForRecord` coverage
- [x] T010 [U4] Teach `requestKindForRecord` to classify `full_compaction_handoff` as `compaction`, `packages/agent-core-v2/src/agent/llmRequester/llmRequesterService.ts`

**Checkpoint**: Foundation ready — every user story can now start.

---

## Phase 3: User Story 1 - A session that crosses the auto-compact threshold gets a handoff document on disk (Priority: P1) 🎯 MVP

**Purpose**: The artifact exists, named and structured, before the history is replaced.

- [x] T011 Declare the `compaction-handoff` flag (id `compaction-handoff`, env `KIMI_CODE_EXPERIMENTAL_COMPACTION_HANDOFF`, default false, surface core) with `registerFlagDefinition`, importing the module for its registration side effect, `packages/agent-core-v2/src/agent/fullCompaction/flag.ts`
- [x] T012 [P] [U1][U2] Write the failing unit tests for the document helper against the real blob store over a temp home — name matches `<ISO-local-date>T<HH-MM-SS-mmm>-<seq>.md` with the sequence incrementing, the file lands under the agent scope at `handoff/<name>.md`, content equals the model output as produced modulo trailing whitespace, `packages/agent-core-v2/test/agent/fullCompaction/handoffDocument.test.ts`
- [x] T013 [P] [U3] Write the failing rendering tests for the prompt — the seven section headings are requested in order, the previous handoff path appears as the resume pointer only when set, the compaction instruction is embedded only when present, `packages/agent-core-v2/test/agent/fullCompaction/handoffDocument.test.ts`
- [x] T014 [U1][U2] Implement the document helper: naming, sequencing, `IBlobStore.put` persistence, and the derived storage path from `ISessionContext.sessionDir` + agent id, `packages/agent-core-v2/src/agent/fullCompaction/handoffDocument.ts`
- [x] T015 [U3] Implement the prompt renderer and its template — `handoffInstruction.ts` + `handoff-instruction.md` beside the existing compaction instruction template, `packages/agent-core-v2/src/agent/fullCompaction/handoffInstruction.ts`
- [x] T016 [A1] Write the failing harness test — flag on, agent crosses the trigger ratio, scripted model answers summary and handoff requests, exactly one handoff file exists with the seven sections, `packages/agent-core-v2/test/agent/fullCompaction/fullCompaction.test.ts`
- [x] T017 [A1] Wire generation into `compactionRound`: when `source === 'auto'` and the flag is enabled, run the handoff request through the same model binding and `llmRequester` before `context.applyCompaction`, store the document, and attach `handoffPath` to the result, `packages/agent-core-v2/src/agent/fullCompaction/fullCompactionService.ts`
- [x] T018 [A2] Write the failing harness test — the overflow-recovery path (context overflow on a step) auto-compacts and produces the handoff from the pre-shrunk history, `packages/agent-core-v2/test/agent/fullCompaction/fullCompaction.test.ts`
- [x] T019 [A2] Close any gap the overflow-recovery test exposes in the wiring (the recovery path funnels through the same `compactionRound`; adjust only if the test proves otherwise), `packages/agent-core-v2/src/agent/fullCompaction/fullCompactionService.ts`
- [x] T020 [A3][U5] Write the failing harness test — a second auto-compaction produces a second, distinct file, the first is untouched, and the second handoff request's prompt carries the first document's path as the resume pointer, `packages/agent-core-v2/test/agent/fullCompaction/fullCompaction.test.ts`
- [x] T021 [A3][U5] Track `sequence` and `lastHandoffPath` on the service and feed them into the helper so the resume pointer and sequencing hold across compactions in one agent, `packages/agent-core-v2/src/agent/fullCompaction/handoffDocument.ts` and `packages/agent-core-v2/src/agent/fullCompaction/fullCompactionService.ts`

**Checkpoint**: US1 delivered — an enabled auto-compaction leaves a structured document on disk before the history is replaced.

---

## Phase 4: User Story 2 - The post-compaction context is anchored to the handoff document (Priority: P2)

**Purpose**: The resuming model and the clients can find the document.

- [x] T022 [A4][U11] Write the failing harness test — the model-facing composed summary (the `context.apply_compaction` record's `contextSummary`) contains the pointer footer with the path between the summary text and the recovery footer, and the footer is absent when no handoff was produced, `packages/agent-core-v2/test/agent/fullCompaction/fullCompaction.test.ts`
- [x] T023 [A4][U11] Compose the pointer footer into the model-facing summary at the existing footer composition point, `packages/agent-core-v2/src/agent/fullCompaction/fullCompactionService.ts`
- [x] T024 [A5] Write the failing test — the observable `CompactionCompleted` payload carries `handoffPath` when a document was produced and omits it otherwise, with `contextSummary` still stripped, `packages/agent-core-v2/test/agent/fullCompaction/fullCompaction.test.ts`
- [x] T025 [A5] Verify the completion path preserves the field through the result spread and fix if not, `packages/agent-core-v2/src/agent/fullCompaction/fullCompactionService.ts`
- [x] T026 [A9] Write the failing TUI tests — the completed event's path reaches the compaction block, the block header renders `Handoff saved: <path>` when present and nothing extra when absent, `apps/kimi-code/test/tui/controllers/session-event-handler-compaction.test.ts` and `apps/kimi-code/test/tui/components/dialogs/compaction.test.ts`
- [x] T027 [A9] Pass `handoffPath` through `CompactionTranscriptData` from both the live handler and the replay renderer, and render the header line in `buildHeader`, `apps/kimi-code/src/tui/types.ts`, `apps/kimi-code/src/tui/controllers/session-event-handler.ts`, `apps/kimi-code/src/tui/controllers/session-replay.ts`, `apps/kimi-code/src/tui/components/dialogs/compaction.ts`

**Checkpoint**: US2 delivered — the replacement summary, the completion event, and the TUI all name the document.

---

## Phase 5: User Story 3 - Handoff generation is safe to fail and off by default (Priority: P3)

**Purpose**: The feature can never endanger the compaction and is invisible until enabled.

- [x] T028 [A6] Write the failing harness test — flag off, agent crosses the threshold, the request log shows no `full_compaction_handoff` request, no file exists under `handoff/`, and the completed payload has no `handoffPath`, `packages/agent-core-v2/test/agent/fullCompaction/fullCompaction.test.ts`
- [x] T029 [A6] Gate the generation call behind `IFlagService.enabled('compaction-handoff')` next to the `source === 'auto'` check, `packages/agent-core-v2/src/agent/fullCompaction/fullCompactionService.ts`
- [x] T030 [A7][U9][U10] Write the failing tests — the scripted handoff request throws and the compaction still completes with its summary, a `WarningIssued` with code `compaction-handoff-failed` is observed, `compaction_finished` records `handoff_generated: false`, no file is written; the success path records `handoff_generated: true`, `packages/agent-core-v2/test/agent/fullCompaction/fullCompaction.test.ts`
- [x] T031 [A7][U9][U10] Wrap the generation step in the single `compactionRound` failure boundary, dispatch the warning, and register the `handoff_generated` boolean property on `compaction_finished` before recording it on both paths, `packages/agent-core-v2/src/agent/fullCompaction/fullCompactionService.ts` and `packages/agent-core-v2/src/app/telemetry/events.ts`
- [x] T032 [A8] Write the failing harness test — `begin({ source: 'manual' })` with the flag on performs no handoff request and writes no file, `packages/agent-core-v2/test/agent/fullCompaction/fullCompaction.test.ts`
- [x] T033 [A8] Assert the manual-source exclusion in the generation gate, `packages/agent-core-v2/src/agent/fullCompaction/fullCompactionService.ts`

**Checkpoint**: US3 delivered — degradation and the default-off gate are proven.

---

## Phase 6: Polish & Delivery

**Purpose**: Generated manifests, guard list, and the validation pass.

- [x] T034 Regenerate the wire manifest after the durable record change and confirm the freshness test passes, `pnpm gen:wire-manifest`, `packages/agent-core-v2/docs/wire-manifest.d.ts`, `packages/agent-core-v2/test/wire/wireManifest.test.ts`
- [x] T035 Append the fork-owned entries with their survival markers (from T002) to the guard list, `.github/FORK_OWNED_FILES`
- [x] T036 Run the scoped validation pass from quickstart.md — the fullCompaction directory run, the touched TUI and kap-server files, and `pnpm lint` (comment-free-zone check included), `specs/832-auto-compact-handoff/quickstart.md`
- [x] T037 Note for delivery: a changeset under `.changeset/` is required by the root AGENTS.md before any PR — generate it with the `gen-changesets` skill only when the user asks for a PR; no PR is part of this task list

---

## Dependencies

- Phase 2 → everything (the result field is the contract every story reads).
- T011/T012–T015 → T016–T021 (US1 wiring needs the helper, the prompt, and the flag).
- US1 → US2 (the anchor composes on an existing document) and US3 (the gate wraps the same
  call). US2 and US3 are independent of each other once US1 is green.
- T034 after T004; T035 after T002; T036 last.
