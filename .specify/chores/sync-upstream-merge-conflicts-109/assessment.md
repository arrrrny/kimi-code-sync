# Chore Assessment: sync: upstream merge conflicts require manual resolution

- **Slug**: sync-upstream-merge-conflicts-109
- **Created**: 2026-10-15
- **Source**: https://github.com/arrrrny/kimi-code-sync/issues/109
- **Verdict**: in scope
- **Size**: large

## Report (verbatim or summarized)

[Issue #109](https://github.com/arrrrny/kimi-code-sync/issues/109) (label `sync`, author
github-actions): the daily upstream sync aborted under the fork-upstream-sync policy
(root `AGENTS.md`). Three conflict reports accumulate on the issue (5, 9, 19 files);
the operative one is the latest comment (2026-10-15): **19 conflicted files** merging
`upstream/main` `d4b9dc4a2d6ff72413964feda2563f0adf8e04d2` into `master`
`d601fbab96ed74267fa03238f536459eb4ac79ac`. Local refs verified: `origin/master` =
`d601fbab9` (matches), merge-base `c9f01f073`.

The issue prescribes: branch off `upstream/main`, `git merge master --no-ff`, resolve
each conflict preserving fork-owned code (squeeze-model, fallback-model,
fuck-permissions, model-favorites, fork-session, …), verify with
`tsc --noEmit -p packages/agent-core-v2` + fork-owned test suites, then PR
`chore: sync upstream <date>` referencing the issue.

## Summary

This is a maintenance chore, not a bug or feature: complete the aborted daily upstream
sync by hand-resolving the 19 merge conflicts (25 hunks) between `master`
(`d601fbab9`) and `upstream/main` (`d4b9dc4a`), adopting upstream's changes wherever
they do not collide with fork-owned behavior and unioning both sides where they do.

## Constitution Check

No `.specify/constitution.md` exists. The binding constraints are in the root
`AGENTS.md` and `.github/FORK_OWNED_FILES`:

- **Fork Upstream Sync Policy**: never auto-resolve toward upstream; conflicts carry
  fork-owned features and are resolved by hand; a clean-merge marker check guards the
  136 listed fork-owned files.
- **Comment-free zones** (`packages/agent-core-v2`, `packages/kap-server`,
  `packages/transcript`): no comments in resolved files under those packages
  (enforced by `scripts/check-no-comments.mjs`). Upstream-side content in these files
  is already comment-free.
- **Optional-property rule** (no conditional spread; pass `undefined` directly) —
  applies when re-applying fork lines onto upstream-restructured code.
- Fork-owned files in the conflict set must keep their survival markers
  (`refreshCatalogProviderModels` in `refresh-providers.ts`, `fallbackModelActiveKey`
  in `llmRequesterService.ts`, `buildProxyDispatcher` in the three requesters,
  etc.).

## Affected Paths

Conflicted (19 files, 25 hunks — verified by a probe merge at the issue-pinned ref):

| File | Hunks | Conflict shape |
|---|---|---|
| `.github/workflows/ci.yml` | 1 | Branch triggers: upstream `main`/`release/*` vs fork `master` → union triggers |
| `.github/workflows/release.yml` | 1 | Same branch-trigger union |
| `apps/kimi-code/src/tui/commands/config.ts` | 2 | Upstream moved `performModelSwitch` to `utils/model-switch.ts` with `'session' \| 'model' \| 'model-and-effort'` persistence; fork adds favorites (`favoriteAliases`, `onToggleFavorite`, `toggleFavoriteModel`, `nextFavoriteAlias`, `rotateToNextFavoriteModel`) on the boolean-persist signature |
| `apps/kimi-code/src/tui/commands/provider.ts` | 1 | Import: upstream takes `effectiveModelForHost` from `../utils/model-switch`; fork also imports `performModelSwitch` from `./config` |
| `apps/kimi-code/src/tui/controllers/auth-flow.ts` | 2 | Upstream restructured `refreshProviderModels` (return type `RefreshProviderModelsResponse`); fork adds scoped refresh + `refreshCatalogModels` (`/refresh-catalog`) on `RefreshResult` |
| `apps/kimi-code/src/tui/utils/refresh-providers.ts` | 0 | **Delete/modify**: upstream deleted the file (logic moved to `packages/oauth`); fork owns it (`/refresh-catalog`, marker `refreshCatalogProviderModels`) — file must survive |
| `flake.nix` | 1 | `pnpmDeps` hash: merged `pnpm-lock.yaml` differs from both parents → hash not derivable locally (no nix); precedent = carry master's value, take the CI-reported got hash in a follow-up commit (`52a4ccbe2`, `7c4bd0c99`) |
| `packages/agent-core-v2/docs/state-manifest.d.ts` | 1 | Generated index count (Agent 73 → 74 keys; fork adds `fallbackModelActiveKey`) — regenerate via `pnpm gen:state-manifest` |
| `packages/agent-core-v2/src/agent/llmRequester/llmRequesterService.ts` | 1 | State-key union: upstream `llmRequesterLastTurnRequestKey` + fork `fallbackModelActiveKey` |
| `packages/agent-core-v2/src/human/llm/requester/bases/{anthropic,openai,openai-responses}/requester.ts` | 2 each | Dispatcher union: upstream `resolveLlmHeadersTimeoutMs`/`getLlmHeadersTimeoutDispatcher` + fork `buildProxyDispatcher(model.proxyUrl)` (per-key proxy) must coexist; `fetchOptions` line shape (conditional spread vs direct `undefined`) |
| `packages/agent-core-v2/test/agent/loop/loop.test.ts` | 1 | Wire-snapshot `toolsHash` differs (Agent tool description drift) — regenerate actual hash post-merge |
| `packages/agent-core-v2/test/tool/tool.test.ts` | 3 | Same wire-snapshot hash drift (3 hunks) |
| `packages/node-sdk/src/rpc.ts` | 1 | Pure import addition (fork: `SessionModelOverrideKind`, `SessionModelOverrides`, `Kaos`) |
| `packages/node-sdk/src/v2/config-mapper.ts` | 1 | Pure function addition (fork: `removeProviderFromConfig`) |
| `packages/node-sdk/test/config.test.ts` | 2 | Test union: upstream upgrade-metadata test + fork rotate_keys/key-proxy test |
| `packages/oauth/src/refreshProviderModels.ts` | 1 | Return-shape union: upstream adds `retiredDefault`; fork adds the `/refresh-catalog` block (`refreshProviderCatalog`, `RefreshCatalogResult`, scope filtering) |
| `packages/oauth/test/refreshProviderModels.test.ts` | 1 | Rename/modify: upstream moved the test from `apps/kimi-code/test/tui/utils/refresh-providers.test.ts`; fork edited it at the old path → keep fork's edited content at upstream's new path |

Also in the merge (auto-merged, no conflict but must be verified): `pnpm-lock.yaml`
(= upstream's lockfile + fork's `http-proxy-agent@9.1.0`/`https-proxy-agent@9.1.0`
+ `agent-base@9.0.0`), `package.json`, and the TUI component files carrying fork props
(`TabbedModelSelectorComponent` favorite wiring).

## Proposed Approach

**Preferred**: Follow the issue's prescribed procedure and the established fork
pattern (prior cycles `sync-upstream-merge-conflicts`, `-91`, `-95`, `-105`):

1. Isolate in a git worktree under `.tmp/` off the **issue-pinned** upstream ref
   `d4b9dc4a` (upstream has since advanced to `034117338`; the next scheduled sync
   picks that up — merging the pinned ref reproduces exactly the reported conflict set
   and matches precedent). The main checkout has in-flight uncommitted changes
   (`registry.ts`, `resolve.test.ts`, an untracked changeset) that must not be touched.
2. `git merge origin/master --no-ff` (merge-base `c9f01f073`) and resolve the 25 hunks:
   - **Union strategy** everywhere: keep upstream restructures, re-apply fork-owned
     lines/markers on top; never drop a fork-owned code path.
   - Workflows: union branch triggers (`master`, `main`, `release/*` + `workflow_dispatch`).
   - Requesters: compose both dispatchers (proxy per key + headers timeout).
   - `refresh-providers.ts`: keep the fork-owned file (resolve the delete/modify to
     master's version); its oauth imports (`refreshProviderCatalog`, scope types) are
     restored by unioning `packages/oauth/src/refreshProviderModels.ts`.
   - `state-manifest.d.ts`: regenerate (`pnpm gen:state-manifest`) rather than hand-edit.
   - Wire-snapshot tests: regenerate hashes from the merged reality (`vitest -u`), then
     inspect the diff so only hashes change, not fork assertions.
   - `flake.nix`: carry master's hash; record the CI-reported-hash follow-up
     (precedent `52a4ccbe2` → `7c4bd0c99`; GitHub Actions is billing-blocked, so the
     nix-build bot comment cannot fire — flag for a nix-capable maintainer).
3. Verify: `tsc --noEmit` for the four touched packages; affected vitest suites; the
   fork-owned marker audit over `.github/FORK_OWNED_FILES`; `check-no-comments.mjs`;
   `check-nix-workspace.mjs`; oxlint/oxfmt; then the full local gate
   `./scripts/local_ci.sh`. Env note from prior cycles: pnpm needs
   `export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"` (corepack Node 24).
4. No changeset (sync carries upstream's changesets; no user-facing fork behavior
   change — same as the `-0915` cycle).

**Alternatives**:
- Merge current `upstream/main` (`034117338`) instead of the pinned ref — captures more
  upstream but the conflict set would differ from the issue's report; rejected to keep
  the PR verifiable against the issue's checklist (precedent: pinned refs).

**Paths likely to change**: the 19 conflicted files above (+ regenerated
`state-manifest.d.ts`, snapshots), and `.specify/chores/sync-upstream-merge-conflicts-109/`
artifacts.

**Verification to run**:
- `./node_modules/.bin/tsc --noEmit -p packages/agent-core-v2` (issue-prescribed)
- `tsc --noEmit` for `packages/node-sdk`, `packages/oauth`, `apps/kimi-code`
- `vitest run` for `packages/agent-core-v2` (incl. `test/agent/loop`, `test/tool`),
  `packages/node-sdk/test/config.test.ts`, `packages/oauth`
- Fork-owned marker audit (all 136 entries), no conflict markers anywhere
- `node scripts/check-no-comments.mjs`, `node scripts/check-nix-workspace.mjs`
- `./scripts/local_ci.sh`

## Risks & Considerations

- **Requester dispatcher composition** — the biggest semantic risk: the fork's
  per-key proxy dispatcher and upstream's headers-timeout dispatcher must both apply;
  a wrong union silently drops one behavior (proxy or timeout) for a provider class.
- **`refresh-providers.ts` survival** — the file is fork-owned but upstream deleted it;
  keeping it must still compile against the merged oauth package (its imports are the
  fork's own catalog additions).
- **`performModelSwitch` signature reconciliation** — fork callers use boolean persist;
  upstream's is `'session' | 'model' | 'model-and-effort'`. Fork's favorite helpers must
  be re-pointed; fork behavior (rotate without persisting) must map to `'session'`.
- **flake.nix hash staleness** — merged lockfile = upstream's set + fork's proxy
  agents; neither parent's hash is correct. Cannot be computed locally (no nix);
  GitHub Actions billing-blocked means the nix-build bot cannot report the got hash.
  `nix build .#kimi-code` will fail for the next nix user until updated — must be
  flagged in the PR, not silently shipped.
- **Wire-snapshot hash drift** — regenerated hashes must be inspected so only hashes
  change; a drifted `toolsHash` could mask a real tool-description regression.
- **Auto-merge fallout** — `package.json`/`pnpm-lock.yaml`/component files merge
  cleanly textually; semantic breakage (e.g. fork props on restructured components)
  can only be caught by tsc/tests.
- **Main checkout hygiene** — in-flight uncommitted changes in the primary worktree;
  all work happens in the isolated `.tmp/` worktree.

## Open Questions

- None blocking. Follow-up (recorded, not a question): the `flake.nix` pnpmDeps hash
  needs the CI-reported got hash after merge (precedent commits `52a4ccbe2`,
  `7c4bd0c99`).
