# Chore Issue: sync: upstream merge conflicts require manual resolution

- **Slug**: sync-upstream-merge-conflicts-109
- **Fetched**: 2026-10-15
- **Issue**: 109
- **URL**: https://github.com/arrrrny/kimi-code-sync/issues/109
- **State**: open
- **Author**: github-actions
- **Labels**: sync

## Body

The daily upstream sync encountered **5** merge conflict(s) and aborted per the fork-upstream-sync policy (AGENTS.md).

Auto-resolving in favor of upstream is **not** permitted — these conflicts contain fork-owned features that must be preserved.

## Conflicted files

- `flake.nix`
- `packages/agent-core-v2/src/human/llm/requester/bases/anthropic/requester.ts`
- `packages/agent-core-v2/src/human/llm/requester/bases/openai-responses/requester.ts`
- `packages/agent-core-v2/src/human/llm/requester/bases/openai/requester.ts`
- `packages/node-sdk/src/rpc.ts`

## Resolution procedure

1. Create a branch: `git switch -c sync/fork-sync-resolution upstream/main`
2. Merge master into it: `git merge master --no-ff`
3. Resolve each conflict, preserving fork-owned code (squeeze-model, fallback-model, fuck-permissions, model-favorites, fork-session, etc.).
4. Run `./node_modules/.bin/tsc --noEmit -p packages/agent-core-v2` and the fork-owned test suites (see `.github/FORK_OWNED_FILES` for the markers to grep for).
5. Open a PR titled `chore: sync upstream $(date +%Y-%m-%d)` and reference this issue.
6. After the PR merges, the next scheduled sync will be a no-op.

## Commit refs

- local master: `d601fbab96ed74267fa03238f536459eb4ac79ac`
- upstream/main: `cbd754049a114ee36d1b27675c82819e4963c692`

cc: the human on-call fork maintainer.

## Comments

**github-actions** (2026-10-14):

🔄 New sync conflict detected on 2026-10-14.

The daily upstream sync encountered **9** merge conflict(s) and aborted per the fork-upstream-sync policy (AGENTS.md).

Auto-resolving in favor of upstream is **not** permitted — these conflicts contain fork-owned features that must be preserved.

## Conflicted files

- `flake.nix`
- `packages/agent-core-v2/docs/state-manifest.d.ts`
- `packages/agent-core-v2/src/agent/llmRequester/llmRequesterService.ts`
- `packages/agent-core-v2/src/human/llm/requester/bases/anthropic/requester.ts`
- `packages/agent-core-v2/src/human/llm/requester/bases/openai-responses/requester.ts`
- `packages/agent-core-v2/src/human/llm/requester/bases/openai/requester.ts`
- `packages/agent-core-v2/test/agent/loop/loop.test.ts`
- `packages/agent-core-v2/test/tool/tool.test.ts`
- `packages/node-sdk/src/rpc.ts`

## Resolution procedure

1. Create a branch: `git switch -c sync/fork-sync-resolution upstream/main`
2. Merge master into it: `git merge master --no-ff`
3. Resolve each conflict, preserving fork-owned code (squeeze-model, fallback-model, fuck-permissions, model-favorites, fork-session, etc.).
4. Run `./node_modules/.bin/tsc --noEmit -p packages/agent-core-v2` and the fork-owned test suites (see `.github/FORK_OWNED_FILES` for the markers to grep for).
5. Open a PR titled `chore: sync upstream $(date +%Y-%m-%d)` and reference this issue.
6. After the PR merges, the next scheduled sync will be a no-op.

## Commit refs

- local master: `d601fbab96ed74267fa03238f536459eb4ac79ac`
- upstream/main: `b510fa9aec85f02849f64121550be2c3fbd4294d`

cc: the human on-call fork maintainer.

**github-actions** (2026-10-15):

🔄 New sync conflict detected on 2026-10-15.

The daily upstream sync encountered **19** merge conflict(s) and aborted per the fork-upstream-sync policy (AGENTS.md).

Auto-resolving in favor of upstream is **not** permitted — these conflicts contain fork-owned features that must be preserved.

## Conflicted files

- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `apps/kimi-code/src/tui/commands/config.ts`
- `apps/kimi-code/src/tui/commands/provider.ts`
- `apps/kimi-code/src/tui/controllers/auth-flow.ts`
- `apps/kimi-code/src/tui/utils/refresh-providers.ts`
- `flake.nix`
- `packages/agent-core-v2/docs/state-manifest.d.ts`
- `packages/agent-core-v2/src/agent/llmRequester/llmRequesterService.ts`
- `packages/agent-core-v2/src/human/llm/requester/bases/anthropic/requester.ts`
- `packages/agent-core-v2/src/human/llm/requester/bases/openai-responses/requester.ts`
- `packages/agent-core-v2/src/human/llm/requester/bases/openai/requester.ts`
- `packages/agent-core-v2/test/agent/loop/loop.test.ts`
- `packages/agent-core-v2/test/tool/tool.test.ts`
- `packages/node-sdk/src/rpc.ts`
- `packages/node-sdk/src/v2/config-mapper.ts`
- `packages/node-sdk/test/config.test.ts`
- `packages/oauth/src/refreshProviderModels.ts`
- `packages/oauth/test/refreshProviderModels.test.ts`

## Resolution procedure

1. Create a branch: `git switch -c sync/fork-sync-resolution upstream/main`
2. Merge master into it: `git merge master --no-ff`
3. Resolve each conflict, preserving fork-owned code (squeeze-model, fallback-model, fuck-permissions, model-favorites, fork-session, etc.).
4. Run `./node_modules/.bin/tsc --noEmit -p packages/agent-core-v2` and the fork-owned test suites (see `.github/FORK_OWNED_FILES` for the markers to grep for).
5. Open a PR titled `chore: sync upstream $(date +%Y-%m-%d)` and reference this issue.
6. After the PR merges, the next scheduled sync will be a no-op.

## Commit refs

- local master: `d601fbab96ed74267fa03238f536459eb4ac79ac`
- upstream/main: `d4b9dc4a2d6ff72413964feda2563f0adf8e04d2`

cc: the human on-call fork maintainer.
