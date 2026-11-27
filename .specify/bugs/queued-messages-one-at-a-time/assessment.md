# Bug Assessment: Queued messages are all sent at once instead of one per turn

- **Slug**: queued-messages-one-at-a-time
- **Created**: 2026-11-27
- **Source**: pasted text (user report)
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim or summarized)

> "the real issue is that when agent complete its turn, it sends all the queued
> messages at once. That was always like that but completely against the purpose
> of queueing multiple, just like the queued goals are handled one at a time,
> queued messages should be sent 1 at a time after agent completes its turn the
> next one."

The user previously asked for managing queued messages "exactly as managing the
queued goals" (the Alt+Q message queue manager). The remaining complaint is about
delivery, not the manager UI: multiple queued messages are delivered together
rather than one per turn.

## Symptom

When several messages are queued while a turn is running and the queue is
steered into that running turn (tower/goal mode, or while a `WaitFor` call is
waiting), the whole batch of consecutive queued messages is combined and sent as
a single steer request. The agent receives one merged user message (e.g.
`"first note\n\nsecond note"`) instead of the messages arriving one at a time.

Expected: queued messages are delivered one at a time — the next message is
released only after the previous one has been delivered, mirroring how queued
goals are promoted strictly one at a time (`promoteNextQueuedGoal`).

## Reproduction

1. Start a session and make a turn run (e.g. enable tower mode, or start a
   `WaitFor` call so `canSteerQueueIntoRunningTurn()` becomes true).
2. While that turn is running, queue two or more messages (type + Enter each
   time). They land in `state.queuedMessages`.
3. Observe the steer dispatch: a single `session.steer(...)` call fires whose
   text is the messages joined with `\n\n`.

This is pinned by an existing test,
`apps/kimi-code/test/tui/kimi-tui-message-flow.test.ts:7609`
("steers messages queued before a WaitFor starts into the running turn"):

```
expect(session.steer).toHaveBeenCalledTimes(1);
expect(session.steer).toHaveBeenCalledWith('first note\n\nsecond note', { promptId: expect.any(String) });
```

The normal (non-steer) drain is already one-at-a-time — see the FIFO test at
`kimi-tui-message-flow.test.ts:6340`, where only `first` is sent on the first
`turn.ended`, `second` only after the next turn ends.

## Suspected Code Paths

- `apps/kimi-code/src/tui/kimi-tui.ts:2565` — `steerQueuedMessagesIntoRunningTurn()`:
  builds `const group = [first]` and then a `while` loop pushes every following
  consecutive steerable message into the same `group`, and dispatches the whole
  group through one `steerMessage(session, items, ...)` call. This is the batch.
- `apps/kimi-code/src/tui/kimi-tui.ts:2818` — `steerMessage()`: accepts
  `readonly SteerInputItem[]` and `combineSteerInput(items)` merges them into a
  single payload (the `\n\n` join observed by the test).
- `apps/kimi-code/src/tui/kimi-tui.ts:1563` — `drainOneQueuedMessage()` and
  `apps/kimi-code/src/tui/controllers/streaming-ui.ts:496` — `finalizeTurn()`:
  the reference one-at-a-time behavior the fix should match.
- `apps/kimi-code/src/tui/controllers/session-event-handler.ts:934` —
  `promoteNextQueuedGoal()`: the queued-goal one-at-a-time reference.

## Root Cause Hypothesis

Confidence: high. `steerQueuedMessagesIntoRunningTurn` intentionally coalesces
all consecutive steerable queued messages into one `group` and sends them with a
single `steerMessage` call. `combineSteerInput` then concatenates the item texts
(joined by `\n\n`), so the agent sees them as one merged message. There is no
per-message settle between items, so the queue empties in one shot. This differs
from both the per-turn drain and the queued-goal promotion, which release exactly
one item at a time.

## Proposed Remediation

**Preferred**: Make the steer path dispatch queued messages one at a time. In
`steerQueuedMessagesIntoRunningTurn`, stop coalescing the batch: send a single
message per steer (`group = [first]`, drop the inner `while` that absorbs
following messages), and rely on the existing `sendNext()` continuation (called
after each steer settles) to release the next message only after the previous
one settles. The recursion/continuation already re-checks
`canSteerQueueIntoRunningTurn()` and falls back to `drainQueueIfIdle()` when the
turn is no longer steerable, so the remaining queue drains one per turn.

This keeps the intended "inject into the running turn" capability (tower mode /
`WaitFor`) but delivers each queued message individually and in order, matching
the queued-goal semantics the user asked for.

**Alternatives**:
- Fully disable auto-steer for the ordinary queue and always release one message
  per turn via the drain path. Larger behavior change; regresses the tower-mode /
  `WaitFor` "inject now" feature and many existing tests. Not preferred.
- Keep batching but split on the agent side. Rejected: the merge happens in the
  TUI before the SDK call; the agent cannot un-merge reliably.

**Files likely to change**:
- `apps/kimi-code/src/tui/kimi-tui.ts` (`steerQueuedMessagesIntoRunningTurn`)
- `apps/kimi-code/test/tui/kimi-tui-message-flow.test.ts` (update the batching
  test at :7609 and add a one-at-a-time assertion)

**Tests to add or update**:
- Update `kimi-tui-message-flow.test.ts:7609` so two queued messages produce two
  sequential `session.steer` calls (`'first note'`, then `'second note'`) rather
  than one merged `'first note\n\nsecond note'`.
- Add a test that the second message is dispatched only after the first steer
  settles (one-at-a-time ordering), and that the queue drains one per turn when
  the turn ends mid-steer.
- Keep the single-message steer tests (tower mode :7532, WaitFor :7595) green —
  a single queued message must still steer exactly as before.

## Risks & Considerations

- Behavior change: users who relied on multiple queued messages being merged into
  one steer will now get them as separate steers. This is the requested change.
- Ordering/timing: the continuation must preserve FIFO order and not drop
  messages when the turn ends between steers; the existing `sendNext` /
  `drainQueueIfIdle` fallback already handles the turn-ended case.
- Media/skill messages: messages with inline skill activations or attachments were
  already excluded from the batch loop (`inlineSkillActivations === undefined`
  guard); the one-at-a-time change must keep that guard so skill/media steers are
  unaffected.
- No API/contract change; TUI-only.

## Open Questions

- None blocking. The fix preserves the steer-into-running-turn feature while
  making delivery one message at a time, which satisfies "sent 1 at a time ...
  the next one" and "just like the queued goals are handled one at a time".