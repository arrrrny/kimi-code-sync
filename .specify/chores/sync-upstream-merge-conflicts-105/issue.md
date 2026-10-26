# Chore Issue: sync: upstream merge conflicts require manual resolution

- **Slug**: sync-upstream-merge-conflicts-105
- **Fetched**: 2026-10-11
- **Issue**: 105
- **URL**: https://github.com/arrrrny/kimi-code-sync/issues/105
- **State**: open
- **Author**: github-actions
- **Labels**: sync

## Body

The daily upstream sync encountered **2** merge conflict(s) and aborted per the fork-upstream-sync policy (AGENTS.md).

Auto-resolving in favor of upstream is **not** permitted — these conflicts contain fork-owned features that must be preserved.

## Conflicted files

- `packages/agent-core-v2/docs/state-manifest.d.ts`
- `packages/agent-core-v2/src/features/tower/tools/spawn/spawnTool.ts`

## Resolution procedure

1. Create a branch: `git switch -c sync/fork-sync-resolution upstream/main`
2. Merge master into it: `git merge master --no-ff`
3. Resolve each conflict, preserving fork-owned code (squeeze-model, fallback-model, fuck-permissions, model-favorites, fork-session, etc.).
4. Run `./node_modules/.bin/tsc --noEmit -p packages/agent-core-v2` and the fork-owned test suites (see `.github/FORK_OWNED_FILES` for the markers to grep for).
5. Open a PR titled `chore: sync upstream $(date +%Y-%m-%d)` and reference this issue.
6. After the PR merges, the next scheduled sync will be a no-op.

## Commit refs

- local master: `28ca25f7801e1f9460c718dcc4ebf225ee296d6c`
- upstream/main: `c9f01f07388abc2cdca40c9c5267f58c65086710`

cc: the human on-call fork maintainer.

## Comments

None.
