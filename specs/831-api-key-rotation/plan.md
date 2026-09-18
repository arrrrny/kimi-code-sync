# Implementation Plan: Provider API Key Rotation with Per-Key Proxy

**Branch**: `831-api-key-rotation` | **Date**: 2026-09-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/831-api-key-rotation/spec.md`

## Summary

Give a provider's key set a second life. Today `apiKeys` + `activeApiKeyId` exist in the config
surface but are inert at request time: the catalog bakes the active key into a static credential
provider, and when that key is rate-limited or refused the turn dies or drops to the substitute /
fallback model chains. This feature makes an exhausted key rotate to the next key, persist that
choice, and retry the in-flight request inside the same turn — plus an optional per-key proxy that
follows whichever key is active.

Approach, three parts:

1. **Key-aware credential resolution.** The catalog stops baking one key into a static provider for
   keyed providers. A new keyed credential provider live-reads the provider config on every attempt
   and resolves the active key together with its proxy, so both are re-evaluated per attempt and per
   request — that single seam covers the main loop, sub-agents, swarm batch items, fallback tiers,
   ping, and media uploads.
2. **Key rotation as a recovery strategy.** The turn machine already has the right shape: on
   `llm.failed.remote` it asks the composed recovery chain for a proposal before it retries or
   fails. A new pure strategy proposes "rotate to key N" when the failure is a refusal (403) or a
   rate limit whose retry budget is exhausted, applies the switch via `IProviderService`, and gets
   one full pass through the key list per request-step. Rotation is consulted before retry backoff
   and long before the substitute/fallback chains, which are reached only when the strategy declines
   to propose.
3. **Per-key proxy.** `LlmCredential` (the per-attempt credential payload) carries an optional
   `proxyUrl`; `applyCredential` merges it over the model's provider-level proxy. The cascade then
   falls out of the resolution order instead of being special-cased anywhere.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js `>=24.15.0` (root `engines`), pnpm `10.33.0`
workspace.

**Primary Dependencies**: none added. Zod (already the config schema engine), xstate (already the
turn machine runtime), undici `ProxyAgent` (already the proxy transport), vitest (tests).
`@moonshot-ai/agent-core-v2` is the only engine package that changes behavior; `apps/kimi-code`,
`packages/node-sdk`, and `packages/klient` change only their config surface.

**Storage**: `~/.kimi-code/config.toml`, written through `IConfigService.replace()` over
`IAtomicDocumentStore`, driven by `KosongConfigService`'s serialized persist chain
(`packages/agent-core-v2/src/app/kosongConfig/kosongConfigService.ts:115-166`). No new store, no new
file.

**Testing**: vitest. Targeted files only (`pnpm vitest run <path>`); the full suite is not run as
part of this work. Primary suites: the turn machine (`src/human/test/agent/turn.test.ts`), the
credentials module (`src/human/test/credentials/`), the provider domain
(`test/llm-adapter/provider/providers.test.ts` and friends), the catalog
(`test/llm-adapter/model/catalog.test.ts`), the config section round-trip
(`test/app/kosongConfig/`), and the TUI command/dialog suites (`apps/kimi-code/test/tui/...`).

**Target Platform**: macOS / Linux / Windows CLI and the kap-server host. No platform-specific code.

**Project Type**: monorepo — engine packages plus a CLI/TUI app.

**Performance Goals**: rotation adds no steady-state cost. Per rotation: one config write (a
per-domain read-merge-write of one TOML section) awaited before the retry, and one extra request
attempt per key. Nothing on the hot path of a healthy request changes: for a keyed provider the only
difference is that the active key is read live instead of pre-baked.

**Constraints**:

- `packages/agent-core-v2`, `packages/kap-server`, `packages/transcript` are comment-free zones — no
  comments or JSDoc anywhere under `src/`/`test/`/`scripts/` (`scripts/check-no-comments.mjs`, run by
  `pnpm lint`). New engine code inherits this.
- No external dependency may be added.
- Optional object properties are passed as `undefined`, never via conditional spread, and their types
  do not additionally allow `undefined`.
- The comment-light zone rule and the repo's own style rules apply to the doc artifacts too: no
  scratch files, no handoff notes.
- Fork sync policy: the sync workflow's `FORK_OWNED_FILES` guard list must learn the new fork-owned
  markers (see the Constitution Check).
- Tests live under `<package>/test/**` (plus the engine's colocated `src/human/test/**`); new tests
  extend existing files for a component wherever one exists.

**Scale/Scope**: one provider section of `config.toml`, one key set per provider (the user's own
config has 8 keys for `kilo` and 8 for `opencode`). The rotation cycle is bounded by the key count
per request-step, so the worst case is 8 keys × the retry budget, and only when every key fails.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**The project constitution is still an unfilled template.** `.specify/memory/constitution.md`
contains only placeholders (`[PROJECT_NAME]`, `[PRINCIPLE_1_NAME]`, `[CONSTITUTION_VERSION]`, …), so
there are no ratified gates to check this feature against, and inventing them here would manufacture
authority the project has not granted. Every gate below is therefore quoted from a binding source
that does exist — the root `AGENTS.md`, the package `AGENTS.md` files, and `scripts/check-*.mjs` —
and each names its enforcement point.

| Gate | Source | Status for this feature |
|------|--------|-------------------------|
| Comment-free zones (`agent-core-v2`, `kap-server`, `transcript`): no comments or JSDoc in `src/`/`test/`/`scripts/` | root `AGENTS.md`; enforced by `scripts/check-no-comments.mjs` under `pnpm lint` | Pass — every new engine file is comment-free; the policy functions read as code, matching `credentials.ts` / `recovery.ts` |
| No new external dependency | root `AGENTS.md` + this feature's assumptions | Pass — zod, xstate, undici and vitest already exist |
| Optional properties: no conditional spread, no `T \| undefined` in optional slot types | root `AGENTS.md` | Pass — `LlmCredential.proxyUrl?: string`, `ProviderApiKey.proxyUrl?: string`, `ProviderConfig.rotateKeys?: boolean` |
| Business domains own no persistence | `packages/agent-core-v2/AGENTS.md` ("Persistence") | Pass — rotation writes through `IProviderService` → `IConfigService`; no `node:fs`, no hand-rolled writes |
| Telemetry events must be registered before emission | `packages/agent-core-v2/AGENTS.md` ("Telemetry") | Applies if a rotation event is added to `telemetryEventDefinitions`; it is not required — the user-visible report uses the existing `WarningIssued` agent event |
| Experimental features are flag-gated, default off | root `AGENTS.md` ("Experimental Features") | Pass — the per-provider `rotate_keys` setting is itself the gate and defaults off (FR-001), so no `KIMI_CODE_EXPERIMENTAL_*` flag is added; see research.md "flag or setting" |
| Fork-owned behavior must survive the daily upstream sync | root `AGENTS.md` ("Fork Upstream Sync Policy") | **Action required** — rotation is fork-owned behavior landing in files upstream also edits. The plan adds the new markers to `FORK_OWNED_FILES` in `.github/workflows/sync-upstream.yml`, never resolves conflicts in favor of upstream, and does not touch the deprecated `sync-and-release.yml` |
| Changeset required before PR | root `AGENTS.md` + `gen-changesets` skill | **Action required** — one changeset under `.changeset/` at delivery time, `minor` for `@moonshot-ai/kimi-code-sdk` / CLI surfacing unless the changeset skill says otherwise; no `major` without explicit user confirmation |

Re-check after Phase 1 design: unchanged. The design adds no dependency, no comment, no store, and
no conditional spread; the only structural change to existing machinery (an awaited recovery apply)
is recorded in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/831-api-key-rotation/
├── plan.md              # This file
├── research.md          # Phase 0 output — decisions (a)-(f) plus adjacent decisions
├── data-model.md        # Phase 1 output — entities, fields, validation, transitions
├── quickstart.md        # Phase 1 output — runnable validation scenarios
├── contracts/           # Phase 1 output
│   ├── provider-config.md          # config surface + TOML shapes
│   ├── credential-provider.md      # credential-provider behavior contract
│   └── provider-manager-flow.md    # TUI add-key / rotation-toggle flow contract
├── checklists/
│   └── requirements.md  # existing
└── tasks.md             # Phase 2 output (/skill:speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
packages/agent-core-v2/
├── src/human/
│   ├── llm/requester/
│   │   ├── requester.ts               # LlmCredential += proxyUrl; LlmCredentialProvider += rotation();
│   │   │                              #   new LlmKeyRotationController interface
│   │   └── recovery.ts                # LlmRecoveryProposal.beforeNextAttempt: void | Promise<void>;
│   │                                  #   optional detail for the user-visible report
│   ├── credentials/
│   │   ├── credentials.ts             # applyCredential merges proxyUrl over the model proxy
│   │   └── keyRotationRecovery.ts     # NEW: pure rotation strategy (qualification + bound)
│   └── agent/turn.ts                  # recovery context gains attempt/maxAttempts; the proposal is
│                                      #   applied by an async actor before re-entering `thinking`
├── src/llm-adapter/
│   ├── provider/
│   │   ├── apiKeyRotation.ts          # NEW: keyed credential provider + rotation controller
│   │   ├── provider.ts                # ProviderConfig.rotateKeys; ProviderApiKey.proxyUrl;
│   │   │                              #   IProviderService.setActiveApiKey()
│   │   └── provider-service.ts        # setActiveApiKey implementation (read-modify-write)
│   └── model/
│       ├── catalog-service.ts         # buildCredentialProvider builds the keyed provider
│       └── model-auth.ts              # unchanged behavior; active-key helper reused
├── src/app/kosongConfig/configSection.ts  # schema: rotateKeys, apiKeys[].proxyUrl,
│                                          #   per-key snake_case <-> camelCase transforms
└── src/agent/loop/
    ├── machine/engine.ts              # compose the rotation strategy; forward rotation() through the
    │                                  #   delegating credential provider; carry the report detail
    └── loopService.ts                 # user-visible rotation notice on llm.recovering

apps/kimi-code/
├── src/tui/commands/provider.ts       # add-key asks for the optional per-key proxy;
│                                      #   new rotation toggle handler
├── src/tui/commands/prompts.ts        # optional per-key proxy prompt (empty is a valid answer)
└── src/tui/components/dialogs/provider-manager.ts  # key rows show the per-key proxy;
                                                    #   source rows show rotation state

packages/node-sdk/src/config/{schema.ts,toml.ts}   # mirror rotate_keys + apiKeys[].proxy_url
packages/klient/src/contract/global/providers.ts   # mirror rotateKeys + apiKeys[].proxyUrl

.changeset/<generated>.md                          # delivery-time changeset
.github/workflows/sync-upstream.yml                # FORK_OWNED_FILES marker additions
```

Tests (extend the existing file for the component where one exists):

```text
packages/agent-core-v2/src/human/test/credentials/credentials.test.ts   # applyCredential proxy merge
packages/agent-core-v2/src/human/test/credentials/keyRotationRecovery.test.ts  # NEW: strategy policy
packages/agent-core-v2/src/human/test/agent/turn.test.ts                # N keys in one step; bound
packages/agent-core-v2/test/llm-adapter/provider/apiKeyRotation.test.ts  # NEW: cycle, wrap, persist
packages/agent-core-v2/test/llm-adapter/model/catalog.test.ts           # keyed provider construction
packages/agent-core-v2/test/app/kosongConfig/…                          # TOML round-trip
apps/kimi-code/test/tui/commands/provider.test.ts                       # add-key proxy flow
apps/kimi-code/test/tui/components/provider-manager.test.ts             # rows/markers/toggle
```

**Structure Decision**: no new package and no new domain. The feature splits along the boundary the
engine already draws: the **human llm layer** owns pure policy (`keyRotationRecovery.ts`, the widened
`LlmCredential` / recovery-proposal types, the turn machine), the **llm-adapter layer** owns provider
config and request plumbing (`apiKeyRotation.ts`, `catalog-service.ts`, the config section), the
**agent loop layer** owns composition and user-visible reporting (`engine.ts`, `loopService.ts`), and
the app/SDK packages only mirror the config shape. Rotation state is not invented: `activeApiKeyId`
in the provider config *is* the cursor, and the turn machine's existing `appliedRecoveries` array
*is* the per-step cycle counter.

## Complexity Tracking

> Recorded because the Constitution Check found no ratified constitution to violate, but two
> deliberate structural changes do need justification.

| Change | Why needed | Simpler alternative rejected because |
|--------|------------|--------------------------------------|
| `LlmRecoveryProposal.beforeNextAttempt` may return a promise, and the turn machine applies a proposal through an async actor before re-entering `thinking` | FR-005: the new active key must be persisted and effective **before** the retry. The write is inherently async (`ProviderService.set()` awaits the `waitUntil` persist chain); a sync hook can only fire-and-forget it | Fire-and-forget persistence: a crash or a failed write right after rotation would leave the file naming a key the run no longer uses, and a test cannot observe "persisted before retry". Racing the retry against the write would make FR-005 unverifiable. A separate rotation-only state machine was rejected as a second orchestration layer (explicitly listed as a rejected scheme in `packages/agent-core-v2/docs/en/llm.md`) |
| `LlmCredential` gains an optional `proxyUrl` | FR-010/FR-018: the effective proxy must follow the active key on every request path, including sub-agents, swarm items, and fallback tiers. `applyCredential` is already the single per-attempt model mutation point for all of them | A second resolution method on `LlmCredentialProvider` (`resolveProxyUrl()`): two resolution points that can disagree, and every existing `applyCredential` call site would need a matching change. Baking the per-key proxy into `Model.proxyUrl` at catalog build time: the catalog entry is built once per config generation, so the proxy would not follow a rotation |

## Delivery notes

- Root `AGENTS.md` requires a changeset before the PR (see the Constitution Check) and forbids
  committing scratch/exploratory files; validation scripts used by quickstart.md belong under
  `.tmp/` (gitignored).
- `packages/agent-core-v2/docs/config-manifest.toml` is generated and freshness-checked
  (`test/app/config/configManifest.test.ts`): after the config section gains `rotateKeys` and the
  per-key `proxyUrl`, regenerate with `pnpm gen:config-manifest`.
