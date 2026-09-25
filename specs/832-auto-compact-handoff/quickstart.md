# Quickstart: Auto-Compact Handoff Document

Validation scenarios for the delivered feature. All of them run offline against the vitest
harness (scripted model output, temp home dirs); none needs a live provider.

Setup (every shell):

```bash
cd /Users/arrrrny/Developer/kimi-code-sync
export PATH="/usr/local/lib/node_modules/corepack/shims:$PATH"
```

## Scenario 1 — Flag on, auto-compaction produces a handoff (P1 / SC-001, SC-002)

```bash
pnpm vitest run packages/agent-core-v2/test/agent/fullCompaction/fullCompaction.test.ts \
  -t "produces a handoff document before an auto compaction replaces the history"
```

Expected: the harness drives an agent past the trigger ratio with the flag enabled via the
per-flag env (`KIMI_CODE_EXPERIMENTAL_COMPACTION_HANDOFF=1` is set through the harness
config, not the shell — the engine test setup strips ambient `KIMI_CODE_*`), the scripted
model answers the summary request and the handoff request, and the test asserts:

- an atomic file exists under `<tempHome>/sessions/<ws>/<session>/agents/<agent>/handoff/`
  whose name matches the `<date>T<time>-<seq>.md` shape;
- the document contains the seven section headings;
- the model-facing composed summary (the `context.apply_compaction` record's
  `contextSummary`) contains the pointer footer with the same path;
- the `compaction.completed` event payload carries `handoffPath` equal to that path.

## Scenario 2 — Flag off is byte-for-byte today (P3 / SC-004)

```bash
pnpm vitest run packages/agent-core-v2/test/agent/fullCompaction/fullCompaction.test.ts \
  -t "makes no handoff request or file when the compaction-handoff flag is off"
```

Expected: the same threshold crossing with the flag off produces exactly the requests the
baseline produces (assert on the scripted-request log: no `full_compaction_handoff` kind),
no file under `handoff/`, and a `compaction.completed` payload without `handoffPath`.

## Scenario 3 — Generation failure degrades, compaction survives (P3 / SC-003)

```bash
pnpm vitest run packages/agent-core-v2/test/agent/fullCompaction/fullCompaction.test.ts \
  -t "completes the compaction when handoff generation fails"
```

Expected: the scripted handoff request throws; the compaction still completes with its
summary, a `WarningIssued` with code `compaction-handoff-failed` is observed,
`compaction_finished` records `handoff_generated: false`, no file is written, and the
completed payload has no `handoffPath`.

## Scenario 4 — Manual compaction is untouched (P3)

```bash
pnpm vitest run packages/agent-core-v2/test/agent/fullCompaction/fullCompaction.test.ts \
  -t "never generates a handoff for a manual compaction"
```

Expected: `begin({ source: 'manual' })` with the flag on performs no handoff request and
writes no file.

## Scenario 5 — Two auto-compactions, two documents, resume pointer (P1 / FR-004)

```bash
pnpm vitest run packages/agent-core-v2/test/agent/fullCompaction/fullCompaction.test.ts \
  -t "names a second handoff distinctly and points at the first"
```

Expected: driving the agent across the threshold twice yields two files (different `<seq>`),
the first is untouched, and the second request's prompt carries the first document's path as
the resume pointer.

## Scenario 6 — Widened surface end to end (P2 / FR-006, FR-010)

```bash
pnpm vitest run packages/kap-server/test/sessionEventBroadcaster.test.ts \
  -t "compaction"
pnpm vitest run apps/kimi-code/test/tui/controllers/session-event-handler-compaction.test.ts
pnpm vitest run apps/kimi-code/test/tui/components/dialogs/compaction.test.ts
pnpm vitest run packages/agent-core-v2/test/wire/wireManifest.test.ts
```

Expected: the broadcaster's completed-event schema accepts and forwards `handoffPath`; the
TUI handler forwards it into the compaction block; the block header renders
`Handoff saved: <path>` and renders nothing extra when the field is absent; the regenerated
wire manifest is fresh.

## Before committing

```bash
pnpm vitest run packages/agent-core-v2/test/agent/fullCompaction
pnpm lint        # includes scripts/check-no-comments.mjs — new engine files must be comment-free
pnpm gen:wire-manifest   # already run if Scenario 6 passes; idempotent
```

The full `pnpm test` suite is **not** a gate for this feature (819 s, and its baseline is
red on three files unrelated to compaction — see `.specify/memory/tdd-profile.md`).
