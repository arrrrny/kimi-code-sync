# Contract: Handoff Generation and Persistence (engine)

Owner: `packages/agent-core-v2/src/agent/fullCompaction/` — `fullCompactionService.ts`
(orchestration), `handoffDocument.ts` (generation + persistence), `handoffInstruction.ts` +
`handoff-instruction.md` (prompt), `flag.ts` (gate).

## Trigger

| Input state | Behavior |
|---|---|
| `source === 'auto'` AND `compaction-handoff` flag enabled | generate (below) |
| `source === 'manual'` | never generate; behavior identical to today |
| flag off (default) | never generate; no extra LLM call, no file, no payload field (SC-004) |

The check happens in `compactionRound`, before `context.applyCompaction`, next to the
existing threshold/strategy logic. The generation input is the same pre-compaction history
the summarizer consumed (post-pre-shrink on the overflow-recovery path).

## Generation

1. Resolve the model through `compactionModelBindingFor(...)` — the same call the
   summarizer uses; the cascade (dedicated → secondary → conversation model) and the
   mid-flight fallback with the `'compaction-model-fallback'` warning apply unchanged
   (FR-009).
2. Render `handoff-instruction.md` with the previous handoff path (when
   `lastHandoffPath` is set) and the compaction instruction (when present).
3. Issue one `llmRequester.start(...)` request with
   `source: { type: 'operation', requestKind: 'full_compaction_handoff' }`;
   `llmRequesterService.requestKindForRecord` classifies it as `'compaction'` in the durable
   `llm.request` record.
4. Store the raw model output as produced — no parsing, no structure verification, no
   trimming beyond trailing whitespace normalization.

## Persistence

- Write-once via `IBlobStore.put(agentScope, 'handoff/<name>.md', bytes)`;
  `BlobStoreService.put` performs the atomic write. The domain never imports `node:fs`.
- `<name>` = `<ISO-local-date>T<HH-MM-SS-mmm>-<seq>.md`; `<seq>` is the service's monotonic
  counter (starts at 1, +1 per generated document). Lexicographic order equals chronological
  order; nothing is ever overwritten (FR-004).
- The reported path is `<sessionDir>/agents/<agentId>/handoff/<name>.md`, derived from
  `ISessionContext.sessionDir` + agent id (the `AgentPlanService.planFilePathFor` pattern).
- On success: `sequence += 1`, `lastHandoffPath = <path>` (feeds the next prompt's
  `## Resume from`), and the result carries `handoffPath: <path>`.

## Result composition

- `CompactionResult.handoffPath` is set on the result returned by the round (FR-006); the
  observable `CompactionCompleted` event spreads it (only `contextSummary` is stripped).
- The model-facing composed summary gains the pointer footer between the summary text and
  the recovery footer: `…summary…\n\n<handoff footer>\n\n<recovery footer?>`. The footer
  names the document as the first thing to read when resuming and includes the path
  (FR-005). The human-facing `summary` field is not modified.
- Telemetry: `compaction_finished` records `handoff_generated: true` (registered property;
  the path is never a telemetry property).

## Failure (FR-007)

Any throw inside steps 1–4 (unresolved binding after the cascade, request failure, blob
write failure) is caught at the single `compactionRound` boundary:

- the helper returns `undefined`; the result carries `handoffPath: undefined`;
- a `WarningIssued` event with code `'compaction-handoff-failed'` is dispatched;
- `compaction_finished` records `handoff_generated: false`;
- the summary pointer footer is omitted; the compaction completes normally with the summary
  it already produced.

The handoff step can extend the compaction's wall time but can never change its outcome:
no retry loop of its own (the cascade's single mid-flight fallback is inherited from the
binding, not duplicated), no error propagation into the compaction promise.

## Cancellation

If the compaction is cancelled after the document was written, the file remains on disk
(a valid snapshot) and nothing references it (`handoffPath` is only attached on the
successful path). No cleanup pass exists in v1.

## Determinism for tests

- The sequence counter resets with the service instance — a fresh agent scope starts at
  `-001.md`; timestamps keep names unique across restarts, so nothing is overwritten.
- `lastHandoffPath` resets with the service instance but is re-seeded on first use from the
  newest `handoff/*.md` blob under the agent scope, so a resumed process resumes the chain a
  previous process wrote instead of pointing nowhere.
- The clock enters as the `record(document, timestampMs)` argument: unit tests pin the
  timestamp and assert the exact name; the compaction round passes `Date.now()`, and
  round-level tests match the generated name by pattern.
- The blob store is the real `FileStorageService` over a temp home in the existing harness;
  tests assert on the file's existence and content through the store/path, not by mocking
  the write.
