# Tasks: Provider API Key Rotation with Per-Key Proxy

**Feature Branch**: `831-api-key-rotation`

**Input**: Design documents from `/specs/831-api-key-rotation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Required. This feature is built test-first: every user story lists its test tasks before
its implementation tasks, and each test task must fail for the right reason before the matching
implementation lands. Run the named file only — `pnpm vitest run <path>` — never the full suite.

**Organization**: Tasks are grouped by user story so each story can be implemented, tested, and
delivered on its own.

**Constraints carried into the task text below**:

- `packages/agent-core-v2` is a comment-free zone: no comments and no JSDoc of any kind anywhere
  under `src/`/`test/`/`scripts/`, enforced by `scripts/check-no-comments.mjs` under `pnpm lint`.
- No new external dependency is introduced (zod, xstate, undici's `ProxyAgent`, and vitest already
  exist).
- Optional object properties are passed as `undefined`, never via conditional spread, and their
  types do not additionally allow `undefined`.
- TUI work follows `.agents/skills/write-tui/SKILL.md`; the delivery changeset follows
  `.agents/skills/gen-changesets/SKILL.md`.
- Scratch files (the end-to-end harness, captured output) belong under the gitignored `.tmp/`,
  never in the source tree.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel — different files, no dependency on an incomplete task
- **[Story]**: Which user story the task belongs to (US1, US2, US3, US4, US5); omitted on Setup,
  Foundational, and Polish tasks
- **[A<n>] [U<n>] [C<n>]**: The test-list behavior this task covers, from
  `specs/831-api-key-rotation/tdd/test-list.md`. The marker is load-bearing, not a
  cross-reference: `/speckit.tdd.run` ticks a task only when it can read a behavior id from it,
  and only when every behavior it names is `DONE`. A task with no marker is non-behavioral work
  for `/speckit.implement`
- Every task names a concrete file path

## Path Conventions

Monorepo paths from the repository root. Engine code lives under `packages/agent-core-v2/`
(`src/human/**` = the llm/credentials/turn layer, `src/llm-adapter/**` = the provider and model
layer, `src/agent/**` = the loop composition layer); the CLI/TUI lives under `apps/kimi-code/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Preconditions every story shares.

- [ ] T001 [P] Read the llm module design guide that `packages/agent-core-v2/src/human/llm/AGENTS.md` requires before touching the requester or credentials layer, `packages/agent-core-v2/docs/en/llm.md`
- [ ] T002 [P] Create the gitignored scratch workspace that will hold the end-to-end stub provider and the throwaway config home, `specs/831-api-key-rotation/quickstart.md`
- [ ] T003 [P] Record the fork-owned files this feature creates or changes together with a unique, greppable survival marker for each, ahead of the guard-list update, `.github/FORK_OWNED_FILES`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared type, schema, and mirror surface every story compiles against.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T004 [P] Extend the credential contract in the comment-free zone (no comments or JSDoc of any kind): add `LlmCredential.proxyUrl?`, `LlmCredentialProvider.rotation?()`, and the `LlmKeyRotationController` / `LlmKeyRotationOutcome` shapes, `packages/agent-core-v2/src/human/llm/requester/requester.ts`
- [ ] T005 [P] Widen the recovery contract in the comment-free zone: add `attempt` and `maxAttempts` to `LlmRecoveryContext`, let `beforeNextAttempt` return `void | Promise<void>`, and carry an optional `detail` on the recovery record (key identity only, never key material), `packages/agent-core-v2/src/human/llm/requester/recovery.ts`
- [ ] T006 [P] Extend the provider domain types in the comment-free zone: `ProviderConfig.rotateKeys?: boolean`, `ProviderApiKey.proxyUrl?: string`, and an `IProviderService.setActiveApiKey()` member, `packages/agent-core-v2/src/llm-adapter/provider/provider.ts`
- [ ] T007 [P] [U39][U40][U41][U42] Write the failing round-trip tests for the new config fields — `rotate_keys` at provider level, `proxy_url` inside a key entry, unknown raw key-entry fields preserved across a read-modify-write, empty value treated as absent, `packages/agent-core-v2/test/app/config/tomlWriteback.test.ts`
- [ ] T007a [P] [C3] Characterization baseline: capture today's provider-section serialization — a provider entry declaring none of the new fields round-trips byte-identically through a read-modify-write — and confirm it is green against untouched code before T008, `packages/agent-core-v2/test/app/config/tomlWriteback.test.ts`
- [ ] T008 [U39][U40][U41][U42][C3] Add `rotateKeys` to the providers section schema and `proxyUrl` to the `apiKeys` entry schema, plus the per-key camelCase/snake_case transforms that preserve unknown raw key-entry fields, `packages/agent-core-v2/src/app/kosongConfig/configSection.ts`
- [ ] T009 [P] [U43] Write the failing mirror tests for the SDK config surface — `rotate_keys` at provider level and `proxy_url` inside a key entry surviving a client read/write cycle, `packages/node-sdk/test/config.test.ts`
- [ ] T010 [U43] Mirror the new fields in the SDK config schema and its TOML transforms, `packages/node-sdk/src/config/schema.ts` and `packages/node-sdk/src/config/toml.ts`
- [ ] T011 [U44] Mirror `rotateKeys` and `apiKeys[].proxyUrl` in the client contract, where the compile-time parity assertions fail first if the mirror lags, `packages/klient/src/contract/global/providers.ts`

**Checkpoint**: Foundation ready — every user story can now start.

---

## Phase 3: User Story 1 - A rate-limited turn rotates to the next key instead of failing (Priority: P1) 🎯 MVP

**Goal**: With `rotate_keys` enabled on a multi-key provider, an exhausted rate limit or a refusal
switches to the next key, persists it, and retries the in-flight request in the same turn; with the
setting absent nothing changes.

**Independent Test**: Configure a provider with at least two keys, enable rotation, make the first
key return rate-limit responses until its retry budget is exhausted, and confirm the turn completes
on the second key without a new user message.

### Tests for User Story 1

> Write these first and confirm each fails for the expected reason before starting T017. Every test
> task below carries the behavior ids it covers; `/speckit.tdd.run` ticks a task only once every
> behavior it names is `DONE`.

- [ ] T012 [P] [US1] [U14][U15][U16][U17][U18][U19][U20][U21][U22][U23][U24][U25][U26][U27][U28] Write the failing suite for the keyed credential provider and the rotation controller — live re-read of the active key, `rotation()` gating (zero keys, one key, `rotate_keys` off, oauth provider, `managed:*` id all yield no controller), `plan()` definition order and wrap over at least three keys, the `rotated` / `already-advanced` / `unavailable` outcomes, persisted-before-retried, and serialized concurrent rotations advancing exactly once, `packages/agent-core-v2/test/llm-adapter/provider/apiKeyRotation.test.ts`
- [ ] T013 [P] [US1] [U29][U30][U31] Write the failing tests for `setActiveApiKey` — it advances `activeApiKeyId`, awaits persistence, repairs the cursor when the active id names no entry, and leaves the rest of the provider section untouched, `packages/agent-core-v2/test/llm-adapter/provider/providerService.test.ts`
- [ ] T014 [P] [US1] [U45][U46][U47][U48][U49][U50] [A1][A2][A3][A4][A5] Write the failing turn-machine tests for the rotation journey — a rate limit is retried on the same key up to its budget before any rotation, a 403 rotates at attempt 1, the last key wraps to the first, the turn completes with no resubmission, and a rotation-disabled or single-key run records no rotation and writes no config, `packages/agent-core-v2/src/human/test/agent/turn.test.ts`
- [ ] T015 [P] [US1] [U1][U2][U3][U4][U5][U6][U7][U8][U12][U13] Write the failing tests for the pure rotation strategy — it proposes on a 403 at any attempt and on a rate limit only once the retry budget is exhausted, and declines for 401, `quota_exhausted`, context overflow, and transport errors, `packages/agent-core-v2/src/human/test/credentials/keyRotationRecovery.test.ts`
- [ ] T016 [P] [US1] [U36][U37][U38][C4] Write the failing catalog tests for credential-provider construction — providers configured with `apiKeys` get the keyed provider, a legacy single `apiKey` keeps the static provider, and an oauth provider is untouched, `packages/agent-core-v2/test/llm-adapter/model/catalog.test.ts`. `U38` is already covered there by the existing OAuth provider test. Record the legacy-branch characterization as `C4` and confirm it is green against untouched code before T020
- [ ] T016a [P] [US1] [U51][U52] Write the failing machine-composition tests — the composed recovery chain consults the rotation strategy before the credentials strategy, and `rotation()` reaches the machine through the delegating credential view, `packages/agent-core-v2/src/human/test/agent/machine.test.ts`

### Implementation for User Story 1

- [ ] T017 [US1] [U29][U30][U31] Implement `IProviderService.setActiveApiKey` as a read-modify-write over the in-memory provider record whose awaited `set()` reaches the config persist chain, with no direct file access and no hand-rolled writes; comment-free zone, `packages/agent-core-v2/src/llm-adapter/provider/provider-service.ts`
- [ ] T018 [US1] [U14][U15][U16][U17][U18][U19][U20][U21][U22][U23][U24][U25][U26][U27][U28][U50] Implement the keyed credential provider and the per-provider serialized rotation controller — `resolve()` live-reads the provider config, `plan()` returns the next key in definition order with wrap, `rotate()` reports `rotated` / `already-advanced` / `unavailable`, and a failed write rejects without failing the turn; comment-free zone, `packages/agent-core-v2/src/llm-adapter/provider/apiKeyRotation.ts`
- [ ] T019 [US1] [U1][U2][U3][U4][U5][U6][U7][U8][U12][U13][U45] Implement the pure rotation strategy in the comment-free zone — qualification off the widened recovery context, a proposal with `strategy: 'api_key_rotation'`, the target key as `action`, and `detail` naming the provider and the target key; it holds no state of its own, `packages/agent-core-v2/src/human/credentials/keyRotationRecovery.ts`
- [ ] T020 [US1] [U36][U37][U38][C4] Build the keyed credential provider from the catalog for providers configured with `apiKeys`, leaving the legacy static-key branch and the oauth branch exactly as they are; comment-free zone, `packages/agent-core-v2/src/llm-adapter/model/catalog-service.ts`
- [ ] T021 [US1] [U46][U47][U48] Fill `attempt` and `maxAttempts` into the recovery context and apply an accepted proposal through an async actor before re-entering the thinking state, so the retry stays inside the same turn; comment-free zone, `packages/agent-core-v2/src/human/agent/turn.ts`
- [ ] T022 [US1] [U51][U52] Compose the rotation strategy first in the machine's recovery chain and forward `rotation()` through the delegating credential view; comment-free zone, `packages/agent-core-v2/src/agent/loop/machine/engine.ts`

**Checkpoint**: User Story 1 is functional and testable on its own — the MVP is deliverable here.

---

## Phase 4: User Story 2 - Rotation takes precedence over the fallback chains (Priority: P1)

**Goal**: While usable keys remain, switching key is always tried before `/substitute-model` or a
fallback model; after one full cycle the system stops rotating and hands control to the existing
substitute/fallback behavior.

**Independent Test**: Enable rotation on a multi-key provider with a fallback model configured,
exhaust the active key, and confirm the retry uses the next key on the same model with no
substitute or fallback activation.

### Tests for User Story 2

- [ ] T023 [US2] [U9][U10][U11] Write the failing bound tests for the strategy — with `keyCount - 1` rotation records already in `appliedRecoveries` it declines to propose, `packages/agent-core-v2/src/human/test/credentials/keyRotationRecovery.test.ts`
- [ ] T024 [US2] [U49] [A6][A7][A8][A19] Write the failing turn-machine tests for precedence and handoff — the retry uses the next key on the same model with no substitute or fallback activation while keys remain, a fully exhausted cycle stops proposing and fails exactly as a rotation-disabled run does, and the next step starts with a fresh rotation budget, `packages/agent-core-v2/src/human/test/agent/turn.test.ts`

### Implementation for User Story 2

- [ ] T025 [US2] [U9][U10][U11] Implement the cycle bound in the comment-free zone — count `api_key_rotation` records in `appliedRecoveries` and decline the proposal after `keyCount - 1` rotations, so the machine falls through to its existing retry/failure path and the substitute/fallback machinery is never blocked, `packages/agent-core-v2/src/human/credentials/keyRotationRecovery.ts`

**Checkpoint**: User Stories 1 and 2 both work independently, and rotation never strands a turn.

---

## Phase 5: User Story 3 - A key can use its own proxy (Priority: P2)

**Goal**: A key that declares its own proxy uses it; a key that declares none falls back to the
provider proxy; with neither, the request goes out directly — on every request path.

**Independent Test**: Set a provider-level proxy and give one key a different proxy; issue a request
with each key active and confirm each request leaves through the expected proxy.

### Tests for User Story 3

- [ ] T026 [P] [US3] [U32][U33][U34][U35] Write the failing tests for the credential proxy merge — the key's proxy wins over the model's, an absent key value keeps the model's proxy, and neither value yields no proxy, `packages/agent-core-v2/src/human/test/credentials/credentials.test.ts`
- [ ] T027 [P] [US3] [A9][A10][A11][A12] Write the failing cascade tests that observe egress through a per-key proxy and through the provider proxy, including a request issued through the catalog's direct caller (the path ping, compaction, and media uploads share, and the one sub-agents and fallback tiers bind to), `packages/agent-core-v2/test/llm-adapter/model/credentialProxyCascade.test.ts`

### Implementation for User Story 3

- [ ] T028 [US3] [U32][U33][U34] Merge the credential proxy over the model proxy in `applyCredential` so the key → provider → none cascade falls out of the resolution order instead of being special-cased; comment-free zone, `packages/agent-core-v2/src/human/credentials/credentials.ts`
- [ ] T029 [US3] [U15] Return the active key's `proxyUrl` from the keyed provider's `resolve()`, trimmed, with an empty value treated as absent so the provider proxy still applies; comment-free zone, `packages/agent-core-v2/src/llm-adapter/provider/apiKeyRotation.ts`

**Checkpoint**: Per-key proxying works for the main loop and every other request path.

---

## Phase 6: User Story 4 - Adding a key asks for its proxy (Priority: P2)

**Goal**: The provider manager's add-key flow asks for the optional per-key proxy after the name and
secret, accepting an empty answer, and the dialog shows the stored proxy and the rotation state.

**Independent Test**: Add a key leaving the proxy empty, then add another key with a proxy value;
confirm both are stored and shown.

### Tests for User Story 4

- [ ] T030 [P] [US4] [U55][U56][U57][U58][U59][U60][U61][U62][U63][U64] [A13][A14][A15] Write the failing provider-command tests — the add-key flow asks name, secret, then exactly one optional proxy question; an empty answer stores no per-key proxy, a value stores it, cancelling at the proxy prompt writes nothing, invalid input is re-prompted; and `R` flips only `rotateKeys`, writing nothing on a single-key provider, `apps/kimi-code/test/tui/commands/provider.test.ts`. The prompt helper's own behaviors (`U55`–`U58`) are exercised the same way, through the flow that drives it
- [ ] T030a [P] [US4] [C1] Characterization baseline: capture today's add-key flow — name, then secret, and the entry is written as `{ key, name }` with the first key becoming active and no proxy field — and confirm it is green against untouched code before T033, `apps/kimi-code/test/tui/commands/provider.test.ts`
- [ ] T031 [P] [US4] [U65][U66][U67][U68] [A16] Write the failing provider-manager dialog tests — the key row shows the per-key proxy host (never userinfo, never the secret), the source row shows the rotation state, and the active-key marker is unchanged, `apps/kimi-code/test/tui/components/dialogs/provider-manager.test.ts`
- [ ] T031a [P] [US4] [C2] Characterization baseline: capture today's key-row rendering — name, masked preview, the `← current` marker on the active key, and no proxy text — and confirm it is green against untouched code before T034, `apps/kimi-code/test/tui/components/dialogs/provider-manager.test.ts`

### Implementation for User Story 4

- [ ] T032 [US4] [U55][U56][U57][U58] Add the tri-state per-key proxy prompt helper — cancel abandons the flow, an empty answer is accepted and clears the per-key proxy, and a value sets it — as the third question of the add-key flow; follow `.agents/skills/write-tui/SKILL.md`, `apps/kimi-code/src/tui/commands/prompts.ts`
- [ ] T033 [US4] [U59][U60][U61][U62][U63][U64][C1] Wire the proxy question into the add-key flow and add the `R` rotation toggle handler (decoded with `printableChar`, never a literal key comparison) persisting through the existing replace/set path; follow `.agents/skills/write-tui/SKILL.md`, `apps/kimi-code/src/tui/commands/provider.ts`
- [ ] T034 [US4] [U65][U66][U67][U68][C2] Render the per-key proxy host on key rows and the rotation state plus the `R` hint on source rows, using theme styles only and never printing full secrets; follow `.agents/skills/write-tui/SKILL.md`, `apps/kimi-code/src/tui/components/dialogs/provider-manager.ts`

**Checkpoint**: Per-key proxies are settable and inspectable without hand-editing `config.toml`.

---

## Phase 7: User Story 5 - The rotation is visible while it happens (Priority: P3)

**Goal**: Every switch reports the provider and the newly active key by name or id, with no secret
material anywhere.

**Independent Test**: Force rotation with a rate-limited key while watching the session output and
confirm each switch is reported with the provider and key identity.

### Tests for User Story 5

- [ ] T035 [US5] [U53][U54] [A17][A18] Write the failing loop tests for the rotation notice — one notice per switch naming the provider and the new key by id or name, and no key material in any emitted event, `packages/agent-core-v2/test/agent/loop/loop.test.ts`

### Implementation for User Story 5

- [ ] T036 [US5] [U53][U54] Emit the `api-key-rotation` warning from the machine's recovery path, carrying the proposal's `detail` and never key material or a masked key; comment-free zone, `packages/agent-core-v2/src/agent/loop/loopService.ts`

**Checkpoint**: All five stories are independently functional and observable.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Delivery actions and end-to-end validation across all stories.

- [ ] T037 [P] Regenerate the config manifest after the section change, `packages/agent-core-v2/docs/config-manifest.toml`
- [ ] T038 [P] Write the delivery changeset — one user-facing sentence for the rotation setting and the per-key proxy, listing `@moonshot-ai/kimi-code` at the bump level the changeset rules allow — `.changeset/api-key-rotation.md`
- [ ] T039 [P] Append the new fork-owned files and their survival markers to the guard list that the verifier step in `.github/workflows/sync-upstream.yml` reads, `.github/FORK_OWNED_FILES`
- [ ] T040 [P] Document the per-provider rotation setting and the per-key proxy cascade on both language pages, following the documentation rules, `docs/en/configuration/providers.md` and `docs/zh/configuration/providers.md`
- [ ] T041 Run the end-to-end CLI validation with the stub provider and the throwaway config home, then confirm the written file names the successful key and the captured output contains no secret material, `specs/831-api-key-rotation/quickstart.md`
- [ ] T042 [P] Run the repo gates over the changed packages — the comment-free-zone check through `pnpm lint` and a targeted typecheck — `scripts/check-no-comments.mjs`

---

## Phase 9: Acceptance closure (outer loop)

**Purpose**: One closing task per acceptance criterion in `spec.md`. The outer-loop test for a
criterion is green before its story counts as complete; a criterion that cannot go green is a
finding to report, never a test to relax. Each task names the suite that hosts its test — the
integration level the profile's `acceptance: null` allows (see the test list's outer-loop note).

- [ ] T043 [US1] [A1] Acceptance closure: a rate-limited first key completes the turn on the second key inside one turn with no resubmission, `packages/agent-core-v2/src/human/test/agent/turn.test.ts`
- [ ] T044 [US1] [A2] Acceptance closure: a refused (403) key is retried on the next key without first consuming its retry budget, `packages/agent-core-v2/src/human/test/agent/turn.test.ts`
- [ ] T045 [US1] [A3] Acceptance closure: with the last key active, the retry uses the first key again, `packages/agent-core-v2/src/human/test/agent/turn.test.ts`
- [ ] T046 [US1] [A4] Acceptance closure: after a rotation the configuration names the key that served the successful request, `packages/agent-core-v2/src/human/test/agent/turn.test.ts`
- [ ] T047 [US1] [A5] Acceptance closure: with rotation off, a rate-limited or refused key behaves exactly as before the feature, `packages/agent-core-v2/src/human/test/agent/turn.test.ts`
- [ ] T048 [US2] [A6] Acceptance closure: the next key is tried on the current model before any substitute model, `packages/agent-core-v2/src/human/test/agent/turn.test.ts`
- [ ] T049 [US2] [A7] Acceptance closure: the next key is tried before the fallback chain is entered, `packages/agent-core-v2/src/human/test/agent/turn.test.ts`
- [ ] T050 [US2] [A8] Acceptance closure: a fully exhausted cycle stops rotating and hands off to the existing substitute/fallback behavior, `packages/agent-core-v2/src/human/test/agent/turn.test.ts`
- [ ] T051 [US3] [A9] Acceptance closure: a key's own proxy is the egress used for requests made with that key, `packages/agent-core-v2/test/llm-adapter/model/credentialProxyCascade.test.ts`
- [ ] T052 [US3] [A10] Acceptance closure: a key declaring no proxy uses the provider's proxy, `packages/agent-core-v2/test/llm-adapter/model/credentialProxyCascade.test.ts`
- [ ] T053 [US3] [A11] Acceptance closure: with no proxy declared anywhere, the request goes out without one, `packages/agent-core-v2/test/llm-adapter/model/credentialProxyCascade.test.ts`
- [ ] T054 [US3] [A12] Acceptance closure: the retry after a rotation uses the rotated-to key's proxy, `packages/agent-core-v2/test/llm-adapter/model/credentialProxyCascade.test.ts`
- [ ] T055 [US4] [A13] Acceptance closure: the add-key flow asks name, secret, then one optional proxy value, `apps/kimi-code/test/tui/commands/provider.test.ts`
- [ ] T056 [US4] [A14] Acceptance closure: an empty proxy answer leaves the key inheriting the provider's proxy, `apps/kimi-code/test/tui/commands/provider.test.ts`
- [ ] T057 [US4] [A15] Acceptance closure: a supplied proxy survives a restart with the key, `apps/kimi-code/test/tui/commands/provider.test.ts`
- [ ] T058 [US4] [A16] Acceptance closure: a key's stored proxy is visible in the provider manager while the secret is not, `apps/kimi-code/test/tui/components/dialogs/provider-manager.test.ts`
- [ ] T059 [US5] [A17] Acceptance closure: every switch reports the provider and the new active key by name or identifier, `packages/agent-core-v2/test/agent/loop/loop.test.ts`
- [ ] T060 [US5] [A18] Acceptance closure: no secret key material appears in anything the rotation reports, `packages/agent-core-v2/test/agent/loop/loop.test.ts`
- [ ] T061 [US5] [A19] Acceptance closure: after a full cycle the user is told every configured key was tried — see the test list's assumption note: `plan.md`'s "Conflicts found" records that a 429/403 exhausting the cycle does not activate the fallback today, so the observable is the step's own failure reaching the session. If a dedicated notice is intended, this task cannot close without a new requirement, `packages/agent-core-v2/src/human/test/agent/turn.test.ts`

**Checkpoint**: every acceptance criterion is green at its level, or is reported as an open question rather than as passing.

## Phase 10: Remediation (audit pass 1)

**Verdict:** the TDD audit (`tdd/verification.md`) returned **FAIL**, on two blocking findings — FR-007
(rotation must pre-empt the substitute/fallback chains) and FR-014 (every rotation reported with the
provider and the key, never the secret) had no test. **Remediation pass 1** closes both; a **re-audit
(pass 2) is pending** and must re-run the verification before this feature is treated as clean.

- [x] T062 [A6][A8][U51] Add the composition tests for rotation precedence — the rotation proposal taken ahead of a caller substitute-model chain, and the handoff to that chain once every key of the step has been tried — `packages/agent-core-v2/test/agent/loop/machineEngineRecovery.test.ts`
- [x] T063 [A17][A18][U53][U54] Add the notice test through the real agent loop — exactly one `api-key-rotation` `WarningIssued` naming the provider and the new key, carrying no key value — `packages/agent-core-v2/test/agent/loop/loop.test.ts`
- [x] T064 Fix the harness defect behind T063's wrong-reason red — merge the configured provider record instead of replacing it in `configWithProvider` — `packages/agent-core-v2/test/harness/agent.ts`
- [x] T065 Record the remediation in the spec artifacts — refresh every test-list state and `test` column, merge the duplicated cycle-log entries, and append this phase — `specs/831-api-key-rotation/tdd/test-list.md`, `specs/831-api-key-rotation/tdd/cycle-log.md`, `specs/831-api-key-rotation/tasks.md`

---

## Phase 11: TDD remediation (audit pass 2)

**Verdict:** `tdd/verification.md` (pass 2, `verified_at: 6202e94e2`) returned **FAIL** again. Pass 1's
two blocking findings — FR-007 and FR-014 had no test — are **resolved** and mutant-killed. The
verdict stays `FAIL` on the rubric's remaining conditions: 16 behaviors are `TEST_AFTER`, 4 are
`NO_TEST` (U49, A2, A7, A19), one acceptance scenario (US5.3 / A19) is **unimplemented as well as
untested** (finding 12), and `PROVEN` is 0 because the three commits are a file-group split that
cannot show ordering (finding 11). **The feature is not done until the blocking findings below are
cleared.** Nothing about the code is known to be broken: 245 feature tests pass and every mutant was
killed.

- [ ] T066 [A19][US5.3] Resolve the exhausted-cycle notice — either implement "all configured keys were tried" for the rotation cycle and test it, or record the scenario as descoped; the test list's Assumptions section and `spec.md:157` still describe it as a live requirement — `packages/agent-core-v2/src/agent/loop/loopService.ts`, `packages/agent-core-v2/test/agent/loop/loop.test.ts`. Proof: a test asserting the notice fires once when the cycle is exhausted and the fallback then runs.
- [ ] T067 [U49] Add the per-step rotation budget test — a later step of the same turn must start with a fresh rotation budget — `packages/agent-core-v2/src/human/test/agent/turn.test.ts`. Proof: `pnpm vitest run packages/agent-core-v2/src/human/test/agent/turn.test.ts` reports the new case passing.
- [ ] T068 [A2][A7] Add the 403 acceptance variants — a refused key rotates to the next key without spending that key's budget, and does so before the fallback chain — `packages/agent-core-v2/test/agent/loop/machineEngineRecovery.test.ts` (mirror the two existing cases with a 403 instead of a 429). Proof: same file passes with two new cases.
- [ ] T069 [U51][U52][U53][U54][A6][A8][A9][A10][A11][A12][A17][A18][U57][U60][U62][U67] Record the `TEST_AFTER` class on the test list so `DONE` is not read as test-first — add the class column or a note beside each of the 16 behaviors — `specs/831-api-key-rotation/tdd/test-list.md`. Proof: every behavior whose cycle recorded no red carries the class.
- [ ] T070 [A4][A3][FR-005][FR-004] Drive the turn machine against the real `ApiKeyRotationController` and `ProviderService` instead of the stub at `turn.test.ts:809`, so persistence and wraparound are observable at the acceptance level (finding 4 and finding 5) — `packages/agent-core-v2/src/human/test/agent/turn.test.ts`. Proof: a case that reads the advanced `activeApiKeyId` back out of the provider service after a rotation.
- [ ] T071 [FR-018] Cover the sub-agent and swarm request paths, which today stub `IModelCatalog` and so cannot observe the applied proxy (finding 7) — `packages/agent-core-v2/test/session/subagent/spawn.test.ts`. Proof: a case asserting the active key's proxy on a sub-agent request.
- [ ] T072 [FR-012] Assert the per-key proxy survives a restart by re-reading it through a fresh service instance rather than asserting the written config shape (finding 8) — `packages/agent-core-v2/test/llm-adapter/provider/providerService.test.ts`. Proof: a case that builds a second service over the same config file and reads the key's proxy back.
- [ ] T073 [U51][U53] Remove the bypassed stub — `createToolExecutor()` re-implements `stubToolExecutor()` and casts through `unknown` (finding 13) — `packages/agent-core-v2/test/agent/loop/machineEngineRecovery.test.ts`, `packages/agent-core-v2/test/agent/loop/stubs.ts`. Proof: the file imports `stubToolExecutor` and no longer casts.
- [ ] T074 [A17][A18] Widen the harness option type so the notice test stops casting through `unknown` — the escape at `loop.test.ts:2279` is what let cycle 28's harness defect past the compiler (finding 14) — `packages/agent-core-v2/test/harness/agent.ts`, `packages/agent-core-v2/test/agent/loop/loop.test.ts`. Proof: the test compiles without `as unknown as`.
- [ ] T075 Refresh the stale frontmatter — `updated_at` and `suite_baseline` in the test list and the cycle log (finding 10) — `specs/831-api-key-rotation/tdd/test-list.md`, `specs/831-api-key-rotation/tdd/cycle-log.md`. Proof: both frontmatters name `6202e94e2` and `red`.
- [ ] T076 Correct the three test paths named by T007/T007a and T027/T051–T054, which point at files that do not exist, and re-commit the feature as per-cycle commits so a future audit can corroborate ordering (finding 11) — `specs/831-api-key-rotation/tasks.md`. Proof: no task references `credentialProxyCascade.test.ts` or `tomlWriteback.test.ts`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Stories (Phases 3–7)**: All depend on Foundational. They may run in parallel or in priority
  order (US1 → US2 → US3 → US4 → US5).
- **Acceptance closure (Phase 9)**: Each task depends on every behavior of its criterion, on the test
  tasks that host it, and on the implementation tasks those behaviors name. It gates the story, so it
  closes after the story's own phase.
- **Polish (Phase 8)**: Depends on every story that is being delivered.

### Story Completion Order

- **US1 (P1)** — no dependency on another story; ships as the MVP.
- **US2 (P1)** — builds on US1's strategy and controller surface; independently testable once US1 exists.
- **US3 (P2)** — the proxy cascade is independent of rotation behavior; it needs only the Foundational
  type surface plus US1's keyed provider to carry a key's proxy.
- **US4 (P2)** — the TUI flow writes config only; it can be built as soon as Foundational lands, and it
  becomes user-visible for rotation once US1 lands.
- **US5 (P3)** — reports the rotations US1 performs; needs US1's proposal `detail` and US2's bound.

### Task-Level Dependency Graph

```text
T001, T002, T003           (Setup, parallel)
      │
      ├─ T004 ─┐
      ├─ T005 ─┤
      ├─ T006 ─┼─→ T011
      ├─ T007 ─→ T007a ─→ T008
      └─ T009 ─→ T010
      │
   (Foundational complete)
      │
US1:  T012 ─┐
      T013 ─┼─→ T017 (setActiveApiKey) ─→ T018 (keyed provider + controller)
      T014 ─┤                          ─→ T019 (strategy)
      T015 ─┤                          ─→ T020 (catalog wiring)
      T016, T016a ─┘                   ─→ T021 (turn machine) ─→ T022 (engine composition)
US2:  T023 ─┐
      T024 ─┴─→ T025 (cycle bound)         [needs T019]
US3:  T026, T027 ─→ T028 (applyCredential) ─→ T029 (resolve proxy)   [T029 needs T018]
US4:  T030, T031, T030a, T031a ─→ T032 ─→ T033 ─→ T034
US5:  T035 ─→ T036                          [needs T022, T025]
      │
Phase 9: T043–T047 (US1) · T048–T050 (US2) · T051–T054 (US3) · T055–T058 (US4) · T059–T061 (US5)
      │
Polish: T037, T038, T039, T040, T041, T042  [T041 after the stories it validates]
```

### Within Each User Story

- Test tasks are written and failing before the implementation tasks they cover, and each test task
  carries the behavior ids from `tdd/test-list.md` that it covers.
- Characterization tasks (`T007a`, `T030a`, `T031a`, and the `C4` case inside `T016`) are green against
  untouched code before the implementation task that changes their component starts.
- Types and models before services; services before wiring; core behavior before integration.
- Story complete before moving to the next priority (or in parallel by a different developer).
- Phase 9 closes the outer loop: its tasks come last for their story, never before that story's
  implementation tasks.

### Parallel Opportunities

- T001, T002, T003 (Setup) can all run together.
- T004, T005, T006, T007, T009 (Foundational) touch five different files and can run together; T007a
  follows T007, T008 follows T007a, T010 follows T009, T011 follows T006.
- T012–T016 and T016a (US1 tests) touch six different files and can run together.
- T007a, T026/T027 (US3 tests), T030/T031 plus T030a/T031a (US4 tests) are pairwise parallel.
- T037, T038, T039, T040, T042 (Polish) touch unrelated files.
- Phase 9's tasks add no new files; they reuse the suites their story phases own.

---

## Parallel Example: User Story 1

```bash
# Launch every US1 test task together — five different files, no shared edits:
Task: "Keyed provider + rotation controller suite in packages/agent-core-v2/test/llm-adapter/provider/apiKeyRotation.test.ts"
Task: "setActiveApiKey tests in packages/agent-core-v2/test/llm-adapter/provider/providerService.test.ts"
Task: "Rotation journey tests in packages/agent-core-v2/src/human/test/agent/turn.test.ts"
Task: "Rotation strategy policy tests in packages/agent-core-v2/src/human/test/credentials/keyRotationRecovery.test.ts"
Task: "Keyed provider construction tests in packages/agent-core-v2/test/llm-adapter/model/catalog.test.ts"
```

```bash
# Then the independent implementation files can proceed together once the tests are red:
Task: "setActiveApiKey in packages/agent-core-v2/src/llm-adapter/provider/provider-service.ts"
Task: "Rotation strategy in packages/agent-core-v2/src/human/credentials/keyRotationRecovery.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational — this blocks every story.
3. Complete Phase 3: User Story 1 (T012–T022), characterization tasks included.
4. **STOP and VALIDATE**: run the US1 test files, close T043–T047, and run quickstart scenarios 1, 2, 3,
   and 5 — a rate-limited turn must complete on the next key with the new key recorded in the file.
5. Deploy/demo if ready.

### Incremental Delivery

1. Setup + Foundational → the config surface exists and round-trips.
2. US1 → rotation works end to end → MVP.
3. US2 → the cycle is bounded and never races the substitute/fallback chains.
4. US3 → per-key proxies follow the active key on every request path.
5. US4 → keys and their proxies are manageable from the provider manager.
6. US5 → each switch is reported to the user.
7. Polish → config manifest, changeset, fork-owned guard markers, docs, end-to-end validation.

### Parallel Team Strategy

1. The team completes Setup + Foundational together.
2. Once Foundational is done: US1 first (it is the MVP and the rest lean on its surface), then US2,
   US3, US4, and US5 can be split across developers — US3 and US4 are independent of US2, and US5
   needs only US1 and US2.
3. Validate each story with its own test files before merging.

---

## Notes

- `[P]` marks tasks that touch different files and depend on no incomplete task; two tasks that edit
  the same file are never parallel.
- Every test task names the suite it extends or creates; new modules (`apiKeyRotation.ts`,
  `keyRotationRecovery.ts`) have no existing suite to extend and get co-located new files under the
  same `test/` root as their siblings.
- Run the named file only (`pnpm vitest run <path>`); the full suite is not part of this feature's
  validation.
- Rotation state is never invented: `activeApiKeyId` is the cursor and the turn machine's
  `appliedRecoveries` is the per-step cycle counter.
- Key ids and key names are the only key-derived values allowed in output, logs, or telemetry.
- Commit after each task or logical group; do not commit scratch files from `.tmp/`.
- Behavior ids come from `specs/831-api-key-rotation/tdd/test-list.md` (`A` = acceptance, `U` = unit,
  `C` = characterization). `/speckit.tdd.run` ticks the tasks that carry them and leaves every
  unmarked task — the type surface, the delivery actions — to `/speckit.implement`.
- The suite baseline is **unknown**: `.specify/memory/tdd-profile.md` records it as pending and this
  feature's planning step did not run the full suite. Establish it before the first cycle; a red
  baseline is an escape hatch, not a starting point (see `tdd/cycle-log.md`, baseline entry).
- The single-test command exits 0 when the name matches nothing, so a red is asserted on the
  `Tests  N passed` line of the output, never on `$?`.
