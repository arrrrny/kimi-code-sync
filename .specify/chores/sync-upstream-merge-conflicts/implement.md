# Chore Implementation: sync upstream — resolve fork/upstream merge conflicts

- **Slug**: sync-upstream-merge-conflicts
- **Implemented**: 2026-09-18
- **Assessment**: ./assessment.md
- **Status**: applied
- **Branch**: `sync/fork-sync-resolution-2026-09-18`
- **Merge commit**: `6a856e69b` (parents: `a80fe31cf` upstream/main, `f0ca5fc7f` origin/master)

## Summary

Performed the fork's manual upstream sync: merged `origin/master` into a branch based on
`upstream/main` (the same shape as the previous cycle, PR #86 / commit `e1bbcc84c`) and resolved all
**18** conflicts by hand, preserving fork-owned behavior. The live conflict set was 18 files rather
than the 8 listed in issue #89 because `master` advanced (PRs #87/#88 merged) after the 03:04Z sync
snapshot; resolutions were therefore computed against the live tips.

No `--theirs` / `-s ours` / `git checkout --ours|--theirs` was used at any point, per the Fork
Upstream Sync Policy in `AGENTS.md`.

## Changes

Resolved conflicts (18 files):

| File | Resolution |
|------|-----------|
| `packages/agent-core-v2/src/llm-adapter/model/model-auth.ts` | Fed the fork's active rotated key into upstream's new `declaredProviderCredential` so both features coexist |
| `packages/oauth/src/refreshProviderModels.ts` | Same merge in the refresh path; kept upstream's 2-arg signature and fixed a caller |
| `packages/agent-core-v2/src/llm-adapter/provider/provider.ts` | Kept both: upstream `apiKeyEnv` + fork `apiKeys`/`activeApiKeyId`/`rotateKeys` |
| `packages/agent-core-v2/src/app/kosongConfig/configSection.ts` | Kept both credential field sets |
| `packages/klient/src/contract/global/providers.ts` | Kept both (contract parity with the engine type) |
| `packages/node-sdk/src/config/schema.ts` | Kept both credential field sets |
| `packages/node-sdk/src/config/toml.ts` | Kept upstream's `PROVIDER_CREDENTIAL_FIELDS` + fork's `apiKeysToToml` |
| `packages/node-sdk/src/sdk-rpc-client-v2.ts` | Merged both import sets into one klient import |
| `packages/node-sdk/test/config.test.ts` | Kept both new tests, each properly closed |
| `packages/agent-core-v2/test/llm-adapter/model/catalog.test.ts` | Kept both (3 hunks); reconstructed shared closers; re-hoisted fork helpers to top level |
| `packages/agent-core-v2/test/llm-adapter/provider/providerService.test.ts` | Kept both |
| `packages/agent-core-v2/test/agent/loop/loop.test.ts` | Kept fork side, then regenerated inline snapshots |
| `packages/agent-core-v2/test/tool/tool.test.ts` | Kept fork side, then regenerated inline snapshots |
| `docs/en/configuration/overrides.md` | Merged: fork's rotation key as priority 1, upstream's `api_key`/`api_key_env` as 2 |
| `docs/en/configuration/providers.md` | Merged priority line; fork's rotation section intact |
| `docs/zh/configuration/overrides.md` | Same, translated (not copied) |
| `docs/zh/configuration/providers.md` | Same, translated; added the missing `## OAuth 与凭证注入` section for en/zh parity |
| `packages/agent-core-v2/docs/config-manifest.toml` | Regenerated via `pnpm gen:config-manifest` (never hand-merged) |

Also regenerated (verified byte-identical, so unchanged): `docs/state-manifest.d.ts`,
`docs/wire-manifest.d.ts`.

Added: `.specify/chores/sync-upstream-merge-conflicts/{issue,assessment,implement}.md` (the chore
record, consistent with the tracked `.specify/bugs/*` precedent).

## Diff Highlights

The only non-obvious semantic merge, in `model-auth.ts`:

```ts
const declared = declaredProviderCredential(
  { ...args.provider, apiKey: getActiveProviderApiKey(args.provider) },
  args.providerName,
);
```

Upstream replaced the fork's local `authConflictError` helper with the shared
`declaredProviderCredential` + `credentialConflictMessage` pair; the fork's active-key (rotation)
resolution is now the inline key that the shared helper evaluates and conflict-checks.

## Verification

- `grep -rl '^<<<<<<< HEAD'` over the whole tracked tree → **no conflict markers remain**.
- `tsc --noEmit` on `agent-core-v2`, `node-sdk`, `klient`, `kap-server`, `oauth` → **all exit 0**.
- `node scripts/check-no-comments.mjs` → OK (1834 files); `check-service-naming.mjs` → passed;
  `check-nix-workspace.mjs` → all 17 recursive workspace deps present.
- **Fork-owned marker audit**: all **54** `<path> :: <marker>` entries from `.github/FORK_OWNED_FILES`
  exist and still contain their survival marker → 0 failures.
- `pnpm-lock.yaml` and `flake.nix` are **identical to `origin/master`** after the merge (verified via
  `git diff --cached origin/master`), so no `fetchPnpmDeps` hash update is required. The merge
  correctly kept the fork-owned root `package.json`'s `http-proxy-agent`/`https-proxy-agent`
  (upstream dropped them; the fork's provider-proxy feature needs them), which matches the lockfile.
- `packages/node-sdk`: `vitest run test/config.test.ts` → 4 passed (agent-run).
- `packages/agent-core-v2` full suite → **7007 passed / 1 skipped / 8 failed**; after regenerating the
  two conflict-affected inline snapshots and re-running: **7007 passed / 1 skipped** with 4 tests
  timing out (see open item below).
- Determinism check on the failures: re-run in isolation with `--maxWorkers=2`, and again with
  `--testTimeout=120000`:
  - `test/agent/task/taskManager.test.ts` → **50/50 pass**, but absurdly slow on this machine
    (78s / 77s / 39s / 26s where CI expects ~1s each). These are load/machine-speed failures, not
    hangs.
  - `test/tool/tool.test.ts > returns the spawned agent id when a foreground subagent times out`
    → still times out at 120s.

**Open verification item (1 test).** `test/tool/tool.test.ts > … foreground subagent times out`
fails locally. Evidence gathered:

- The test exists identically on `upstream/main` and `origin/master` (it is not merge-introduced).
- The sync never touched `packages/agent-core-v2/src/session/subagent/` (the timeout-arming code is
  byte-identical to master's).
- Master's CI at `f0ca5fc7f` is **green**, so it passes there.
- Run against `origin/master`'s code on this same machine, the test **passes but takes 13.4s**
  (its sibling test takes ~0.57s).
- **Root cause (localized, upstream-owned).** The test fakes only `setTimeout`/`clearTimeout` — not
  `Date.now()` — and advances the fake clock by `DEFAULT_SUBAGENT_TIMEOUT_MS` (2 hours). Upstream's
  `agentLifecycleService.ts` change (merged verbatim; the merged file is **byte-identical to
  `upstream/main`'s**) wraps the settle wait in a `Promise.race` against
  `setTimeout(…, promptIdleDeadline - Date.now())`, around a quiesce loop that sleeps
  `REMOVE_PROMPT_QUIESCE_POLL_MS = 10` per iteration. With `Date.now()` unfaked, the 2-hour advance
  drives that loop an enormous number of times.
- **Decisive:** run against **pure `upstream/main`** (no fork code involved at all) on this machine,
  the same test **also fails** (timed out at 60s).

Conclusion: the conflict resolution did **not** cause this — the sync faithfully carries upstream's
own code, and the same failure reproduces on unmodified upstream. Master passes (13.4s) only because
it predates upstream's change. **CI confirmed this**: the test passes on PR #90's CI, so the local
hang was machine speed.

### CI result (PR #90)

**All checks pass** (`mergeStateStatus: CLEAN`). One flaky upstream test is worth recording:

- On the first CI run `test (5)` failed on
  `kap-server test/modelCatalogCatalog.test.ts > server-v2 /api/v1 catalog browse + import endpoints >
  re-imports an existing id as a refresh: credentials replaced, stale aliases dropped`
  (`Error: waitForServerState timed out`); the re-run passed it.
- **Upstream's own CI failed that exact test, with that exact error, at `a80fe31cf`** — the very commit
  this sync merges. It is an upstream-owned timing flake, **not** a regression from the conflict
  resolution.
- It is non-deterministic by nature: on the merged tree locally the same file passes **27/27**.

If `test (5)` goes red on a future run, re-run the job — it is that same flake.

Toolchain note: this checkout's default `node` is v22.22.3, which fails on the repo's `#/…` subpath
imports (`ERR_INVALID_MODULE_SPECIFIER`). All commands above were run with `/usr/local/bin/node`
(v26.5.1, satisfying `engines: >=24.15.0`).

## Deviations from Assessment

1. **Branch name.** The chore skills default to `<branch_prefix>/<slug>` = `chore/sync-upstream-merge-conflicts`.
   The assessment (following issue #89 and the Fork Upstream Sync Policy) specifies a
   `sync/fork-sync-resolution` branch, so the dated fork convention
   `sync/fork-sync-resolution-2026-09-18` was used instead.
2. **A/B split vs. parallel agents.** Documentation, node-sdk, and the additive agent-core-v2 test
   conflicts were resolved by three parallel subagents (disjoint file sets); the semantic
   provider-credential cluster and the generated manifests were resolved directly.
3. **Snapshot regeneration instead of hash-picking.** The `loop.test.ts` / `tool.test.ts` conflicts
   were golden `toolsHash` values that no side had right for the merged tool set; they were
   regenerated with `vitest -u` and the diff confirmed to change only the hash values.
4. **`apiKeys` + `apiKeyEnv` is now a conflict error.** Passing the active rotated key into
   `declaredProviderCredential` means a provider declaring *both* `apiKeys`/`activeApiKeyId` and
   `apiKeyEnv` now raises `config.invalid` instead of silently preferring the active key. Judged
   correct (it mirrors upstream's mutual-exclusion policy for contradictory credentials) but it is a
   behavior change for that contradictory configuration.
5. **No changeset.** No prior sync added a sync-specific changeset; upstream's changes carry their
   own changesets in this merge, and no fork-authored user-facing change was introduced. Per the
   `gen-changesets` rule to skip what users cannot perceive, none was written.
6. **Incidental fixes inside owned files** (documented by the subagents): a duplicate `parseConfigString`
   import in `node-sdk/test/config.test.ts`; and a pre-existing en/zh parity gap in
   `docs/zh/configuration/providers.md` (missing the OAuth section, missing on all three sides).

## Follow-ups

- Open the PR into `master` titled `chore: sync upstream 2026-09-18`, body linking `Closes #89` and
  enumerating the resolutions (PR #86's body is the template).
- Confirm CI outcome for the one timing-sensitive test above before merging.
- After this merges, the next scheduled sync becomes a no-op (issue #89's step 6).
- Toolchain hygiene: this machine's default `node` (v22.22.3) is below the repo's `engines`
  (`>=24.15.0`) and breaks `#/…` imports; prefer `24.x` for local runs and CI parity.
