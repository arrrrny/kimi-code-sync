## Requirement or Bug

Resolve the daily upstream sync's 2 merge conflicts by hand per the Fork Upstream Sync Policy (root `AGENTS.md`) and restore the sync to a clean state. Closes #105.

## Bug Reproduction Steps

N/A (chore PR — the failing update is the daily `sync-upstream.yml` run that aborted on conflicts and filed #105).

## Root Cause

N/A (chore PR). Context: the sync aborted on two content conflicts between `upstream/main` (`c9f01f073`) and `origin/master` (`28ca25f78`, merge-base `419aced0e`):

- `packages/agent-core-v2/docs/state-manifest.d.ts` — upstream's tower orchestration refactor #4074 removed the `tower.base` state key while the fork added its own keys in the same regions.
- `packages/agent-core-v2/src/features/tower/tools/spawn/spawnTool.ts` — the same upstream refactor restructured `TowerSpawnTool.execution()` while the fork had a one-line change on top of the old shape.

## Code Changes

This PR is a merge of `master` (`28ca25f78`) into a branch off `upstream/main` (`c9f01f073`), bringing **5 upstream commits** (`c9f01f073` #4074 tower deterministic orchestration, `3395f5bea` #4164 shutdown progress + force exit on Ctrl+C, `f0bc988bb` #4152 fork subagent request prefix, `72fc1d0a3` #4160 Working… spinner, `e5b4b88ba` #4156 cumulative survey turns). The only hand-made resolutions:

- **`state-manifest.d.ts` (generated file): union of both sides.** Upstream's `tower.base` removal is taken as-is; the fork's `fallbackModel.active`, `squeezeModel`, and `compactionTokenBudget` additions are kept; the key index resolves to 74. Because the file is generator-produced, it was regenerated with `pnpm gen:state-manifest` — the output was **byte-identical** to the hand-resolved conflict, and `test/state/stateManifest.test.ts` enforces freshness on the merged tree.
- **`spawnTool.ts`: upstream's refactor + the fork's one line.** Upstream #4074 moved the whole spawn flow (rate-limit gate, abort controller, subagent binding, launch, task registration, agent registration, logging) inside the `withBranchLease` callback. The refactored body is taken; the fork's single-line change — passing `{ secondaryAlias: this.profile.getSessionModelOverride('secondary') }` to `resolveSubagentBinding`, so tower-spawned workers/reviewers follow the fork's secondary-model cascade — is re-applied onto the restructured binding call. The fork's diff against the merge-base for this file is exactly that one line, and `git diff upstream/main` on the merged tree shows exactly that one line back.

No fork-owned behavior changed: squeeze-model, secondary cascade, fallback-model, substitute-model, compaction-model display + handoff, `/refresh-catalog`, model favorites, subscription-disable, free-models-only, key rotation, fork-session — all preserved and marker-verified.

## Behavior Changes and Affected Users

| Behavior | Before | After | Who relies on the old behavior | Escape hatch |
|---|---|---|---|---|
| Tower spawn holds the branch lease for the entire spawn (upstream #4074) | spawn steps ran before acquiring the branch lease | the whole spawn flow runs inside the `withBranchLease` callback | Tower users (fork-internal multi-agent orchestration) | upstream-authored and upstream-tested; fork behavior on top (secondary-model cascade) re-applied verbatim and covered by the tower spawnTool suite |
| `tower.base` state key | present in `AgentStateSnapshot` | removed (upstream #4074) | external consumers of the state manifest (desktop/web clients, replay tooling) | upstream's own removal, consumed by its own CI gates; sessions written by older versions replay fine — the key is world-time state, not replayable |
| `fallbackModel.active` / `squeezeModel` / `compactionTokenBudget` in the state manifest | documented on master but not in the regenerated manifest delta | present in the merged manifest | fork-feature state readers | none needed — documentation of already-shipped fork state |
| Shutdown progress + force exit on Ctrl+C (upstream #4164) | hooks could block shutdown | progress shown, Ctrl+C forces exit | all CLI users at shutdown hook time | upstream feature |
| Working… spinner while thinking (upstream #4160), cumulative survey user turns (upstream #4156), fork subagent request prefix (upstream #4152) | older behavior | upstream behavior | TUI/survey/subagent users | upstream features |

Affected-module coverage: `packages/agent-core-v2` verified with `tsc --noEmit`, the state-manifest freshness test, and the fork-owned + tower test suites (details below); the remaining upstream deltas are upstream-CI-covered code landing unchanged.

## Checklist

- [x] I have read the [CONTRIBUTING](https://github.com/MoonshotAI/kimi-code/blob/main/CONTRIBUTING.md) document.
- [x] I have linked a related issue (Closes #105).
- [x] I have added tests that prove my feature works. *(N/A — merge chore; the merge's verification per file/document set: `tsc --noEmit -p packages/agent-core-v2` clean, `gen:state-manifest` byte-identical, `stateManifest.test.ts` 2/2, `.github/FORK_OWNED_FILES` 66/66 markers resolve, fork-owned + tower suites 475/476 — the single red is the documented region-dependent signup-URL baseline failure whose assertion is byte-identical on both sides of the merge and therefore not merge-caused)*
- [x] The behavior-change table above is complete, and every removed behavior or flipped default is named in the changeset and either has an escape hatch or was explicitly approved by a maintainer in this PR. *(no fork-owned behavior removed; upstream-side changes named with their upstream PR numbers)*
- [x] Ran `gen-changesets` skill, or this PR needs no changeset. *(no changeset: internal integration — nothing fork-authored is user-perceivable; upstream's own changelog/docs ride the merge, matching sync PRs #90/#94/#95)*
- [x] Ran `gen-docs` skill, or this PR needs no doc update. *(upstream's own docs and the regenerated state-manifest ride the merge; nothing fork-authored to document)*

Assessment: `.specify/chores/sync-upstream-merge-conflicts-105/assessment.md`
