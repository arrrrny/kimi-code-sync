# Chore Implementation: sync upstream — resolve the 2026-11-14 conflicts (#133)

- **Slug**: sync-upstream-merge-conflicts-133
- **Implemented**: 2026-11-14
- **Assessment**: ./assessment.md
- **Status**: applied
- **Branch**: `chore/sync-upstream-merge-conflicts-133`
- **Merge commit**: `d4b4552cd`

## Summary

Merged `upstream/main` (`f082f04a0`) into `master` (`b5fc44833`) and resolved all 5 conflicts by
union — keeping both the fork-owned and upstream sides of every hunk. No conflict was resolved in
favor of upstream and no blind `-X theirs` / `-s ours` was used.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `apps/kimi-code/src/tui/commands/config.ts` | modified | Kept fork's `SessionModelOverrideKind` import, `defaultThinkingEffortFor`, `favoriteModels` config read; kept upstream's `isKittyProtocolActive` and follow-up-behavior selector |
| `apps/kimi-code/src/tui/config.ts` | modified | Kept `favorite_models` / `favoriteModels` / `favoritesSection` serializer; kept `follow_up_behavior` / `followUpBehavior` |
| `packages/agent-core-v2/src/llm-adapter/model/catalog-service.ts` | modified | Kept the fork's `this.providers.get(providerId) ?? provider` credential lookup; added upstream's `supportsAmbientCredential` field |
| `packages/node-sdk/test/sdk-rpc-client-v2.test.ts` | modified | Kept both tests: fork's model-switch-across-reload and upstream's occupied-session read-only |
| `flake.nix` | modified | Took upstream's `fetchPnpmDeps` hash and documented that the fork lockfile diverges |

## Verification

- `pnpm -r --filter './packages/*' typecheck` → 15/15 packages passed
- `pnpm --filter @moonshot-ai/kimi-code typecheck` → passed
- `node scripts/check-no-comments.mjs` → `OK (1708 files)`
- `node scripts/check-nix-workspace.mjs` → `All 17 recursive workspace dependencies are present in flake.nix`
- `node scripts/check-service-naming.mjs` → `Service naming check passed`
- `pnpm lint` → 0 errors (2885 pre-existing warnings)
- `FORK_OWNED_FILES` audit → 143/143 entries present with their markers (0 problems)
- `packages/agent-core-v2` loop + key-rotation suites → 90/90 passed (incl. `rotates to the next key when the provider reports the token is invalid`)
- `packages/agent-core-v2` `catalog.test.ts` → 60/60 passed
- `packages/node-sdk` `sdk-rpc-client-v2.test.ts` → 107/108 passed
- `apps/kimi-code` `test/tui/config.test.ts` + `test/tui/commands` → 564/564 passed
- `gen:config-manifest`, `gen:wire-manifest`, `gen:state-manifest` → regenerated with no diff

### Pre-existing failure (not caused by this change)

`sdk-rpc-client-v2.test.ts` → `serves suggestFiles through the workspace handler fs service` fails
on `.gitignore` filtering (`ignored-app.ts` is returned). Reproduced identically on plain `master`
(`b5fc44833`) in a separate checkout, so it predates this merge. Reported, not fixed — it is outside
this chore's scope.

## Deviations from Assessment

None.

## Follow-ups

- Refresh `flake.nix`'s `pnpmDeps` hash with `nix build .#kimi-code` on a machine with Nix; the
  committed value is upstream's and is stale for the fork's lockfile.
- The next scheduled daily sync should be a no-op once this merges.