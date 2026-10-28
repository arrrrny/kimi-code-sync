# Contract: Widened Compaction Event Surface

The path travels as one optional field on the payload every surface already shares — no new
event, no new route, no new RPC.

## Payload flow

```text
AgentFullCompactionService.compactionRound
  └─ CompactionResult.handoffPath?: string            (types.ts)
      ├─ context.applyCompaction → ContextApplyCompaction (durable, wire.jsonl)
      │    └─ replay fold → CompactionTranscriptData.handoffPath  (TUI replay)
      ├─ CompactionCompleted (observable) → session-event-handler (TUI live)
      │    └─ kap-server WS zod → klient contract → consumers
      └─ TUI CompactionComponent header
```

## Changes per surface

| Surface | File | Change |
|---|---|---|
| Result type | `packages/agent-core-v2/src/agent/fullCompaction/types.ts` | `handoffPath?: string` |
| Durable record | `packages/agent-core-v2/src/agent/contextMemory/contextEvents.ts` | shape 1 of the `ContextApplyCompaction` zod union gains `handoffPath: z.string().optional()` |
| Wire manifest | `packages/agent-core-v2/docs/wire-manifest.d.ts` | regenerated (`pnpm gen:wire-manifest`); `test/wire/wireManifest.test.ts` must pass |
| kap-server zod | `packages/kap-server/src/protocol/events-zod.ts` | `compactionResultSchema` gains the optional field |
| klient contract | `packages/klient/src/contract/agent/events.ts` | `compactionCompletedEventSchema.result` gains the optional field |
| TUI types | `apps/kimi-code/src/tui/types.ts` | `CompactionTranscriptData` gains `handoffPath?: string` |
| TUI live handler | `apps/kimi-code/src/tui/controllers/session-event-handler.ts` | `handleCompactionEnd` passes `event.result.handoffPath` into the compaction block |
| TUI replay | `apps/kimi-code/src/tui/controllers/session-replay.ts` | `renderCompaction` passes the record's `handoffPath` into `compactionData` |
| TUI component | `apps/kimi-code/src/tui/components/dialogs/compaction.ts` | `buildHeader` renders `Handoff saved: <path>` when present |

## Compatibility rules

- Absent field ≡ no handoff. Every surface treats absence exactly as today — flag off,
  manual source, failed generation, and pre-feature journals are indistinguishable and all
  render nothing extra.
- Old clients receiving the widened payload ignore the unknown optional field (zod schemas
  are additive; the field is optional in every schema).
- New clients receiving pre-feature payloads see the field absent and render nothing.
- The `CompactionCompleted` event keeps stripping only `contextSummary`
  (`fullCompactionService.ts:620-631`); `handoffPath` must survive that spread.
- Rename/reshape of existing fields: none. The durable record union's legacy shapes
  (`contextEvents.ts` shapes 2 and 3) are untouched.
- kap-server's transcript mapping (`src/services/transcript/coreEventMap.ts:446-455`) keeps
  mapping the event to the existing `compaction` marker op; the marker's payload passes the
  field through where its type already mirrors `CompactionResult`.

## Out of scope (unchanged in v1)

- REST action `POST /sessions/{tail}` action `compact` — request/response shapes untouched.
- klient facade `AgentFacade.compact()` — untouched.
- node-sdk typed helpers (`setCompactionTriggerRatio`, status fields) — untouched.
- `/compact`, `/compact-threshold`, `/compact-threshold-k`, `/squeeze-model*` commands —
  untouched.
