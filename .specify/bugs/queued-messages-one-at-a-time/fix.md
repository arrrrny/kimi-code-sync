# Bug Fix: Queued messages are all sent at once instead of one per turn

- **Slug**: queued-messages-one-at-a-time
- **Fixed**: 2026-11-27
- **Assessment**: ./assessment.md
- **Status**: applied
- **Branch**: fix/queued-messages-one-at-a-time
- **Revision**: uncommitted (fix applied on branch; commit created during PR step)

## Summary

The steer path (`steerQueuedMessagesIntoRunningTurn`) coalesced every consecutive
steerable queued message into a single batch and dispatched them with one
`session.steer(...)` call, so the agent received the whole queue merged (e.g.
`"first\n\nsecond"`). The fix removes the batching loop so each queued message is
steered individually, and the existing `sendNext()` continuation releases the next
message only after the previous steer settles — matching the one-at-a-time drain
used by `finalizeTurn` and the one-at-a-time promotion used by queued goals.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `apps/kimi-code/src/tui/kimi-tui.ts` | modified | Dropped the grouping loop in `steerQueuedMessagesIntoRunningTurn`; `group` is now always a single message. |
| `apps/kimi-code/test/tui/kimi-tui-message-flow.test.ts` | updated tests | Updated 7 tests that asserted the old merged-batch behavior to expect sequential single-message steers. |

## Diff Highlights (optional)

Before — the batch loop that merged the queue:

```ts
const group = [first];
if (first.inlineSkillActivations === undefined) {
  while (pending[0] !== undefined && pending[0].inlineSkillActivations === undefined) {
    const next = pending.shift()!;
    if (this.state.queuedMessages.includes(next)) group.push(next);
  }
}
```

After — one message per steer; `sendNext()` already fans out the rest:

```ts
const group = [first];
```

## Tests Added or Updated

- `kimi-tui-message-flow.test.ts` "steers messages queued before a WaitFor starts
  into the running turn one at a time" — two queued notes now produce two
  sequential `session.steer` calls (`'first note'`, then `'second note'`) instead
  of one merged `'first note\n\nsecond note'`.
- `... "keeps tower Enter steering the queue with follow_up_behavior %s"` — expects
  `queued objective` then `next objective` as two steers.
- `... "steers the compaction backlog ahead of fresh input once compaction ends
  mid-turn"` — expects `objective one` then `objective two` as two steers.
- `... "releases every queued use of shared media after steering them one at a
  time"` — shared media still deleted exactly once after both single-message
  steers and turn end.
- `... "steers consecutive image-only messages one at a time without a separator
  part"`, `"steers a media item followed by plain text one at a time"`,
  `"steers plain text followed by a media item one at a time"` — each message
  steered on its own, no `\n\n` separator part.

## Local Verification

- `pnpm vitest run apps/kimi-code/test/tui/kimi-tui-message-flow.test.ts` → 556 passed / 556 total.
- `pnpm vitest run apps/kimi-code/test/tui/utils/steer-input.test.ts apps/kimi-code/test/tui/components/dialogs/message-queue-manager.test.ts apps/kimi-code/test/tui/components/panes/queue-pane.test.ts` → 38 passed.
- Note: a `pnpm install` was required first to relink `proper-lockfile` into
  `packages/kap-server/node_modules` (the test file transitively imports
  kap-server); this was an incomplete-install environment issue, not a code fault.

## Deviations from Assessment

None. The fix matches the preferred remediation: dispatch queued messages one at a
time in the steer path. `combineSteerInput` is unchanged (still used with a single
item); its unit tests remain valid.

## Follow-ups

- The Alt+Q message queue manager still labels the shortcut "Alt+Q" in the editor
  hint while the queue pane shows the manage affordance; the user noted this is a
  cosmetic mismatch, out of scope for this bug.
- `combineSteerInput`'s multi-item separator branch is now only exercised by its
  own unit tests (no production caller passes >1 item); left in place to avoid an
  unrelated change.