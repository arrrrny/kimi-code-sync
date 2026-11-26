# Chore Issue: sync: upstream merge conflicts require manual resolution

- **Slug**: sync-upstream-merge-conflicts
- **Fetched**: 2026-09-18
- **Issue**: 89
- **URL**: https://github.com/arrrrny/kimi-code-sync/issues/89
- **State**: open
- **Author**: github-actions
- **Labels**: sync

## Body

The daily upstream sync encountered **8** merge conflict(s) and aborted per the fork-upstream-sync policy (AGENTS.md).

Auto-resolving in favor of upstream is **not** permitted — these conflicts contain fork-owned features that must be preserved.

## Conflicted files

- `packages/agent-core-v2/docs/config-manifest.toml`
- `packages/agent-core-v2/src/app/kosongConfig/configSection.ts`
- `packages/agent-core-v2/src/llm-adapter/model/model-auth.ts`
- `packages/agent-core-v2/src/llm-adapter/provider/provider.ts`
- `packages/klient/src/contract/global/providers.ts`
- `packages/node-sdk/src/config/schema.ts`
- `packages/node-sdk/src/sdk-rpc-client-v2.ts`
- `packages/oauth/src/refreshProviderModels.ts`

## Resolution procedure

1. Create a branch: `git switch -c sync/fork-sync-resolution upstream/main`
2. Merge master into it: `git merge master --no-ff`
3. Resolve each conflict, preserving fork-owned code (squeeze-model, fallback-model, fuck-permissions, model-favorites, fork-session, etc.).
4. Run `./node_modules/.bin/tsc --noEmit -p packages/agent-core-v2` and the fork-owned test suites (see `.github/FORK_OWNED_FILES` for the markers to grep for).
5. Open a PR titled `chore: sync upstream $(date +%Y-%m-%d)` and reference this issue.
6. After the PR merges, the next scheduled sync will be a no-op.

## Commit refs

- local master: `3f2a19d8f147c6d04a3d6f02a94caf6f7ee93c19`
- upstream/main: `1fddc16e3ea2de4c26a18acd764380adf9e2ed64`

cc: the human on-call fork maintainer.

## Comments

None.
