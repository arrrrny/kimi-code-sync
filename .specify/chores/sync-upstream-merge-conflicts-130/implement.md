# Chore Implementation: sync upstream — resolve the 2026-11 restructure conflicts (#130)

- **Slug**: sync-upstream-merge-conflicts-130
- **Implemented**: 2026-11-13
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Merged upstream `upstream/main` (`638c6ffe0`) into `master`, resolving all 111 merge conflicts across `packages/core`, `packages/agent-core-v2`, `packages/kap-server`, `packages/node-sdk`, `packages/klient`, `apps/kimi-code`, documentation, and build configuration. Ported all fork-owned features (`buildProxyFetch`, `x-opencode-session` headers, LLM error recovery with `detail`/`failed`, key rotation recovery, squeeze-model cascade, compaction handoff, and model favorites) onto `@moonshot-ai/core` and the updated `agent-core-v2` architecture, migrated `node-sdk` and `kap-server` off the removed `kosong` and `transcript` packages, regenerated all manifests, and restored `scripts/check-no-comments.mjs`.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `packages/core/src/llm/endpoint.ts` | modified | Ported `buildProxyFetch` from legacy `human/llm/requester/bases/*` |
| `packages/core/src/llm/generate.ts` | modified | Ported `opencodeSessionHeaders` (`x-opencode-session` session affinity header) |
| `packages/core/src/llm/policy/recovery.ts` | modified | Ported structured `detail`, `failed` logging, and `exhausted()` from legacy recovery |
| `packages/core/vitest.config.ts` | added | Restored package-level vitest config for `@moonshot-ai/core` |
| `packages/agent-core-v2/src/agent/fullCompaction/*.ts` | modified | Ported compaction model overlay, squeeze fork ops, and auto-compact handoff onto `@moonshot-ai/core` `prepareOperation` |
| `packages/agent-core-v2/src/agent/loop/{loopService,requester,loop}.ts` | modified | Replaced legacy `human/agent/machine` xstate engine with upstream loop and preserved substitute/fallback cascade |
| `packages/agent-core-v2/src/human/credentials/{credentials,keyRotationRecovery}.ts` | modified | Ported `credential.proxyUrl` and `LlmKeyRotationController` recovery integration |
| `packages/kap-server/src/**` | modified | Migrated off deleted `packages/transcript` onto conversation feed services and updated `events-zod.ts` |
| `packages/node-sdk/src/**` | modified | Migrated off `@moonshot-ai/kosong` onto `@moonshot-ai/core` LLM types and updated config/schema definitions |
| `apps/kimi-code/src/tui/**` | modified | Resolved TUI command, auth-flow, and message-flow conflicts preserving fork slash commands |
| `scripts/check-no-comments.mjs` | modified | Preserved fork-required comment-free zone linter |
| `flake.nix`, `vitest.config.ts`, `docs/{en,zh}/reference/server-api.md` | modified | Synced workspace paths, vitest projects list, and bilingual API documentation |

## Verification

- Commands run:
  - `pnpm -r --filter './packages/*' typecheck` → 15/15 packages passed (`tsc --noEmit` 0 errors)
  - `pnpm --filter @moonshot-ai/kimi-code typecheck` → passed (0 errors)
  - `pnpm --filter @moonshot-ai/vis-server typecheck && pnpm --filter @moonshot-ai/vis-web typecheck` → passed (0 errors)
  - `node scripts/check-no-comments.mjs` → `OK (1710 files)`
  - `node scripts/check-nix-workspace.mjs` → `All 17 recursive workspace dependencies are present in flake.nix`
  - `node scripts/check-service-naming.mjs` → `Service naming check passed`
  - `pnpm --filter @moonshot-ai/core test` → 60/60 tests passed across 7 suites
  - `pnpm -C packages/node-sdk exec vitest run test/config.test.ts test/catalog.test.ts test/list-sessions.test.ts` → 34/34 tests passed
  - `pnpm -C packages/kap-server exec vitest run test/services/conversation.test.ts test/apiSurface.snapshot.test.ts test/config.test.ts` → 74/74 tests passed
  - `pnpm -C packages/agent-core-v2 exec vitest run test/wire/wireManifest.test.ts test/state/stateManifest.test.ts test/app/config/configManifest.test.ts` → 5/5 manifest tests passed
  - `pnpm -C packages/agent-core-v2 exec vitest run` (fork conflict & rotation suites: `apiKeyRotation.test.ts`, `credential-recovery.test.ts`, `compactionOps.test.ts`, etc.) → all passed

## Deviations from Assessment

None. All planned passes completed as scoped.

## Follow-ups

- Monitor the next scheduled daily upstream sync workflow run to confirm clean merge and `FORK_OWNED_FILES` marker verification.