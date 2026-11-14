# Chore Assessment: sync upstream — resolve the 2026-11-14 conflicts (#133)

- **Slug**: sync-upstream-merge-conflicts-133
- **Created**: 2026-11-14
- **Source**: https://github.com/arrrrny/kimi-code-sync/issues/133 (loaded via `gh issue view 133`)
- **Verdict**: in scope
- **Size**: medium

## Report (verbatim or summarized)

Issue #133 (labels: `sync`, author: `github-actions`, opened 2026-11-14T03:03:24Z, state OPEN): the
daily upstream sync aborted on **5** merge conflicts and, per the Fork Upstream Sync Policy in
`AGENTS.md`, opened this issue for human resolution. Auto-resolving toward upstream is forbidden.

Issue-listed conflicted files:

- `apps/kimi-code/src/tui/commands/config.ts`
- `apps/kimi-code/src/tui/config.ts`
- `flake.nix`
- `packages/agent-core-v2/src/llm-adapter/model/catalog-service.ts`
- `packages/node-sdk/test/sdk-rpc-client-v2.test.ts`

Commit refs carried by the issue:

- local master: `b5fc44833fe4f7b90a59ae26e9ed03e98ae37c89`
- upstream/main: `f082f04a093a3e71a2263c5461d52507dc31f83a`

### Drift check (re-measured at resolution time)

| Ref | Issue says | Live at resolution |
|-----|-----------|--------------------|
| `origin/master` | `b5fc44833` | `b5fc44833` (unchanged) |
| `upstream/main` | `f082f04a0` | `f082f04a0` (unchanged) |

The snapshot was current; no re-basing was needed.

## Summary

A routine daily upstream sync brought 10 upstream commits into conflict with fork-owned code in two
TUI config modules, one credential-resolution path, a Nix dependency hash, and one SDK test file.
The change is pure merge integration — no new user-facing capability and nothing broken — which makes
it a chore rather than a feature or bug.

## Constitution Check

- **Fork Upstream Sync Policy (mandatory)**: the resolution keeps every fork-owned behavior and
  never runs `git merge -X theirs` / `-s ours`. Both sides of each conflict were kept where they are
  independent; where they touch the same statement, the fork's semantics were preserved and the
  upstream addition layered on top. No conflict was resolved in favor of upstream.
- **`FORK_OWNED_FILES` secondary guardrail**: all 143 entries were verified present with their
  survival markers after the resolution.
- **Comment-free zones** (`packages/agent-core-v2`, `packages/kap-server`, `packages/transcript`):
  the two added notes live in `flake.nix` only, which is outside those zones. `check-no-comments.mjs`
  passes.
- **Monorepo workspace maintenance**: no workspace package was added or removed, so
  `pnpm-workspace.yaml` and `flake.nix` need no membership changes; `check-nix-workspace.mjs` passes.

## Affected Paths

- `apps/kimi-code/src/tui/commands/config.ts:12` — fork's `SessionModelOverrideKind` import vs upstream's `isKittyProtocolActive`
- `apps/kimi-code/src/tui/commands/config.ts:110` — fork's `favoriteModels` config read vs upstream's `followUpBehavior`
- `apps/kimi-code/src/tui/config.ts` — fork's `favorite_models` / `favoriteModels` / favorites TOML section vs upstream's `follow_up_behavior` / `followUpBehavior`
- `packages/agent-core-v2/src/llm-adapter/model/catalog-service.ts:208` — fork's `providers.get(providerId) ?? provider` credential lookup vs upstream's inlined lookup + `supportsAmbientCredential`
- `packages/node-sdk/test/sdk-rpc-client-v2.test.ts:1530` — fork's model-switch-across-reload test vs upstream's occupied-session read-only test
- `flake.nix:159` — `fetchPnpmDeps` hash; the fork's lockfile diverges from upstream's

## Proposed Approach

**Preferred**: Union-resolve every conflict. The five conflicts are all "two independent additions
that happen to touch the same lines", not "two designs of the same thing":

- Both TUI config files: keep the fork's `favoriteModels` / `favorite_models` fields and the
  `favoritesSection` serializer output, and keep upstream's `followUpBehavior` /
  `follow_up_behavior` fields and selector wiring. Both features are independent config keys.
- `catalog-service.ts`: keep the fork's `this.providers.get(providerId) ?? provider` lookup (it
  resolves the live provider record, which the fallback/substitute cascade depends on) and add
  upstream's `supportsAmbientCredential` field to the returned state.
- `sdk-rpc-client-v2.test.ts`: keep both tests verbatim.
- `flake.nix`: the hash is a build-input checksum, not a behavior. Take upstream's value (the newer
  lockfile base) and document that the fork's lockfile diverges, so the value is stale for a fork
  build until refreshed by `nix build`.

**Alternatives**:
- Regenerate the Nix hash properly (requires `nix` locally). Preferred long-term, but `nix` is not
  installed on this machine, so the documented-stale route was taken instead of guessing a hash.

**Paths likely to change**:
- the 5 conflicted files listed above

**Verification to run**:
- `pnpm -r --filter './packages/*' typecheck`
- `pnpm --filter @moonshot-ai/kimi-code typecheck`
- `node scripts/check-no-comments.mjs`, `node scripts/check-nix-workspace.mjs`, `node scripts/check-service-naming.mjs`
- fork marker audit over `.github/FORK_OWNED_FILES`
- `pnpm lint`
- targeted suites: `packages/agent-core-v2` loop/rotation/catalog tests, `packages/node-sdk`
  `sdk-rpc-client-v2.test.ts`, `apps/kimi-code` TUI config + command tests

## Risks & Considerations

- **Silent feature loss** — the classic failure mode of this workflow. Mitigated by the marker audit
  and by keeping both sides of every conflict rather than picking one.
- **Stale Nix hash** — `flake.nix`'s `pnpmDeps` hash does not match the fork's lockfile. A `nix build`
  will fail with a hash mismatch until refreshed. This is called out in a comment at the hash and in
  `implement.md`.
- **`supportsAmbientCredential`** is a new upstream field; keeping the fork's lookup means the field
  is computed from the upstream `provider` argument, which is the same value the fork's lookup
  resolves for the ambient check.

## Open Questions

- [NEEDS CLARIFICATION: the `flake.nix` `pnpmDeps` hash needs a `nix build .#kimi-code` refresh on a
  machine with Nix; the committed value is upstream's and is known stale for the fork lockfile.]