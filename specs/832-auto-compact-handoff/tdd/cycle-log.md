---
feature: 832-auto-compact-handoff
started_at: aafdca9be
suite_baseline: red
profile: .specify/memory/tdd-profile.md
profile_detected_at: 3f2a19d8f
---

# Cycle Log: Auto-Compact Handoff Document

Append only. Newest last. Every entry's `red` block is the evidence that the test existed
and failed before the implementation. `/speckit.tdd.run` appends the cycle entries;
`/speckit.tdd.plan` wrote only this baseline.

## Baseline

- suite: full `pnpm test` not run — `.specify/memory/tdd-profile.md` records it at 819 s
  with a red baseline (55 failed of 16844) that includes three files red in isolation,
  none of them under `packages/agent-core-v2/test/agent/fullCompaction/`. Per the profile,
  the loop uses file- and directory-scoped runs.
- commit: `aafdca9be` (latest master, pulled this session; the profile's `detected_at` is
  the older `3f2a19d8f`, so the profile's command shapes were re-verified below rather than
  trusted blind)
- recorded: cycle 0, before any change
- **C1 proof (green baseline for the touched engine suite)**:
  `pnpm vitest run packages/agent-core-v2/test/agent/fullCompaction` at `aafdca9be` =
  `Test Files 3 passed (3)` / `Tests 118 passed (118)`, 30.8 s. The directory the feature
  modifies is green before the first edit; any later red there that is not asserted by this
  feature's own new tests is a regression, not a baseline artifact.
- test list: `specs/832-auto-compact-handoff/tdd/test-list.md` — 9 acceptance behaviors
  (A1–A9), 11 unit behaviors (U1–U11, none covered by existing tests), 1 characterization
  baseline (C1, already recorded DONE)
- tests already in place at baseline: none for handoff behavior (`grep` over `*.test.ts`
  finds no `handoffPath`, `compaction-handoff`, or `full_compaction_handoff`); the
  pre-existing 118 tests are the change-detector for everything the feature touches.

## Cycle 1 — U6 `handoffPath` on the compaction record schema

- test: `packages/agent-core-v2/test/agent/fullCompaction/compactionOps.test.ts::context.apply_compaction handoffPath field > keeps an optional handoffPath on the current summary shape`
- red: `Tests 1 failed | 2 passed` — the union's shape 1 dropped the unknown key, so the parsed payload had no `handoffPath`; both legacy-shape tests passed untouched.
- green: added `handoffPath: z.string().optional()` to shape 1 (`contextEvents.ts`) and `handoffPath?: string` to `CompactionResult` (`types.ts`) — file green (`Tests 7 passed (7)`).

## Cycle 2 — U7/U8 kap-server and klient schema mirrors

- tests: `packages/kap-server/test/sessionEventBroadcaster.test.ts::sessionEventMessageSchema > keeps an optional handoffPath…` and `> rejects a non-string handoffPath…`; `packages/klient/test/contract.test.ts::compaction completed contract validation > keeps an optional handoffPath…`
- red: kap-server `Tests 2 failed | 97 skipped (99)` (key stripped, `42` silently accepted and stripped); klient `Tests 2 failed | 1 passed | 11 skipped (14)`.
- green: `handoffPath: z.string().optional()` added to `compactionResultSchema` (`events-zod.ts`) and `compactionCompletedEventSchema.result` (`klient/src/contract/agent/events.ts`) — both files green.

## Cycle 3 — U4 `full_compaction_handoff` recorded as `compaction`

- test: `packages/agent-core-v2/test/agent/llmRequester/llmRequesterService.test.ts::AgentLLMRequesterService request kind records > records a full_compaction_handoff operation request as kind compaction`
- red: `Tests 1 failed | 1 passed` — the durable `llm.request` records came out `['loop', 'loop']` (two records per request in that harness; the plain-operation control test passed).
- green: one added branch in `requestKindForRecord` (`llmRequesterService.ts`) classifying `full_compaction_handoff` as `compaction` — both green.

## Cycle 4 — U1/U2 handoff file naming and atomic persistence

- tests: `packages/agent-core-v2/test/agent/fullCompaction/handoffDocument.test.ts` (new file) — name shape and zero-padded sequence, lexicographic=chronological, blob write under `handoff/<name>.md` in the real agent scope over a temp home, content trimmed of trailing whitespace, resume-pointer advance, no overwrite.
- red: file failed at import (module absent) — `Test Files 1 failed (1) / Tests no tests`.
- green: implemented `handoffDocument.ts` (`handoffFileName`, `handoffStoragePath`, `AgentHandoffDocumentService` over `IBlobStore` + `ISessionContext` + `IAgentScopeContext`) — `Tests 5 passed (5)`. Two initial failures inside the batch were test-side (anchored regex applied to a full path instead of the basename) and were fixed in the tests, not the implementation.

## Cycle 5 — U3 handoff prompt rendering

- tests: `handoffDocument.test.ts::renderHandoffInstruction > requests the fixed section headings in order`, `> omits the resume pointer when no earlier handoff exists`, `> points at the earlier handoff when one exists`, `> embeds the compaction instruction only when present`
- red: import failure (module absent).
- green: `handoffInstruction.ts` + `handoff-instruction.md` (renderPrompt with `resume_from_block` / `custom_instruction_block`) — all green after tightening one test assertion (the intro prose mentions "resume from"; the test now checks for a standalone `## Resume from` heading instead of a substring).

## Cycle 6 — A1 flag-on auto compaction produces the handoff document

- test: `fullCompaction.test.ts::produces a handoff document before an auto compaction replaces the history`
- red: `Tests 1 failed` — `findHandoffDir(homeDir)` undefined: no generation existed.
- green (the main wiring): `flag.ts` (compaction-handoff, default off, per-flag env), ctor injection of `IAgentHandoffDocumentService`, Agent-scope registration, and `generateHandoffDocument` inside `compactionRound` (after `historySafeToCompact`, before `applyCompaction`; same model binding and `llmRequester` as the summarizer; single attempt + credential recovery; abort rethrown, everything else caught) — test green and the whole fullCompaction directory stayed green (131 tests).

## Cycle 7 — A3/U5 second handoff, resume pointer, sequencing

- test: `fullCompaction.test.ts::names a second handoff distinctly and points at the first`
- outcome: green on first run after Cycle 6's wiring (the service-level `sequence`/`lastHandoffPath` state shipped with the helper in Cycle 4 and the wiring in Cycle 6). Class: **guard** (behavior implemented in the A1 cycle; this test pins the two-compaction story end to end and stays as the regression detector).

## Cycle 8 — A4/U11/A5/U9 summary footer, event payload, telemetry success half

- test: `fullCompaction.test.ts::anchors the post-compaction summary, event, and telemetry at the handoff document`
- outcome: green on first run after Cycle 6. Class: **guard** (footer composition `[summaryText, handoff?.footer, recoveryFooter]`, result spread, and `handoff_generated: true` shipped with Cycle 6's wiring).

## Cycle 9 — A6/A7/U10/A8 degradation, warning, flag-off, manual exclusion

- tests: `leaves no handoff trace when the compaction-handoff flag is off`, `completes the compaction when the handoff request fails`, `never generates a handoff for a manual compaction`
- red (real): all three failed their `'handoffPath' in record.args` assertions — every `context.apply_compaction` record carried a `handoffPath: undefined` **key**, because `contextMemoryService.applyCompaction` forwarded the field unconditionally into the dispatched payload. A raw journal reader would see the key on every compaction forever.
- green: `applyCompaction` now builds the payload and sets `handoffPath` only when defined (`contextMemoryService.ts`) — all three green. This was a genuine defect caught by the guard tests, not a test artifact.
- note (A2): `produces a handoff document from the overflow recovery path` failed on its first run only because the test used `ctx.llmCalls`, which does not record custom `generate` fns; after switching to in-fn history capture it proved the overflow path generates the handoff from the pre-shrunk history (call 3 of 4). Class: **TEST_AFTER** for the pass-through itself; the wiring was already exercised by Cycle 6.

## Cycle 10 — A9 TUI header line and payload pass-through

- tests: `apps/kimi-code/test/tui/components/dialogs/compaction.test.ts::renders the saved handoff path after compaction completes` / `> renders no handoff line when the compaction produced none`; `apps/kimi-code/test/tui/controllers/session-event-handler-compaction.test.ts::passes the handoff path through to the streaming UI when the event carries one`
- red: `Tests 2 failed | 1 passed` — no `Handoff saved:` line, `endCompaction` called with 3 args.
- green: `markDone`/`endCompaction` fourth parameter, header line, `handleCompactionEnd` pass-through, `CompactionTranscriptData.handoffPath`, replay `renderCompaction` + `kimi-tui` replay rendering, and the replay fold's `handoffPath: readString(record, 'handoffPath')` — `Tests 19 passed (19)` across the two files.

## Wire manifest

- `test/wire/wireManifest.test.ts::docs/wire-manifest.d.ts is up to date` failed after the schema change (expected), regenerated with `pnpm --filter @moonshot-ai/agent-core-v2 gen:wire-manifest` — both manifest tests green.
