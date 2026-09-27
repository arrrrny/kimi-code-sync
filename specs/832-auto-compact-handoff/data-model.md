# Phase 1 Data Model: Auto-Compact Handoff Document

Two layers, deliberately separated: **the persisted artifact** (the handoff file beside the
session's records) and **the in-memory/wire entities** (the generation inputs, the result
field, and the flag). The engine reads the artifact back never in v1 — it is write-once per
compaction; only humans and resumed agents consume the file.

---

## Persisted entity

### HandoffDocument (new, write-once file)

Owner: `packages/agent-core-v2/src/agent/fullCompaction/handoffDocument.ts`; stored via
`IBlobStore.put` under the agent's persistence scope.

| Aspect | Value | Notes |
|---|---|---|
| Scope | `<home>/sessions/<workspaceId>/<sessionId>/agents/<agentId>/` | existing agent persistence scope (`sessionLifecycle/internal/addressing.ts:7-17`) |
| Key | `handoff/<ISO-local-date>T<HH-MM-SS-mmm>-<seq>.md` | atomic write by `BlobStoreService.put` (`blobStoreService.ts:12-14`) |
| `<seq>` | monotonic per-service counter, starts at 1 | the service is Agent-scoped (`fullCompactionService.ts:1163-1169`), so the counter spans the session's process lifetime; the ms timestamp disambiguates across restarts |
| Ordering | lexicographic = chronological | FR-004: a new handoff never overwrites an earlier one |
| Content | the model's document, stored as produced | fixed section structure requested by the prompt (below); not parsed or verified by the engine (spec edge case) |

Section structure requested by `handoff-instruction.md` (FR-002, in order):

1. `## Resume from` — previous handoff path + one line on what changed since (omitted when
   there is no previous handoff)
2. `## Session Gist` — the through-line, a short paragraph
3. `## Current State` — task under way, branch/filesystem state, artifacts in play
4. `## The Threads` — each open thread with its next concrete action
5. `## Gotchas` — failures hit and the fixes that worked
6. `## Files and Artifacts Touched` — paths and what happened to them
7. `## Open Questions` — decisions pending or ambiguous

### Storage path (derived, not stored)

The path surfaced to clients and the summary pointer:
`<sessionDir>/agents/<agentId>/handoff/<name>.md`, computed from
`ISessionContext.sessionDir` + the agent id exactly the way `AgentPlanService.planFilePathFor`
does (`src/features/plan/planService.ts:238-245`). It is derivable, never persisted as its own
fact anywhere except inside the compaction result (below) and the summary prose.

---

## Wire entities

### CompactionResult (extended)

Owner: `packages/agent-core-v2/src/agent/fullCompaction/types.ts:1-10`. Already shared by the
durable `ContextApplyCompaction` record and the observable `CompactionCompleted` event.

| Field | Type | Notes |
|---|---|---|
| `summary` | `string` | existing |
| `contextSummary` | `string?` | existing; now composed as `summaryText + handoff footer + recovery footer` |
| `compactedCount`, `tokensBefore`, `tokensAfter` | `number` | existing |
| `keptUserMessageCount?`, `keptHeadUserMessageCount?`, `droppedCount?` | `number?` | existing |
| `handoffPath` | `string?` | **new**; absent ≡ no handoff (flag off, manual source, generation failed, pre-feature journal) |

Schema mirrors that gain the same optional field:

| Surface | File | Schema |
|---|---|---|
| Durable journal record | `packages/agent-core-v2/src/agent/contextMemory/contextEvents.ts:71-98` | `ContextApplyCompaction` union shape 1 |
| kap-server WS zod | `packages/kap-server/src/protocol/events-zod.ts:456-464` | `compactionResultSchema` |
| klient contract | `packages/klient/src/contract/agent/events.ts:161-173` | `compactionCompletedEventSchema.result` |
| Generated wire manifest | `packages/agent-core-v2/docs/wire-manifest.d.ts` | regenerated via `pnpm gen:wire-manifest` |

### TUI transcript entity (extended)

`CompactionTranscriptData` (`apps/kimi-code/src/tui/types.ts:182-189`) gains
`handoffPath?: string`; filled by both the live handler
(`session-event-handler.ts:1142-1159`) and the replay renderer
(`session-replay.ts:575-598`); rendered by `CompactionComponent.buildHeader`
(`components/dialogs/compaction.ts:163-188`) as a `Handoff saved: <path>` line when present.

---

## Runtime entities (not persisted)

### CompactionHandoffState (per AgentFullCompactionService instance)

| Field | Type | Meaning |
|---|---|---|
| `sequence` | `number` | counter for `<seq>`; increments on every generated document |
| `lastHandoffPath` | `string \| undefined` | previous document's path, fed to the next prompt's `## Resume from`; first handoff has none |

Both live only as long as the agent scope; the timestamp in the name keeps the on-disk
sequence unambiguous across process restarts.

### Generation input (function arguments, not state)

| Field | Type | Source |
|---|---|---|
| `history` | pre-compaction context messages | the same input `compactionRound` already holds |
| `instruction` | `string \| undefined` | `FullCompactionBegin.instruction`, carried through the round |
| `previousHandoffPath` | `string \| undefined` | `lastHandoffPath` |
| `binding` | resolved compaction model | `compactionModelBindingFor(...)` (`fullCompactionService.ts:683-765`) |

---

## Flag definition

`src/agent/fullCompaction/flag.ts` (new), pattern of `src/session/compaction/flag.ts`:

| Field | Value |
|---|---|
| `id` | `compaction-handoff` |
| `title` | `Handoff document before auto-compaction` |
| `env` | `KIMI_CODE_EXPERIMENTAL_COMPACTION_HANDOFF` |
| `default` | `false` |
| `surface` | `core` |

Precedence: per-flag env > `[experimental]` config > `KIMI_CODE_EXPERIMENTAL_FLAG` > default
(root AGENTS.md, "Experimental Features"). Checked in `compactionRound` next to the
`source === 'auto'` gate; off ⇒ no LLM call, no file, no payload field (SC-004).

## Telemetry (registered, no user content)

`compaction_finished` (registered in `src/app/telemetry/events.ts`, emitted at
`fullCompactionService.ts:955-986`) gains one property:

| Property | Type | Meaning |
|---|---|---|
| `handoff_generated` | `boolean` | the run produced and persisted a handoff document |

The storage path is never a telemetry property (privacy rule, package AGENTS.md). Emission
paths that predate the property are updated in the same change so the property is always
present on `compaction_finished`.
