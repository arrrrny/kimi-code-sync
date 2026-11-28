---
feature: 832-auto-compact-handoff
loop: outside-in
profile: .specify/memory/tdd-profile.md
spec_criteria: 4
planned_at: aafdca9be
updated_at: 832-auto-compact-handoff (worktree)
suite_baseline: red
---

# Test List: Auto-Compact Handoff Document

Behavior ids: `A1`–`A9` are the outer loop, one per acceptance scenario in `spec.md`;
`U1`–`U11` are the inner loop, grouped by the component `plan.md` gives them; `C1` is the
characterization baseline that captures what the code does today and must be green against
untouched code before the task that changes that component starts.

Every trace resolves to a user-story scenario (`US<n>.<m>`, numbered as in the story's
`Acceptance Scenarios` list), a functional requirement (`FR-0xx`), a success criterion
(`SC-0xx`), or a spec edge case (`EC`).

The outer loop runs at the highest level this repository tests deterministically: the agent
machine driven through the real fullCompaction harness (scripted model, real temp-home
storage) for the engine stories, and the TUI component/controller level for the display
story. That is an integration level, not an end-to-end one.

## Outer loop: acceptance behaviors

| id | behavior                                                                                                                                         | traces                           | kind    | state   | test |
| -- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- | ------- | ------- | ---- |
| A1 | With the flag on, an agent whose context crosses the trigger ratio auto-compacts and exactly one handoff file exists under the agent's storage area with the seven required sections, produced from the pre-compaction history | US1.1, US1.2, FR-001, FR-002, FR-003, SC-001, SC-002 | example | DONE | `packages/agent-core-v2/test/agent/fullCompaction/fullCompaction.test.ts::produces a handoff document before an auto compaction replaces the history` |
| A2 | An overflow-recovery auto-compaction (context overflow on a step) produces a handoff document from the history available before the retry          | US1.3, FR-001, SC-001            | example | DONE | `packages/agent-core-v2/test/agent/fullCompaction/fullCompaction.test.ts::produces a handoff document from the overflow recovery path` |
| A3 | A second auto-compaction in the same session produces a second, distinct file; the first is untouched; the second request's prompt carries the first document's path | US1.4, FR-004                    | example | DONE | `packages/agent-core-v2/test/agent/fullCompaction/fullCompaction.test.ts::names a second handoff distinctly and points at the first` |
| A4 | The model-facing replacement summary references the handoff document and its path; without a handoff the footer is absent                          | US2.1, FR-005, SC-002            | example | DONE | `packages/agent-core-v2/test/agent/fullCompaction/fullCompaction.test.ts::anchors the post-compaction summary, event, and telemetry at the handoff document` |
| A5 | The `compaction.completed` event payload carries `handoffPath` when a document was produced and omits it otherwise, with `contextSummary` still stripped | US2.2, FR-006, SC-002            | example | DONE | `packages/agent-core-v2/test/agent/fullCompaction/fullCompaction.test.ts::anchors the post-compaction summary, event, and telemetry at the handoff document` |
| A6 | With the flag off (default), an auto-compaction issues no handoff request, writes no file, and the payload has no `handoffPath`                     | US3.1, FR-008, SC-004            | example | DONE | `packages/agent-core-v2/test/agent/fullCompaction/fullCompaction.test.ts::leaves no handoff trace when the compaction-handoff flag is off` |
| A7 | With the flag on and the handoff request failing, the compaction still completes with its summary, the warning is observed, and no file is written   | US3.2, FR-007, SC-003            | example | DONE | `packages/agent-core-v2/test/agent/fullCompaction/fullCompaction.test.ts::completes the compaction when the handoff request fails` |
| A8 | A manual compaction with the flag on issues no handoff request and writes no file                                                                   | EC (manual `/compact`), FR-001   | example | DONE | `packages/agent-core-v2/test/agent/fullCompaction/fullCompaction.test.ts::never generates a handoff for a manual compaction` |
| A9 | The TUI completion block renders `Handoff saved: <path>` when the payload carries the path and renders nothing extra when it does not                | US2.3, FR-010, SC-002            | example | DONE | `apps/kimi-code/test/tui/components/dialogs/compaction.test.ts::renders the saved handoff path after compaction completes` (and the no-handoff counterpart); `apps/kimi-code/test/tui/controllers/session-event-handler-compaction.test.ts::passes the handoff path through to the streaming UI when the event carries one` |

## Inner loop: unit behaviors

### `packages/agent-core-v2/src/agent/fullCompaction/handoffDocument.ts` (new — naming, persistence, state)

| id | behavior                                                                                                                             | traces          | kind    | state   | test |
| -- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------- | ------- | ------- | ---- |
| U1 | The document name matches `<ISO-local-date>T<HH-MM-SS-mmm>-<seq>.md`, the sequence increments per generation in one agent, and lexicographic order equals chronological order | FR-004          | example | DONE | `packages/agent-core-v2/test/agent/fullCompaction/handoffDocument.test.ts::handoff file naming > names a document by local date, millisecond time, and zero-padded sequence` (and the ordering test) |
| U2 | The document is written atomically through `IBlobStore` under the agent scope at `handoff/<name>.md`, content equal to the model output modulo trailing whitespace, and the reported path is `<sessionDir>/agents/<agentId>/handoff/<name>.md` | FR-003          | example | DONE | `packages/agent-core-v2/test/agent/fullCompaction/handoffDocument.test.ts::AgentHandoffDocumentService > persists a document atomically under the agent scope and reports its storage path` (and the no-overwrite test) |
| U5 | `sequence` and `lastHandoffPath` live on the service: a second generation sees the first document's path and the incremented sequence; a fresh agent scope starts at sequence 1 with no resume pointer | FR-004          | example | DONE | `packages/agent-core-v2/test/agent/fullCompaction/fullCompaction.test.ts::names a second handoff distinctly and points at the first` (with `handoffDocument.test.ts::starts a fresh agent scope at sequence one with no resume pointer`) |

### `packages/agent-core-v2/src/agent/fullCompaction/handoffInstruction.ts` + `handoff-instruction.md` (new — prompt)

| id | behavior                                                                                                                             | traces          | kind    | state   | test |
| -- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------- | ------- | ------- | ---- |
| U3 | The rendered prompt requests the seven section headings in order, includes the previous handoff path as the resume pointer only when set, and embeds the compaction instruction only when present | FR-002          | example | DONE | `packages/agent-core-v2/test/agent/fullCompaction/handoffDocument.test.ts::renderHandoffInstruction` (all four tests) |

### `packages/agent-core-v2/src/agent/llmRequester/llmRequesterService.ts`

| id | behavior                                                                                                                             | traces          | kind    | state   | test |
| -- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------- | ------- | ------- | ---- |
| U4 | A request source carrying `requestKind: 'full_compaction_handoff'` is recorded in the durable `llm.request` record as kind `compaction`  | research (b)    | example | DONE | `packages/agent-core-v2/test/agent/llmRequester/llmRequesterService.test.ts::AgentLLMRequesterService request kind records > records a full_compaction_handoff operation request as kind compaction` |

### Compaction payload schemas (widened surface)

| id | behavior                                                                                                                             | traces          | kind    | state   | test |
| -- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------- | ------- | ------- | ---- |
| U6 | The `ContextApplyCompaction` union's current shape accepts an optional string `handoffPath`, parses unchanged without it, and both legacy shapes still parse untouched | FR-006          | example | DONE | `packages/agent-core-v2/test/agent/fullCompaction/compactionOps.test.ts::context.apply_compaction handoffPath field` (all three tests) |
| U7 | kap-server's `compactionResultSchema` accepts an optional string `handoffPath` and rejects a non-string one                            | FR-006          | example | DONE | `packages/kap-server/test/sessionEventBroadcaster.test.ts::sessionEventMessageSchema > keeps an optional handoffPath on a compaction completed envelope` (and the rejection test) |
| U8 | klient's `compactionCompletedEventSchema.result` accepts an optional string `handoffPath`                                              | FR-006          | example | DONE | `packages/klient/test/contract.test.ts::compaction completed contract validation` (all three tests) |

### `packages/agent-core-v2/src/agent/fullCompaction/fullCompactionService.ts` (wiring)

| id | behavior                                                                                                                             | traces          | kind    | state   | test |
| -- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------- | ------- | ------- | ---- |
| U9 | `compaction_finished` records `handoff_generated: true` on the success path and `false` when generation failed or was skipped by the gate | SC-003          | example | DONE | `packages/agent-core-v2/test/agent/fullCompaction/fullCompaction.test.ts` — `handoff_generated` asserted on both paths in `anchors the post-compaction summary…` (true) and `leaves no handoff trace…` / `completes the compaction when the handoff request fails` (false) |
| U10 | A failed generation dispatches `WarningIssued` with code `compaction-handoff-failed` and the compaction completes normally            | FR-007          | example | DONE | `packages/agent-core-v2/test/agent/fullCompaction/fullCompaction.test.ts::completes the compaction when the handoff request fails` (warning `compaction-handoff-failed` observed, `compaction_failed` absent) |
| U11 | The model-facing composed summary is `summaryText + handoff footer + recovery footer`, the footer alone when there is no recovery footer, and neither when there is no handoff | FR-005          | example | DONE | `packages/agent-core-v2/test/agent/fullCompaction/fullCompaction.test.ts::anchors the post-compaction summary, event, and telemetry at the handoff document` (order + path); absence covered by `completes the compaction when the handoff request fails` |

## Characterization baselines

| id | behavior                                                                                                                             | traces | kind    | state | test |
| -- | ------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------- | ----- | ---- |
| C1 | The existing fullCompaction suite is green at HEAD before this feature touches it: `pnpm vitest run packages/agent-core-v2/test/agent/fullCompaction` = 3 files, 118 tests, all passed at `aafdca9be` (30.8 s). Any red after this feature's changes that was not red here is a regression | baseline | characterization | DONE | baseline run recorded in `cycle-log.md` |

## Invariants

- **INV-1**: With the flag off, the set of LLM requests issued by an auto-compaction is
  exactly what it was at `aafdca9be` (FR-008, SC-004).
- **INV-2**: No code path added by this feature can reject the compaction promise — every
  new `await` inside the generation step sits inside the single failure boundary (FR-007).
- **INV-3**: A handoff file, once at its final path, is never modified or deleted by the
  engine (FR-004; cancellation leaves it in place).
- **INV-4**: The path is never sent through telemetry (privacy rule, package AGENTS.md);
  it appears only in the document, the summary prose, the payload field, and the TUI.
