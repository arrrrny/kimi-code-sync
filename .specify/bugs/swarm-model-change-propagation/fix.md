# Bug Fix: Swarm model change does not propagate to paused swarm agents

- **Slug**: swarm-model-change-propagation
- **Fixed**: 2026-09-11
- **Assessment**: ./assessment.md
- **Status**: applied
- **Branch**: fix/swarm-model-change-propagation
- **Revision**: uncommitted

## Summary

Paused or resumed swarm subagents now adopt the caller's current model when they had inherited it at spawn, and every spawned subagent copies the caller's session-level `fallback`, `fallbackSecondary`, and `substitute` model overrides, so a swarm subagent follows the same fallback mechanism as its parent.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `packages/agent-core-v2/src/session/agentLifecycle/subagentMetadata.ts` | modified | `subagentLabels` records `modelSource`; new `subagentModelSource(meta)` reader |
| `packages/agent-core-v2/src/session/subagent/configSection.ts` | modified | new `inheritFallbackOverrides(target, source)` helper |
| `packages/agent-core-v2/src/session/subagent/subagentService.ts` | modified | `spawn()` copies the caller's fallback overrides onto the child (fork and create paths) |
| `packages/agent-core-v2/src/features/swarm/session/sessionSwarmService.ts` | modified | spawn records `modelSource`; resume/retry refreshes fallback overrides and rebinds inherited models |
| `packages/agent-core-v2/test/features/swarm/sessionSwarm.test.ts` | added tests | profile stub gains `setModel` / override methods; 3 new tests |
| `packages/agent-core-v2/test/session/subagent/spawn.test.ts` | added test | spawn-time override propagation; profile stubs gain override methods |
| `packages/agent-core-v2/test/tool/tool.test.ts` | modified | profile stub gains the two override methods (required by the new `spawn()` calls) |
| `.changeset/swarm-subagent-model-fallback.md` | added | user-facing patch changeset |

## Diff Highlights

```ts
  private async rebindInheritedModel(
    meta: AgentMeta | undefined,
    callerProfile: IAgentProfileService,
    childProfile: IAgentProfileService,
  ): Promise<void> {
    const source = subagentModelSource(meta);
    if (source !== 'inherited' && source !== 'primary_override') return;
    const callerModel = callerProfile.data().modelAlias;
    if (callerModel === undefined || childProfile.data().modelAlias === callerModel) return;
    await childProfile.setModel(callerModel);
  }
```

```ts
const INHERITED_SESSION_MODEL_OVERRIDE_KINDS: readonly SessionModelOverrideKind[] = [
  'fallback',
  'fallbackSecondary',
  'substitute',
];
```

## Tests Added or Updated

- `sessionSwarm.test.ts` — "rebinds an inherited child model to the caller model on resume": an `inherited` child moves from `stale-model` to the caller's `kimi-test`, and the `subagent.spawned` event reports the new model.
- `sessionSwarm.test.ts` — "keeps a pool-bound child model on resume": a `secondary_pool` child keeps its own model (explicit choice is not overridden).
- `sessionSwarm.test.ts` — "inherits the caller fallback model overrides on resume": the child picks up the caller's `fallback` override.
- `spawn.test.ts` — "inherits the caller fallback model overrides": `fallback`, `fallbackSecondary`, and `substitute` propagate; `secondary` does not.
- `sessionSwarm.test.ts` — existing "keeps resumed children on their own recorded model" still passes unchanged (a child with no recorded `modelSource` is left alone; legacy behaviour preserved).

## Local Verification

- Red first: with tests added and production unchanged, `sessionSwarm.test.ts` failed with `expected 'stale-model' to be 'kimi-test'` and `expected undefined to be 'fb-model'`; `spawn.test.ts` failed with `expected undefined to be 'fb-model'`.
- After the fix, focused suites:
  - `corepack pnpm exec vitest run packages/agent-core-v2/test/features/swarm/sessionSwarm.test.ts packages/agent-core-v2/test/session/subagent/spawn.test.ts` → 61 passed (61).
  - `corepack pnpm exec vitest run packages/agent-core-v2/test/tool/tool.test.ts` → 126 passed, 1 failed (pre-existing snapshot drift; see below).
- `node scripts/check-no-comments.mjs` → `check-no-comments: OK (1809 files)`.
- `corepack pnpm --filter @moonshot-ai/agent-core-v2 typecheck` → 2 errors, both pre-existing and in an untouched package (`packages/oauth/src/managed-kimi-code.ts:327,339`).
- Package suite delta: TBD — recorded in `test.md`.

## Deviations from Assessment

- The assessment listed v1 paths (`packages/agent-core/src/session/subagent-host.ts`, `packages/agent-core/src/agent/swarm/index.ts`). **`packages/agent-core` does not exist in this repository** — only `agent-core-v2` — so no v1 changes were made.
- The assessment named a `propagateModelChange` method and a `modelChoice` argument. Neither exists; the code uses `model` / `modelAlias` / `modelSource`, and the fix rebinds at resume/retry rather than adding a broadcast method (per the user's chosen approach).
- The assessment proposed propagating on the parent's model-change event. The user chose rebind-on-resume/retry instead, which avoids touching in-flight agents.
- Scope expansion: the assessment did not cover fallback propagation. The user asked for swarm failures to follow the same fallback mechanism, so the caller's `fallback` / `fallbackSecondary` / `substitute` overrides are now copied to children.
- **Not fixed, reported instead**: the fork's `substitute-model` mechanism is dead for all agents — its arming code lived in `agent/stepRetry/stepRetryService.ts`, deleted by upstream refactor `485594f6`, and it was never listed in `.github/FORK_OWNED_FILES`. Nothing writes `substituteModelActiveKey`, so substitute can never engage. This affects main and swarm agents equally and is out of scope for this bug (see Follow-ups).
- **TDD mode**: the bug-whole skill defaults to TDD mode when `tdd_enabled` is absent, but the installed bug extension is v1.0.0 and has no such flag or TDD integration (verified: absent from `bug-config.yml`, absent from its commands). The red-green-refactor substance was followed manually — failing tests written and confirmed red before implementing — but no `tdd/` artifact tree was produced. The installed TDD extension is v1.1.2.

## Follow-ups

- File a separate bug for the dead `substitute-model` arming code, and add the restored arming site to `.github/FORK_OWNED_FILES` so a future sync cannot drop it silently again.
- Pre-existing test failures on this branch (not caused by this change): `swarm.test.ts` (10) and `tower/tools/spawnTool.test.ts` (23) fail because their `IAgentProfileService` stubs lack `getSessionModelOverride`, which the pre-existing `planSpawn` call at `subagentService.ts:133` already requires; `tool.test.ts` has one stale tool-schema snapshot.
