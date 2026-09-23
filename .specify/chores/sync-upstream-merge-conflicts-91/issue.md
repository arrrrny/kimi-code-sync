# Chore Issue: sync: upstream merge conflicts require manual resolution

- **Slug**: sync-upstream-merge-conflicts-91
- **Fetched**: 2026-09-18
- **Issue**: 91
- **URL**: https://github.com/arrrrny/kimi-code-sync/issues/91
- **State**: open
- **Author**: github-actions
- **Labels**: sync

## Body

The daily upstream sync encountered **2** merge conflict(s) and aborted per the fork-upstream-sync policy (AGENTS.md).

Auto-resolving in favor of upstream is **not** permitted — these conflicts contain fork-owned features that must be preserved.

## Conflicted files

- `packages/agent-core-v2/src/human/agent/machine.ts`
- `packages/agent-core-v2/test/tool/tool.test.ts`

## Resolution procedure

1. Create a branch: `git switch -c sync/fork-sync-resolution upstream/main`
2. Merge master into it: `git merge master --no-ff`
3. Resolve each conflict, preserving fork-owned code (squeeze-model, fallback-model, fuck-permissions, model-favorites, fork-session, etc.).
4. Run `./node_modules/.bin/tsc --noEmit -p packages/agent-core-v2` and the fork-owned test suites (see `.github/FORK_OWNED_FILES` for the markers to grep for).
5. Open a PR titled `chore: sync upstream $(date +%Y-%m-%d)` and reference this issue.
6. After the PR merges, the next scheduled sync will be a no-op.

## Commit refs

- local master: `fa5f9bc40459b4d23bbe648ffb5bf4bf7944cc0f`
- upstream/main: `60f2a63278f28b77d9358cf589b2da6193bd2614`

cc: the human on-call fork maintainer.

## Comments

None.
