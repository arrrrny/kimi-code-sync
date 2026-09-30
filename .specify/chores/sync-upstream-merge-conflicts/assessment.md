# Chore Assessment: sync upstream — resolve fork/upstream merge conflicts

- **Slug**: sync-upstream-merge-conflicts
- **Created**: 2026-09-18
- **Source**: https://github.com/arrrrny/kimi-code-sync/issues/89 (loaded via `speckit.chore.fetch`)
- **Verdict**: in scope
- **Size**: large

## Report (verbatim or summarized)

Issue #89 (labels: `sync`, author: `github-actions`, opened 2026-09-18T03:04:54Z) reports that the
daily upstream sync aborted on merge conflicts. Auto-resolving in favor of upstream is forbidden by
the Fork Upstream Sync Policy in `AGENTS.md`; a human must resolve on a
`sync/fork-sync-resolution` branch and merge manually.

The issue lists **8** conflicted files and carries these commit refs:

- local master: `3f2a19d8f147c6d04a3d6f02a94caf6f7ee93c19`
- upstream/main: `1fddc16e3ea2de4c26a18acd764380adf9e2ed64`

### Verified drift from the issue snapshot (re-measured on 2026-09-18 after `git fetch`)

Both refs are now ancestors of the live tips, so the issue's snapshot is stale:

- `origin/master` = `f0ca5fc7f` (PRs #87 and #88 merged **after** the 03:04Z sync run)
- `upstream/main` = `a80fe31cf` (2 commits past `1fddc16e`)
- `origin/master` is **7 commits behind** `upstream/main`

The live conflict set is therefore **18 files, not 8**. All 8 issue-listed files are still in it; 10
more appeared because `master` advanced (new provider/oauth work from PR #88 collides with upstream's
`api_key_env` provider-credential change).

Live conflict set (`git merge-tree --write-tree origin/master upstream/main`):

- `docs/en/configuration/overrides.md`
- `docs/en/configuration/providers.md`
- `docs/zh/configuration/overrides.md`
- `docs/zh/configuration/providers.md`
- `packages/agent-core-v2/docs/config-manifest.toml`
- `packages/agent-core-v2/src/app/kosongConfig/configSection.ts`
- `packages/agent-core-v2/src/llm-adapter/model/model-auth.ts`
- `packages/agent-core-v2/src/llm-adapter/provider/provider.ts`
- `packages/agent-core-v2/test/agent/loop/loop.test.ts`
- `packages/agent-core-v2/test/llm-adapter/model/catalog.test.ts`
- `packages/agent-core-v2/test/llm-adapter/provider/providerService.test.ts`
- `packages/agent-core-v2/test/tool/tool.test.ts`
- `packages/klient/src/contract/global/providers.ts`
- `packages/node-sdk/src/config/schema.ts`
- `packages/node-sdk/src/config/toml.ts`
- `packages/node-sdk/src/sdk-rpc-client-v2.ts`
- `packages/node-sdk/test/config.test.ts`
- `packages/oauth/src/refreshProviderModels.ts`

Upstream commits being pulled in:

```
a80fe31cf fix(agent-core-v2): stop workspace watchers from listing a flooded project root (#3892)
5108cad9b perf: speed up session resume and session index on large workspaces (#3889)
e3f48a225 fix(agent-core-v2): keep session deletion from hanging (#3887)
f233f9de0 fix(agent-core-v2): stop advertising unregistered tools and clarify Read media errors (#3878)
1fddc16e3 fix(agent-core-v2): drop the outside-working-directory access ban from the system prompt (#3879)
c1047a6bb fix(cli): keep print mode alive while a cron-steered turn is in flight (#3875)
c5ad17f06 feat(agent-core-v2): support api_key_env for provider credentials (#3762)
```

## Summary

Perform the fork's manual upstream sync: merge `upstream/main` into a fork-based sync branch, resolve
all 18 conflicts **by hand** preserving fork-owned behavior (squeeze-model, fallback-model,
substitute-model, compaction-model overlay, model favorites, fork-session, `/refresh-catalog`,
fuck-permissions), verify with typecheck + the guardrail scripts + the fork-owned marker audit +
test suites, and open a PR into `master` that closes #89. This is a chore (recurring maintenance
integration), not a bug (nothing is broken in shipped code) and not a feature (no new user-facing
capability).

## Constitution Check

`.specify/memory/constitution.md` is still the **unratified placeholder template** (all sections are
`[PRINCIPLE_*]` placeholders; `Version: [CONSTITUTION_VERSION]`), so it imposes no binding
principles. The governing constraints are therefore:

- **`AGENTS.md` → Fork Upstream Sync Policy (MANDATORY)**: never auto-resolve in favor of upstream;
  no blind `git merge -X theirs` / `-s ours` in any script, CI, or manual step; conflicts are data the
  fork must keep and are resolved by hand.
- **`.github/FORK_OWNED_FILES`**: the secondary guardrail — every listed file must still exist and
  still contain its survival marker after the merge. If this chore adds or changes a fork-owned file,
  the entry **must** be appended to that list.
- **Comment-free zones** (`scripts/check-no-comments.mjs`): `agent-core-v2`, `kap-server`,
  `transcript` must contain no comments; `oxlint-disable`/`eslint-disable` are the only exception.
- **Bilingual docs** (`docs/AGENTS.md`): `docs/en` and `docs/zh` are both conflicted and must stay in
  sync; the Chinese side must not be left stale.

No principle is violated. A `major` bump / changeset decision is deferred (see Risks).

## Affected Paths

Source (fork semantics must survive):

- `packages/agent-core-v2/src/app/kosongConfig/configSection.ts` — fork config sections (compaction-model overlay, squeeze/fallback keys) collide with upstream's new config entries
- `packages/agent-core-v2/src/llm-adapter/model/model-auth.ts` — upstream `api_key_env` credential resolution vs fork's per-key proxy/rotation work
- `packages/agent-core-v2/src/llm-adapter/provider/provider.ts` — upstream provider plumbing vs fork's substitute-model cascade
- `packages/klient/src/contract/global/providers.ts` — client contract surface for the new credential fields
- `packages/node-sdk/src/config/schema.ts`, `packages/node-sdk/src/config/toml.ts` — SDK config schema/TOML round-trip for the new keys
- `packages/node-sdk/src/sdk-rpc-client-v2.ts` — RPC client surface
- `packages/oauth/src/refreshProviderModels.ts` — catalog refresh; sits beside fork-owned `packages/oauth/src/modelsDevCatalog.ts`

Generated (must be regenerated, never hand-merged):

- `packages/agent-core-v2/docs/config-manifest.toml` — regenerated from the config registry

Docs:

- `docs/en/configuration/overrides.md`, `docs/en/configuration/providers.md`
- `docs/zh/configuration/overrides.md`, `docs/zh/configuration/providers.md`

Tests (rebind to upstream's refactors, keep fork cases):

- `packages/agent-core-v2/test/agent/loop/loop.test.ts`
- `packages/agent-core-v2/test/llm-adapter/model/catalog.test.ts`
- `packages/agent-core-v2/test/llm-adapter/provider/providerService.test.ts`
- `packages/agent-core-v2/test/tool/tool.test.ts`
- `packages/node-sdk/test/config.test.ts`

## Proposed Approach

**Preferred**: reproduce the established sync shape used by the previous cycle (PR #86, commit
`e1bbcc84c`, whose parents are `25dd4ce97` = upstream/main and `71a254563` = master).

1. Branch off upstream, merge the fork in — matching the issue's procedure and prior history:
   - `git switch -c sync/fork-sync-resolution-2026-09-18 upstream/main`
   - `git merge origin/master --no-ff`
     (a dated branch name avoids clobbering the still-present `sync/fork-sync-resolution` at
     `fbf5379e8`, which is already merged)
2. Resolve each of the 18 conflicts **by hand**, taking both sides where they are additive and
   preferring the fork's semantics on behavioral conflicts. Never `--theirs`/`-s ours`.
3. Regenerate rather than hand-merge `config-manifest.toml` from the config registry, and regenerate
   `state-manifest.d.ts` if it drifts (prior cycle did this).
4. Keep `docs/en` and `docs/zh` consistent; translate rather than leaving one side stale.
5. Rebind the 5 test files to upstream's refactors while preserving fork-owned cases.
6. Audit `.github/FORK_OWNED_FILES` — grep every survival marker on the merged tree; append any new
   or changed fork-owned file to the list.
7. Fix `flake.nix`'s `fetchPnpmDeps` hash if `pnpm-lock.yaml` moved (CI reports the authoritative
   hash; the prior cycle pinned it from CI rather than guessing).
8. Open the PR into `master` titled `chore: sync upstream 2026-09-18`, body linking `Closes #89` and
   enumerating each resolved conflict (see PR #86's body as the template).

**Alternatives**:

- Branch off `master` and merge `upstream/main` in (the direction `sync-upstream.yml` runs in CI). Same
  content, but diverges from the issue's stated procedure and the fork's recorded history.
- Let `sync-upstream.yml` retry after the next upstream release — rejected: it will conflict again and
  only enlarges the conflict set.

**Paths likely to change**: the 18 conflicted files above, plus `flake.nix` (lockfile hash),
`packages/agent-core-v2/docs/state-manifest.d.ts` (if regenerated), and `.github/FORK_OWNED_FILES`
(only if a fork-owned file is added/changed).

**Verification to run**:

- `./node_modules/.bin/tsc --noEmit -p packages/agent-core-v2` (plus `apps/kimi-code`, `packages/kap-server` as in the prior cycle)
- `node scripts/check-no-comments.mjs`, `node scripts/check-service-naming.mjs`, `node scripts/check-nix-workspace.mjs`
- Fork-owned marker audit: grep every `<path> :: <marker>` pair from `.github/FORK_OWNED_FILES`
- `packages/agent-core-v2` vitest suite (prior cycle: 381 files / 6,880 tests, 1 skipped)
- `packages/node-sdk` `test/config.test.ts` and `packages/oauth` tests (conflicted areas)

## Risks & Considerations

- **Highest risk — silently dropping fork features.** These conflicts sit exactly where fork features
  live (provider/credential/config surfaces). A careless resolution compiles but loses a fork-owned
  behavior. Mitigation: marker audit + fork-owned test files.
- **Stale-base risk.** The issue's 8-file snapshot is already wrong; resolving against it would miss
  10 files. Resolve against the live tips measured above.
- **Generated-file risk.** `config-manifest.toml` must be regenerated, not hand-merged, or the config
  registry and manifest diverge.
- **Lockfile/Nix risk.** If `pnpm-lock.yaml` changes, `flake.nix`'s fixed-output `fetchPnpmDeps` hash
  must be updated from CI; a guessed hash fails `nix build`.
- **Doc drift risk.** 4 bilingual doc conflicts; leaving the `zh` side stale breaks the docs contract.
- **Blast radius.** ~197 fork commits ahead of upstream touches provider/auth/config paths; a bad
  resolution can break provider onboarding for every user.
- **Changeset/bump**: a sync is not user-perceivable fork work, so a changeset is not obviously
  required; **do not** decide a `major` bump autonomously.

## Open Questions

- None blocking. The chore's completion criterion is defined by the issue itself: a merged PR into
  `master` that closes #89, after which the next scheduled sync becomes a no-op.
- Note: `.specify/extensions/chore/chore-config.yml` sets `auto_create_issue: true`, but issue #89
  **already exists** and was loaded via `speckit.chore.fetch`. Filing another issue would duplicate
  it, so the report phase is intentionally skipped for this run.
