## Related Issue

Closes #14

## Problem

Changing the model on a session did not reach the swarm subagents that session had already spawned. A paused subagent kept the model it was bound to at spawn, so a user who exhausted the current model's quota could not move a swarm onto another model — they had to wait or abandon the swarm.

Subagents also did not follow the session's fallback-model configuration: a subagent whose turn failed on a rate limit or model error failed the swarm item outright instead of cascading to the fallback model the way the main agent loop does.

## What changed

- `spawn()` now records how the child's model was chosen, as a `modelSource` subagent label (`forced`, `primary_override`, `inherited`, `secondary_pool`); `subagentModelSource(meta)` reads it back.
- On resume/retry, a swarm subagent whose model was inherited (`inherited` / `primary_override`) is rebound to the caller's current model. A child with an explicit choice — a forced model or a model-pool binding — keeps its own model.
- `spawn()` copies the caller's `fallback`, `fallbackSecondary`, and `substitute` session-model overrides onto every child via the new `inheritFallbackOverrides(target, source)` helper. The copy sits at the shared spawn layer (not swarm-only), so every subagent kind and tower worker follows the same fallback mechanism as its parent.

Rebinding happens on resume/retry rather than as a broadcast on the parent's model-change event, so a subagent in the middle of a turn is never interrupted; it picks up the new model when it next resumes.

No user-facing documentation describes per-subagent model binding, so no doc update is included.

## Verification

- New tests: `sessionSwarm.test.ts` — an inherited child moves from its stale model to the caller's current model on resume (and the `subagent.spawned` event reports the new model), a pool-bound child keeps its model, and a resumed child picks up the caller's fallback override. `spawn.test.ts` — `fallback`, `fallbackSecondary`, and `substitute` propagate to a child while `secondary` does not.
- `corepack pnpm exec vitest run .../sessionSwarm.test.ts .../spawn.test.ts` → 61 passed (61).
- Full `agent-core-v2` suite, A/B against a stashed baseline: with the fix 40 failed / 6662 passed (7 files); baseline 52 failed / 6646 passed (12 files). The failure set with the fix is a strict subset of the baseline. The 34 failures present in both runs (`swarm.test.ts` 10, `tower/tools/spawnTool.test.ts` 23, `tool.test.ts` 1) are pre-existing — their profile stubs lack `getSessionModelOverride`, which `planSpawn` already required at `subagentService.ts:133` on `master`. The baseline's 8 additional `spawn.test.ts` failures are repaired by this change. The remaining differences are timing-sensitive tests that pass when re-run.
- `node scripts/check-no-comments.mjs` → OK (1809 files). `typecheck` reports only the 2 pre-existing errors in the untouched `packages/oauth`.

## Known follow-up (not fixed here)

The fork's `substitute-model` mechanism is currently dead for all agents, main and swarm alike: its arming code lived in `agent/stepRetry/stepRetryService.ts`, which upstream refactor `485594f6` deleted, and the file was never listed in `.github/FORK_OWNED_FILES`. Nothing writes `substituteModelActiveKey`, so `substitute` can never engage. This change propagates the `substitute` override but cannot make it fire. That is out of scope for this bug and should be filed separately, restoring the arming site and adding it to the fork-owned guard list.

## Checklist

- [x] I have read the [CONTRIBUTING](https://github.com/MoonshotAI/kimi-code/blob/main/CONTRIBUTING.md) document.
- [x] I have linked a related issue (this fork's own bug tracker, issue #14).
- [x] I have added tests that prove my feature works.
- [x] Ran `gen-changesets` skill, or this PR needs no changeset.
- [x] Ran `gen-docs` skill, or this PR needs no doc update.
