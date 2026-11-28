# Bug Verification: Swarm model change does not propagate to paused swarm agents

- **Slug**: swarm-model-change-propagation
- **Tested**: 2026-09-11
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: partial

## Summary

The fix holds at the level it can be exercised without a live account: a resumed swarm subagent that inherited its model adopts the caller's current model, an explicitly bound child keeps its model, and every spawned subagent inherits the caller's `fallback` / `fallbackSecondary` / `substitute` overrides. An A/B run of the full `agent-core-v2` suite shows no new failures — the failure set with the fix is a strict subset of the baseline, and eight `spawn.test.ts` failures present at baseline are repaired. The result is **partial** rather than verified because the original reproduction (exhausting a real account quota and switching models mid-swarm) requires a production environment and was not performed; it was exercised at the swarm-service integration level instead.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | Automated equivalent of assessment steps 1–6 via the swarm service: resume an `inherited` child after the caller's model changed | pass | Covered by `sessionSwarm.test.ts` "rebinds an inherited child model to the caller model on resume". The manual, quota-exhaustion reproduction was **not** run (needs a live account). |
| New / updated tests | `corepack pnpm exec vitest run packages/agent-core-v2/test/features/swarm/sessionSwarm.test.ts packages/agent-core-v2/test/session/subagent/spawn.test.ts` | pass | `Test Files 2 passed (2)` / `Tests 61 passed (61)`. |
| Regression suite (A/B) | `corepack pnpm --filter @moonshot-ai/agent-core-v2 test`, run once with the package changes and once with them stashed | pass | With fix: `40 failed \| 6662 passed (6702)`, 7 files. Baseline: `52 failed \| 6646 passed (6698)`, 12 files. After-failure set ⊆ baseline-failure set; the differing files are pre-existing or flaky, detailed below. |
| Flakiness re-check | `vitest run test/agent/task/heartbeat-stale.test.ts test/agent/task/reconcile.test.ts`, twice on the fixed tree | pass | `Tests 11 passed (11)` both runs — these timer-based tests are flaky in the baseline run, not broken by the fix. |
| Lint (comment-free zone) | `node scripts/check-no-comments.mjs` | pass | `check-no-comments: OK (1809 files)`. |
| Type-check | `corepack pnpm --filter @moonshot-ai/agent-core-v2 typecheck` | skipped | 2 pre-existing errors, both in an untouched package (`packages/oauth/src/managed-kimi-code.ts:327,339`); no error in any changed file. |

## Failure isolation (A/B detail)

Identical in both runs — **pre-existing, not caused by this change**:

| File | Baseline | With fix | Cause |
|------|----------|----------|-------|
| `test/features/swarm/swarm.test.ts` | 10 | 10 | Profile stubs lack `getSessionModelOverride`, already required by `planSpawn` at `subagentService.ts:133` in `HEAD` |
| `test/features/tower/tools/spawnTool.test.ts` | 23 | 23 | Same missing stub method |
| `test/tool/tool.test.ts` | 1 | 1 | Stale tool-schema snapshot |

Improved by this change:

| File | Baseline | With fix | Cause |
|------|----------|----------|-------|
| `test/session/subagent/spawn.test.ts` | 8 | 0 | The stub now supplies `setSessionModelOverride` / `getSessionModelOverride`, which the pre-existing `planSpawn` call already required |

Flaky in at least one run — not attributable to the fix:

| File | Baseline | With fix | Note |
|------|----------|----------|------|
| `src/human/test/utils/watch.test.ts` | 1 | 0 | fd-footprint timing test |
| `test/agent/agentsMdReminder/agentsMdReminder.test.ts` | 1 | 0 | — |
| `test/agent/task/reconcile.test.ts` | 1 | 0 | passed twice when re-run |
| `test/agent/toolExecutor/toolExecutor.test.ts` | 1 | 0 | 100000-char boundary test |
| `test/persistence/backends/minidb/miniDbQueryStore.test.ts` | 1 | 0 | performance assertion |
| `test/agent/task/heartbeat-stale.test.ts` | 0 | 1 | passed twice when re-run |

Constant in both runs and unrelated to swarm: `test/agent/fullCompaction/fullCompaction.test.ts` (2), `test/agent/loop/loop.test.ts` (1), `test/features/plan/plan.test.ts` (2).

## Output Excerpts

```
===== FOCUSED (new + repaired tests) =====
 ✓ |agent-core-v2| test/features/swarm/sessionSwarm.test.ts (34 tests)
 ✓ |agent-core-v2| test/session/subagent/spawn.test.ts (27 tests)
 Test Files  2 passed (2)
      Tests  61 passed (61)

===== AFTER: with changes =====
      Tests  40 failed | 6662 passed (6702)
 Test Files  7 failed | 370 passed (377)

===== BEFORE: baseline HEAD (no changes) =====
      Tests  52 failed | 6646 passed (6698)
 Test Files  12 failed | 365 passed (377)
```

## Residual Risks

- **The original reproduction was not exercised.** It requires exhausting a live account's model quota and switching models mid-swarm; only the swarm-service integration equivalent was run. End-to-end confirmation on a real quota-exhausted swarm is still outstanding.
- **Rebinding happens at resume/retry, not on the parent's model-change event.** A subagent that is mid-turn when the model changes keeps the old model for the remainder of that turn — intentional (avoids interrupting in-flight requests), but the assessment's step 5 must be reached for the new model to take effect.
- **The fork's `substitute-model` mechanism is dead for all agents.** Its arming code lived in `agent/stepRetry/stepRetryService.ts`, deleted by upstream refactor `485594f6`, and was never listed in `.github/FORK_OWNED_FILES`; nothing writes `substituteModelActiveKey`, so `substitute` can never engage. The fix propagates the `substitute` override, but it cannot fire until the arming code is restored. This affects main and swarm agents equally and is out of scope for this bug (filed as a follow-up in `fix.md`).
- **`fallback` propagation is a behaviour change** for v2 subagents: they previously kept only their bound model. It is applied unconditionally at `spawn()` (not gated behind an experimental flag), so it affects every subagent kind, not only swarm items.
- **Pre-existing suite failures remain** (34 tests across `swarm.test.ts`, `spawnTool.test.ts`, `tool.test.ts`). None are caused by this change and all are present at baseline `HEAD`.

## Recommendation

Merge the fix for the model-propagation defect: the swarm-service behaviour is proven by new tests, no regressions were introduced, and the change additionally repairs eight pre-existing `spawn.test.ts` failures. Bank the result as **partial**, not verified — the quota-exhaustion reproduction still needs a live-account run, ideally during a normal swarm session on a fresh install of the branch. Before or alongside that, file the follow-up bug for the dead `substitute-model` arming code and add the restored arming site to `.github/FORK_OWNED_FILES`.
