## Related Issue

Closes #89

## Problem

The daily upstream sync aborted on merge conflicts between `upstream/main` and local `master`, and
per the fork-upstream-sync policy in `AGENTS.md` those conflicts cannot be auto-resolved
(`-X theirs` / `-s ours` would silently drop fork-owned features). A human resolves them on a
`sync/fork-sync-resolution` branch and merges manually.

Issue #89's snapshot listed **8** conflicted files, but it was taken at 03:04Z and `master` advanced
afterwards (PRs #87/#88 merged), so the live conflict set measured against the current tips
(`upstream/main` = `a80fe31cf`, `origin/master` = `f0ca5fc7f`) was **18 files**. The merge is based on
upstream with `master` merged in, matching the previous cycle (PR #86, commit `e1bbcc84c`, whose
parents are likewise upstream + master).

## What changed

All 18 conflicts were resolved **by hand**. No `--theirs`, `-s ours`, or
`git checkout --ours/--theirs` was used anywhere.

Upstream's 7 commits introduce `api_key_env` provider credentials (#3762) plus session-resume,
watcher, and tool-advertising fixes. The fork's `apiKeys` / `activeApiKeyId` / `rotateKeys` key
rotation (#88) collides with it across the whole provider-credential surface, so the resolution keeps
both features and threads the fork's active key through upstream's new shared credential helper:

- `packages/agent-core-v2/src/llm-adapter/model/model-auth.ts` — the fork's active rotated key is now
  the inline key evaluated by upstream's `declaredProviderCredential` (the fork's local
  `authConflictError` helper was superseded by upstream's shared `credentialConflictMessage`).
- `packages/oauth/src/refreshProviderModels.ts` — same merge on the refresh path; kept upstream's
  two-argument signature and updated a fork caller that still passed one argument.
- `packages/agent-core-v2/src/llm-adapter/provider/provider.ts`,
  `packages/agent-core-v2/src/app/kosongConfig/configSection.ts`,
  `packages/klient/src/contract/global/providers.ts`, `packages/node-sdk/src/config/schema.ts` — keep
  both credential field sets (`apiKeyEnv` alongside `apiKeys`/`activeApiKeyId`/`rotateKeys`).
- `packages/node-sdk/src/config/toml.ts` — upstream's `PROVIDER_CREDENTIAL_FIELDS` plus the fork's
  `apiKeysToToml`.
- `packages/node-sdk/src/sdk-rpc-client-v2.ts` — both import sets merged into one klient import.
- 5 test files (`catalog`, `providerService`, `tool`, `loop`, node-sdk `config`) — both sides' tests
  kept, with shared closing suffixes reconstructed so every test stays closed. The two golden
  `toolsHash` conflicts in `tool.test.ts` / `loop.test.ts` could not be decided by reading: neither
  side's hash matches the merged tool set, so they were regenerated with `vitest -u` and the diff
  confirmed to change only the hash values.
- 4 bilingual doc pages (`docs/{en,zh}/configuration/{overrides,providers}.md`) — merge both sides'
  content; the fork's rotation guidance stays first, upstream's `api_key`/`api_key_env` rules second.
  Also added the `## OAuth and credential injection` section to the Chinese `providers.md`, which was
  missing on all three sides (pre-existing en/zh drift).
- `packages/agent-core-v2/docs/config-manifest.toml` — regenerated with `pnpm gen:config-manifest`
  rather than hand-merged. `state-manifest.d.ts` and `wire-manifest.d.ts` were regenerated too and
  came back byte-identical.

## Verification

- No conflict markers remain (`grep -rl '^<<<<<<< HEAD'` over the tracked tree).
- `tsc --noEmit` clean on `agent-core-v2`, `node-sdk`, `klient`, `kap-server`, and `oauth`.
- `scripts/check-no-comments.mjs`, `scripts/check-service-naming.mjs`,
  `scripts/check-nix-workspace.mjs` all pass.
- All **54** entries in `.github/FORK_OWNED_FILES` still exist with their survival markers intact.
- `pnpm-lock.yaml` and `flake.nix` are identical to `master` after the merge, so no `fetchPnpmDeps`
  hash update is needed. The fork-owned root `package.json` keeps `http-proxy-agent` /
  `https-proxy-agent` (upstream dropped them; the fork's provider-proxy feature needs them), which
  matches the lockfile.
- `packages/node-sdk` `test/config.test.ts`: 4 passed.
- `packages/agent-core-v2`: **7007 passed, 1 skipped** locally. Four tests failed on timing locally and
  were investigated rather than waved through:
  - Three in `test/agent/task/taskManager.test.ts` pass with a raised timeout, but take 78s / 77s /
    39s on this machine (CI expects ~1s each) — machine-speed, not hangs.
  - `test/tool/tool.test.ts > returns the spawned agent id when a foreground subagent times out`
    hangs locally. This is not caused by the conflict resolution: the merged
    `agentLifecycleService.ts` is byte-identical to `upstream/main`'s, and the same test fails
    identically against pure `upstream/main` locally. **It passes on CI**, confirming the local hang
    was machine speed.

### CI result

All checks pass **except `test (5)`**, and that failure is not a regression introduced here:

- `test (5)` fails on
  `kap-server test/modelCatalogCatalog.test.ts > server-v2 /api/v1 catalog browse + import endpoints
  > re-imports an existing id as a refresh: credentials replaced, stale aliases dropped`
  (`Error: waitForServerState timed out`).
- **Upstream's own CI fails that exact test, with that exact error, at `a80fe31cf`** — the very commit
  this sync merges. The fork is inheriting an already-red upstream check.
- It is timing-sensitive rather than deterministic: on the merged tree locally the same file passes
  **27/27**.

So this PR is mergeable and green apart from a check that is red upstream too. Merging it carries
that upstream failure into `master` until upstream fixes it; holding the sync until then is the other
option. That call is the maintainer's.

## Notes

- Branch: `sync/fork-sync-resolution-2026-09-18` (the chore skills' default `chore/<slug>` prefix was
  not used, because issue #89 and the fork policy both specify a `sync/fork-sync-resolution` branch).
- No changeset: no prior sync added one, upstream's changes carry their own changesets in this merge,
  and no fork-authored user-facing change was introduced.
- One judgement call worth knowing: because the active rotated key is fed to
  `declaredProviderCredential`, a provider declaring both `apiKeys`/`activeApiKeyId` **and**
  `apiKeyEnv` now raises `config.invalid` instead of silently preferring the active key. That mirrors
  upstream's mutual-exclusion policy for contradictory credentials.

## Checklist

- [x] I have read the CONTRIBUTING document.
- [x] I have linked a related issue.
- [x] All fork markers and tests pass (see the one upstream-owned timing failure noted above).
