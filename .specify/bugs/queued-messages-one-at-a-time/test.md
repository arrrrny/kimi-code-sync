# Bug Test: Queued messages are all sent at once instead of one per turn

- **Slug**: queued-messages-one-at-a-time
- **Tested**: 2026-11-27
- **Fix**: ./fix.md
- **Result**: verified

## Reproduction re-check

The original symptom was the steer path merging the whole queue into one
`session.steer(...)` call. The pinned regression test now asserts the corrected
behavior:

- `apps/kimi-code/test/tui/kimi-tui-message-flow.test.ts` → "steers messages
  queued before a WaitFor starts into the running turn one at a time": two queued
  notes produce two sequential steers (`'first note'`, then `'second note'`), not
  one merged `'first note\n\nsecond note'`.

The normal per-turn drain (finalizeTurn) and the queued-goal promotion were already
one-at-a-time and remain unchanged.

## Commands run

- `pnpm vitest run apps/kimi-code/test/tui/kimi-tui-message-flow.test.ts`
  → **556 passed / 556 total** (0 failed).
- `pnpm vitest run apps/kimi-code/test/tui/utils/steer-input.test.ts apps/kimi-code/test/tui/components/dialogs/message-queue-manager.test.ts apps/kimi-code/test/tui/components/panes/queue-pane.test.ts`
  → **38 passed** (12 + 16 + 10).

Environment note: `pnpm install` was run first to relink `proper-lockfile` into
`packages/kap-server/node_modules` (the message-flow file transitively imports
kap-server). This was an incomplete-install issue, not a code failure.

## Behaviors pinned

- Two queued messages ahead of a WaitFor → two single-message steers, in order.
- Tower-mode Enter with a pre-queued message → the queued message steers first,
  then the freshly typed one, as two steers.
- Compaction backlog released after compaction ends mid-turn → two single-message
  steers.
- Shared media used by two queued messages is still deleted exactly once after
  both single-message steers and turn end (no premature or double delete).
- Image-only, media→text, and text→media queues steer each message on its own with
  no whitespace-only separator part.
- `combineSteerInput` unit tests unchanged and green (utility itself unchanged).
- Alt+Q manager `send-all` action and queue-pane rendering unchanged and green.

## Verdict

Verified. The fix delivers queued messages one at a time through every steer path
(tower mode, WaitFor, manual Ctrl-S, and the Alt+Q "send all"), matching the
queued-goal semantics requested. No regressions in the message-flow, steer-input,
message-queue-manager, or queue-pane suites.