---
feature: 831-api-key-rotation
started_at: 3f2a19d8f
suite_baseline: unknown
profile: .specify/memory/tdd-profile.md
profile_detected_at: 3f2a19d8f
---

# Cycle Log: Provider API Key Rotation with Per-Key Proxy

Append only. Newest last. Every entry's `red` block is the evidence that the test existed
and failed before the implementation. `/speckit.tdd.run` appends the cycle entries;
`/speckit.tdd.plan` wrote only this baseline.

## Baseline

- suite: not run. `.specify/memory/tdd-profile.md` records `suite_baseline: pending` (its
  profiling run had not finished), and this planning step was explicitly barred from running
  the full suite, which the profile describes as sharded and slow. Suite counts and wall time
  are therefore **unknown**, and the loop must establish them before its first cycle:
  `/speckit.tdd.run` Phase 0 treats a non-green suite as an escape hatch, so a red baseline
  found later would be indistinguishable from a regression introduced by this feature.
- commit: `3f2a19d8f` (the profile's `detected_at` is the same SHA, so the commands it records
  are current for this checkout)
- recorded: cycle 0, before any change
- test list: `specs/831-api-key-rotation/tdd/test-list.md` — 19 acceptance behaviors
  (A1–A19), 68 unit behaviors (U1–U68, 2 already covered by existing tests), 4
  characterization baselines (C1–C4)
- tests already in place at baseline: `applyCredential`'s identity case
  (`credentials.test.ts`) and the OAuth credential provider case (`catalog.test.ts`).
  Everything else on the list is new: `grep` over `*.test.ts` finds no existing test for
  `apiKeys`, `activeApiKeyId`, `rotateKeys`, or a proxy cascade.

## Cycle 1 — U39 `rotate_keys` ⇄ `rotateKeys`

- test: `packages/agent-core-v2/test/llm-adapter/provider/providerService.test.ts::providers TOML transforms > carries rotate_keys through the transform and the provider schema`
- red: `Tests 1 failed | 8 skipped (9)` —
  `AssertionError: expected { type: 'openai' } to deeply equal { type: 'openai', rotateKeys: true }`;
  the schema dropped the field because `ProviderConfigSchema` had no `rotateKeys`.
- green: added `rotateKeys: z.boolean().optional()` to `ProviderConfigSchema` and
  `rotateKeys?: boolean` to `ProviderConfig` — `Tests 9 passed (9)`.

## Cycle 2 — U40/U41/U42 per-key `proxy_url` transform

- tests: `providerService.test.ts::providers TOML transforms > round-trips a key entry's proxy_url and preserves unknown key fields`
  and `> treats an empty proxy_url as absent on read and on write`.
- red: `Tests 2 failed | 8 skipped (10)` — the key entry came back as
  `{ key: 'sk-alpha', name: 'work', proxy_url: 'http://127.0.0.1:8081', quota_tier: 'gold' }`
  instead of the camelCase `proxyUrl` form (no per-entry transform), and an empty `proxy_url`
  round-tripped as `''`.
- green: added `apiKeysFromToml` / `apiKeysToToml` and wired them into
  `providerEntryFromToml` / `providerEntryToToml`, plus `proxyUrl` in the `apiKeys` entry schema —
  `Tests 10 passed (10)`.

## Cycle 3 — U29/U30/U31 `ProviderService.setActiveApiKey`

- tests: `providerService.test.ts::ProviderService > setActiveApiKey advances the cursor only after
  the persist chain ran`, `> setActiveApiKey leaves every other field and every other provider
  untouched`, `> setActiveApiKey keeps the advanced key in memory when a persist listener fails`.
- red: `Tests 3 failed | 11 passed (14)` — `TypeError: service.setActiveApiKey is not a function`
  on all three.
- green: added `setActiveApiKey` to `IProviderService` and implemented it in `ProviderService` as a
  read-modify-write through the existing `set()` — `Tests 14 passed (14)`.
- **Deviation, recorded honestly.** U31 says "a failed persist rejects the returned promise". It
  cannot: `AsyncEmitter.fireAsync` (`src/_base/event.ts:154-183`) awaits listener `waitUntil`
  promises with `Promise.allSettled` and routes rejections to `onUnexpectedError`, so a failing
  persist listener is observable only as an `[unexpected] Error` line on stderr (visible in the run
  output above) — never as a rejection of `set()`/`setActiveApiKey()`. Making it reject would mean
  changing `AsyncEmitter`'s delivery semantics for every event in the engine, which is outside this
  chunk. The test therefore pins the half of the invariant that is real and user-visible: the
  in-memory entry keeps the advanced active key, and the failure does not reject out of the write
  path.

## Cycle 4 — U43 node-sdk config mirror

- test: `packages/node-sdk/test/config.test.ts::SDK config TOML > carries provider rotate_keys and a
  key proxy_url through a read/write cycle`.
- red: `Tests 1 failed | 2 skipped (3)` — the parsed provider came back without `rotateKeys` and
  with `apiKeys.key1` stripped of `proxyUrl` (schema + no per-entry transform).
- green: `rotateKeys` + `ProviderApiKeySchema.proxyUrl` in `schema.ts`, per-entry
  `transformApiKeys` / `apiKeysToToml` in `toml.ts` — `Tests 3 passed (3)`.

## Cycle 5 — U44 klient contract mirror

- test: `packages/klient/test/contract.test.ts::provider config contract validation > keeps
  rotateKeys and a key entry proxyUrl through a client round-trip`.
- red: `Tests 1 failed | 10 skipped (11)` — the contract schema stripped both fields, so a client
  get-modify-set cycle would have dropped them.
- green: `providerApiKeySchema.proxyUrl` + `providerConfigSchema.rotateKeys` — `Tests 11 passed (11)`.
  The compile-time pairing is additionally pinned by `test/contract-parity.ts`
  (`AssertWire<typeof providerConfigSchema, ProviderConfig>`).

## Cycle 6 — U32/U33/U34 `applyCredential` proxy cascade

- test: `packages/agent-core-v2/src/human/test/credentials/credentials.test.ts > applyCredential`
  (override / keep / no proxy at all).
- red: `Tests 1 failed | 17 passed (18)` — `expected 'http://127.0.0.1:8080' to be
  'http://127.0.0.1:8081'`; the credential's proxy was ignored.
- green: `LlmCredential.proxyUrl` and `proxyUrl: credential.proxyUrl ?? model.proxyUrl` in
  `applyCredential` — `Tests 18 passed (18)`.

## Cycle 7 — U1..U13 `keyRotationRecovery` strategy

- test: `packages/agent-core-v2/src/human/test/credentials/keyRotationRecovery.test.ts` (new file,
  13 tests: qualification, cycle bound, proposal payload).
- red: `Tests no tests` — `Cannot find module '#/credentials/keyRotationRecovery'`; the strategy and
  the widened `LlmRecoveryContext` (`attempt` / `maxAttempts`) did not exist.
- green: new `src/human/credentials/keyRotationRecovery.ts`, `LlmRecoveryContext` gains
  `attempt`/`maxAttempts`, `LlmRecoveryRecord`/`LlmRecoveryProposal` gain `detail`,
  `beforeNextAttempt` may return a promise — `Tests 13 passed (13)`.

## Cycle 8 — U14..U28 keyed credential provider + rotation controller

- test: `packages/agent-core-v2/test/llm-adapter/provider/apiKeyRotation.test.ts` (new file, 16 tests:
  live resolution, rotation surface gates, plan order/wrap/cursor repair, rotate outcomes and
  serialization).
- red: `Tests no tests` — `Cannot find module '#/llm-adapter/provider/apiKeyRotation'`.
- green: new `src/llm-adapter/provider/apiKeyRotation.ts` and `ProviderService.setActiveApiKey` —
  `Tests 16 passed (16)`.
- **Interpretation recorded.** The contract's `rotate(expectedKeyId)` is implemented as "advance to
  the key the caller planned, unless a fresh plan differs" rather than "advance if the active id still
  equals expectedKeyId": the strategy only ever knows the *target* key, never the key that was active
  when it planned. The observable outcomes (`rotated` / `already-advanced` / `unavailable`) and the
  exactly-once advance are identical, and U26/U28 pass as written.

## Cycle 9 — U36/U37 catalog wiring

- test: `packages/agent-core-v2/test/llm-adapter/model/catalog.test.ts` — "follows the active key for a
  provider configured with apiKeys" and "exposes no rotation controller for an oauth-backed model".
- red (first attempt) was **for the wrong reason**: the assertion used `.resolves` while the keyed
  `resolve()` is synchronous, so the failure said nothing about the catalog. Test corrected, then the
  red was re-proven by temporarily reverting the catalog change: `expected { apiKey: 'sk-alpha' } to
  deeply equal { apiKey: 'sk-beta', proxyUrl: 'http://127.0.0.1:8081' }` — the static provider kept
  serving the old key after the cursor moved.
- green: `buildCredentialProvider` builds the keyed provider when the provider config carries
  `apiKeys` — `Tests 51 passed (51)`.

## Cycle 10 — U45/U46/U47/U48/U50 turn machine

- test: `packages/agent-core-v2/src/human/test/agent/turn.test.ts > turn machine api key rotation`
  (5 new tests).
- red: `Tests 3 failed | 2 passed | 19 skipped (24)` —
  `expected "vi.fn()" to be called 1 times, but got 0 times` (no rotation on an exhausted 429),
  `expected [ [ undefined, undefined ], …(2) ] to deeply equal [ [ 1, 3 ], [ 2, 3 ], [ 3, 3 ] ]`
  (the context carried neither `attempt` nor `maxAttempts`), and
  `expected [ false, false, false ] to deeply equal [ false, false, false, true ]` (a promise
  returned by `beforeNextAttempt` was never awaited, so no retry happened after the switch).
- green: the recovery context is filled from `context.attempt` / `resolveMaxAttempts(retry)`, and an
  accepted proposal now transitions to a new `applyingRecovery` state whose `applyRecoveryActor`
  awaits `beforeNextAttempt` before re-entering `thinking` — `Tests 24 passed (24)`.
- **Regression caught and fixed inside the cycle.** The first implementation cleared
  `pendingRecovery` in the same `assign` that the `sendToParent` params read it from, so the
  transition threw and *every* recovery path silently stopped retrying — the pre-existing credential
  and media-recovery tests went red (`expected [ 'tok-1' ] to deeply equal [ 'tok-1', 'tok-2' ]`).
  `pendingRecovery` is now cleared on `thinking`'s entry instead.

## Cycle 11 — engine composition + user-visible report (U51/U52/U53/U54)

- No test was added for this cycle, and that is a gap, not a pass. The changes are implemented:
  `keyRotationRecovery.propose(ctx) ?? credentialsRecovery.propose(ctx) ?? options.recovery?.propose(ctx)`
  in `engine.ts`, `rotation()` forwarded by the delegating credential view, `detail` threaded through
  `llm.recovering` (turn → actor event type → engine publish), and the `loopService` `recovering` case
  dispatching one `WarningIssued` with code `api-key-rotation`.
- Why untested: neither `machineEngineAttachBundle` nor `loopService`'s `recovering` case has an
  existing test in this repository, and the engine bundle needs the full
  `CreateMachineEngineOptions` surface (requester, tool executor, journal, store, …) to be driven at
  all. Building that harness is a real piece of work, not a test-line addition, and doing it poorly
  would have been worse than reporting it. U51–U54 therefore stay PENDING with the implementation in
  place.

## Cycle 12 — C2 baseline: key row rendering (characterization) and A9/A10/A11/A12 per-key proxy cascade on the request path

*(One number, two halves from different chunks; both are preserved verbatim below.)*

- test: `apps/kimi-code/test/tui/components/dialogs/provider-manager.test.ts::shows a key row with its
  name, a masked preview and the current marker, and no proxy text`.
- red: none, by construction — a characterization baseline runs against untouched code. `Tests 7
  passed (7)` on the first run (the file's 6 pre-existing tests plus this one).
- green: no code change. Note recorded while writing it: a key row currently renders **two** lines —
  the generic label line (`  ❯ work`) plus the indented key line (`    ❯ work  sk-alpha...alue ←
  current`) — because `renderRow` pushes the generic line and then the key-specific one. That is a
  pre-existing rendering quirk outside this feature's scope; the baseline asserts the content, not the
  line count, so it stays green either way.
- *(second half of this number, from the engine chunk)* test: `packages/agent-core-v2/test/llm-adapter/model/catalog.test.ts > per-key proxy cascade on the
  request path` (4 new tests). Each drives the real `ModelCatalog` + real `ProviderService` + the real
  keyed credential provider + the entry's real `ModelRequesterImpl`, with a stub protocol registry that
  mirrors `protocolAdapterRegistry.resolve` (`proxyUrl: model.proxyUrl`), and captures the
  `LlmRequestConfig` the transport would receive.
- red: **no red was observable on this cycle.** The behavior was already implemented when the cycle
  started (`credentialOf` returns the active key's `proxyUrl`; `applyCredential` merges it over the
  model), so all four went green on the first run: `Tests 4 passed | 51 skipped (55)`. A green first run
  is not evidence, so the tests were mutation-checked instead of trusted (below).
- green: no production change was needed — `Tests 4 passed | 51 skipped (55)`.
- **Mutation evidence, standing in for the missing red phase.** Deleting
  `proxyUrl: credential.proxyUrl ?? model.proxyUrl` from `applyCredential` turned "applies the active
  key's proxy over the provider proxy for a request" and "carries the active key proxy for every model
  bound to the provider" red (`Tests 2 failed | 2 passed | 51 skipped (55)`) while the provider-fallback
  and no-proxy tests correctly stayed green; replacing `applyCredential(resolved.model, credential)` with
  `resolved.model` at `src/llm-adapter/model/model-requester-impl.ts:178` turned the same two red. Both
  mutations were reverted immediately; `git diff` over the three touched sources confirms only the
  intended proxy lines remain.

## Cycle 13 — U55 the per-key proxy prompt cancels to `undefined`, and the per-attempt proxy on the turn machine's request actor

*(One number, two halves from different chunks; both are preserved verbatim below.)*

- test: `apps/kimi-code/test/tui/commands/provider.test.ts::promptKeyProxyUrl > resolves undefined
  when the user cancels`.
- red: `Tests 1 failed | 7 skipped (8)` — `TypeError: promptKeyProxyUrl is not a function`; the helper
  did not exist.
- green: new `promptKeyProxyUrl` + the `makeFlowHost` rig (harness snapshot, mount-order capture) —
  `Tests 1 passed | 7 skipped (8)`.
- *(second half of this number, from the engine chunk)* test: `packages/agent-core-v2/src/human/test/agent/turn.test.ts > turn machine per-key proxy` (2 new
  tests): two attempts of one step must carry two different key proxies (the credential is re-resolved
  per attempt), and a key that declares none keeps the model's provider proxy.
- red: **no red observed** — `src/human/llm/requester/actor.ts` already merged the credential onto the
  model per attempt, so both went green on the first run: `Tests 2 passed | 24 skipped (26)`.
- green: no production change was needed.
- **Mutation evidence.** Replacing the actor's `applyCredential(input.config.model, credential)` with a
  merge that carries only `apiKey` turned "applies the active key proxy to every attempt of the step" red
  (`Tests 1 failed | 1 passed | 24 skipped (26)`); reverted. The first mutation attempted for this cycle
  was invalid evidence and is recorded as such: it substituted the credential object itself for the
  model, and because the credential carries `proxyUrl` the key-proxy test stayed green — the mutation was
  rewritten to leave the model untouched.

## Cycle 14 — U56 an empty answer is accepted, not treated as a cancel

- test: `… > accepts an empty answer as "no proxy of my own"` (3 s timeout, because the failure mode
  is a promise that never settles).
- red: `Tests 1 failed | 8 skipped (9)` — `Error: Test timed out in 3000ms`; `ApiKeyInputDialogComponent`
  rejected the empty submit (`emptyHinted`) and never called back, so no answer could be accepted.
- green: an opt-in `allowEmpty` on the dialog (empty submit reports `{ kind: 'ok', value: '' }`) and
  an empty answer mapped to `{}` in the helper — `Tests 2 passed | 7 skipped (9)`.

## Cycle 15 — U57 a value with surrounding whitespace is trimmed

- test: `… > resolves a value with surrounding whitespace trimmed`.
- red: none — green on the first run (`Tests 1 passed | 10 skipped (11)`): the input dialog already
  trims on submit (`api-key-input-dialog.ts:151`), so the behavior existed at the layer below. Kept as
  a pin at the helper boundary rather than deleted, because the tri-state contract is stated there.
- green: no code change.

## Cycle 16 — U58 an invalid proxy address re-prompts instead of resolving

- test: `… > re-prompts on an invalid proxy address instead of resolving it` (unparsable value, then a
  wrong-scheme value, then a valid one).
- red: `Tests 1 failed (1)` — `AssertionError: expected 1 to be greater than 1` at `nextMount(1)`: the
  first answer resolved straight through as the result and no second dialog was ever mounted.
- green: `isProxyUrl` (absolute URL with `http:`/`https:`/`socks*:` protocol and a host) plus a
  re-prompt loop that re-mounts the dialog with the reason as its subtitle — `Tests 4 passed | 7
  skipped (11)`.

## Cycle 17 — U59 the add-key flow asks name, secret, then one proxy question

- test: `test/tui/commands/provider.test.ts::handleProviderCommand key flows > adds a key through
  name, secret, then one optional proxy question`.
- red: `Tests 1 failed | 11 skipped (12)` — `AssertionError: expected '───…' to contain 'proxy URL'`:
  the third mount was the reopened provider manager, not a proxy question.
- green: `handleProviderKeyAdd` asks `promptKeyProxyUrl(host, \`${providerId}/${name}\`)` after the
  secret, and cancelling there abandons the add — `Tests 1 passed | 11 skipped (12)`.

## Cycle 18 — U60 / U62 empty answer stores nothing, cancel writes nothing

- tests: `… > stores no per-key proxy when the proxy answer is empty`, `… > abandons the flow and
  writes nothing when the proxy prompt is cancelled`.
- red: none — both green on the first run (`Tests 1 passed | 13 skipped (14)` and `Tests 1 passed | 14
  skipped (15)`): the step that added the question did not use its answer, and its
  `keyProxy === undefined` branch was already the abandon path. Recorded as an honest gap in the
  red-first sequence, not as a fabricated red.
- green: no code change for these two; the next cycle's change is what gives the answer an effect.

## Cycle 19 — U61 a supplied proxy is persisted with the key

- test: `… > persists a supplied proxy with the key through the existing write path`.
- red: `Tests 1 failed | 13 skipped (14)` — `AssertionError: expected { key: 'sk-alpha-secret-value',
  name: 'work' } to deeply equal { key…, name…, proxyUrl: 'http://127.0.0.1:8081' }`: the answer was
  asked for and then dropped.
- green: the entry is stored as `{ key, name, proxyUrl: keyProxy.proxyUrl }` (passing `undefined`
  rather than a conditional spread, which the file's lint and the repo rule both require) — the
  assertion also pins that `activeApiKeyId` is the new first key and that `setConfig` was not used on
  an atomic-capable harness — `Tests 3 passed | 11 skipped (14)`.

## Cycle 20 — U63 `R` flips only `rotate_keys`

- test: `… > flips only rotate_keys from the R key, leaving the keys and their proxies alone`.
- red: `Tests 1 failed | 15 skipped (16)` — `AssertionError: expected "vi.fn()" to be called 1 times,
  but got 0 times`: nothing was written at all, the key was unhandled.
- green: `ProviderManagerOptions.onToggleRotation` + the `R` branch in `handleInput` +
  `handleProviderKeyRotationToggle` (read-modify-write through `replaceConfigSections`, then
  `refreshConfigAfterLogin`, then the status line `Key rotation enabled for acme (2 keys)`) —
  `Tests 1 passed | 15 skipped (16)`.

## Cycle 21 — U64 `R` writes nothing on a single-key provider

- test: `… > writes nothing when R is pressed on a provider with a single key`.
- red: `Tests 1 failed | 16 skipped (17)` — `AssertionError: expected "vi.fn()" to be called at least
  once`: with no guard the toggle flipped the flag and reported success on a provider where rotation
  can have no effect (FR-013).
- green: the `keyCount < 2` guard in `handleProviderKeyRotationToggle`, which reports
  `Key rotation needs at least two API keys for <id>; only 1 configured.` and returns before any write
  — whole file `Tests 17 passed (17)`.

## Cycle 22 — U68 the source row shows the rotation state and the `R` hint

- test: `test/tui/components/dialogs/provider-manager.test.ts::shows the rotation state and the R hint
  for a provider with several keys`.
- red: `Tests 1 failed (1)` — `AssertionError: expected '───…' to contain 'rotate keys: off'`; no state
  line and no `R` token in the hint.
- green: `rotateKeys` on `SourceRow` (filled from the provider entry, carried through the custom-registry
  merge), the `rotate keys: on|off` line rendered only for providers with two or more keys (`success` /
  `textDim`), and `R rotate keys` inserted into the header hint — `Tests 8 passed (8)`.

## Cycle 23 — U65 a key row shows its own proxy's host

- test: `… > shows a key's own proxy host on its row`.
- red: `Tests 1 failed (1)` — `AssertionError: expected '───…' to contain 'proxy:'`; a key with a
  `proxyUrl` rendered nothing about it.
- green: `proxyUrl` on `KeyRow` plus a muted `      proxy: <value>` sub-line — deliberately rendered
  raw at this step, so that the leak the next cycle pins is real rather than assumed — `Tests 9 passed
  (9)`.

## Cycle 24 — U66 the row never renders proxy userinfo or the key secret

- test: `… > never renders a key's proxy userinfo or the key secret` (proxy URL carries
  `proxy-user:proxy-pass@`).
- red: `Tests 1 failed (1)` — `AssertionError: expected '───…' not to contain 'proxy-user'`; the raw
  URL was printed verbatim, credentials included.
- green: `proxyHost(url)` — the parsed host, with a defensive scheme/userinfo strip for values the URL
  parser rejects, so nothing a hand-edited config can hold reaches the screen — `Tests 10 passed (10)`.

## Cycle 25 — U67 no proxy text for a key without a proxy of its own

- test: `… > shows no proxy text for a key without a proxy of its own` (the provider itself has a
  `proxyUrl`, which must not be presented as the key's own).
- red: none — green on the first run (`Tests 2 passed | 9 skipped (11)`): the line is rendered only
  when the entry declares one. It pins the cascade reading of FR-009/FR-010 on the dialog side.
- green: no code change.

## Verification runs for this chunk

- `pnpm vitest run apps/kimi-code/test/tui/commands/provider.test.ts` → `Tests 17 passed (17)`.
- `pnpm vitest run apps/kimi-code/test/tui/components/dialogs/provider-manager.test.ts` → `Tests 10
  passed (10)`.
- `pnpm vitest run apps/kimi-code/test/tui` → `Test Files 2 failed | 168 passed (170)`, `Tests 5 failed
  | 2908 passed (2913)`. Both failing files are pre-existing and unrelated to this chunk:
  `kimi-tui-message-flow.test.ts` fails on a domain expectation (`https://www.kimi.com/code` vs the
  app's `https://www.kimi.ai/code`) and reproduces standalone, and `editor-keyboard-image-paste.test.ts`
  passes standalone (`Tests 16 passed (16)`) but times out under full-suite CPU contention; neither
  file imports a module this chunk touched.
- `pnpm --filter @moonshot-ai/kimi-code exec tsc -p tsconfig.json --noEmit` → clean.
- `oxlint` (plain and `--type-aware`) over the six touched files → 0 errors; the one type-aware warning
  (`no-unnecessary-type-assertion` on `cfg as ProviderConfig`) is present at `HEAD` on an untouched line.

## FR-018 coverage record (sub-agents, swarm items, fallback tiers)

- **Covered**: the fallback/substitute tier, by cycle 12's "carries the active key proxy for every model
  bound to the provider" — a *different alias* of the same provider (its own catalog entry, its own
  `ModelRequesterImpl`, its own credential-provider instance) carries the same active key's proxy, and
  carries the newly rotated-to key's proxy after `setActiveApiKey`. Every agent-issued request resolves
  its alias through this catalog (`AgentLLMRequesterService.resolveRequest` → `modelCatalog.getRequester`
  → `ModelRequesterImpl.runRequest`), so the key binding is per provider and not per entry.
- **Not covered end-to-end, and why**: sub-agent and swarm batch items. No existing test file drives
  either through the real catalog requester — `test/session/subagent/spawn.test.ts` and
  `test/features/swarm/swarm.test.ts` stub `IModelCatalog` / the spawn machinery, so the applied proxy is
  not observable there, and the harness's scripted requester records only the prompt snapshot
  (`normalizeGenerateInput`), not the model. The mechanism they share with the tested paths is the request
  path itself, which cycle 12's mutation proves to be the single application site.


## Cycle 26 — FR-007 the rotation is consulted ahead of the caller fallback chain (U51, A6, A8)

- test: `packages/agent-core-v2/test/agent/loop/machineEngineRecovery.test.ts` (new file, 2 tests). Both
  drive the real `machineEngineAttachBundle` composition: a keyed credential provider whose `rotation()`
  reports `keyCount`, a stepped requester that answers 429 until the rotation lands, and a caller
  `recovery` whose fallback chain proposes `substitute_model` once the step's attempts are exhausted.
- test 1 asserts the applied recovery is `rotate:key2` and the observed `llm.recovering` strategies are
  exactly `['api_key_rotation']` with `action === 'key2'` — the fallback never applies while a key is
  still available (A6). test 2 asserts the applied recoveries are `['rotate:key2', 'fallback']` and the
  strategies `['api_key_rotation', 'substitute_model']` — the handoff happens only once every key of the
  step has been tried (A8).
- red: **no red of the production path was ever observed.** The first runs failed for test-harness
  reasons only, with the implementation untouched: `Tests 1 failed (1)` —
  `TypeError: Cannot read properties of undefined (reading 'getSnapshot')` (a snapshot read before the
  actor had started) — and `Tests 2 failed (2)` — `expected [ 'fallback', 'fallback', 'fallback' ] to
  deeply equal [ 'rotate:key2' ]` plus `expected [ 'rotate:key2', 'fallback', …(592) ] to deeply equal
  [ 'rotate:key2', 'fallback' ]`, both from a fallback stub that re-proposed on every attempt instead of
  yielding after its first application. The stub gained a one-shot guard, and the first valid run was
  green: **`Tests 2 passed (2)`**.
- green: no production change was needed — the composition under test is cycle 11's
  `keyRotationRecovery.propose(ctx) ?? credentialsRecovery.propose(ctx) ?? options.recovery?.propose(ctx)`.
  Because the green came first, the coverage rests on cycle 27's mutants rather than on a red phase.

## Cycle 27 — relay of the deliberate-mutant checks for the engine composition (U51, A6, A8)

- No red of the production path was observable for cycle 26's tests (the behavior shipped in cycle 11),
  so two deliberate mutants were relayed against them. Each was applied alone to
  `src/agent/loop/machine/engine.ts`, observed, and reverted; the file verifies byte-identical to the
  pre-mutation backup afterwards.
- mutant A — the caller's fallback chain consulted ahead of the rotation strategy:
  `AssertionError: expected [ 'fallback' ] to deeply equal [ 'rotate:key2' ]` on test 1 and
  `expected [ 'fallback', 'rotate:key2' ] to deeply equal [ 'rotate:key2', 'fallback' ]` on test 2 —
  **`Tests 2 failed (2)`**. Killed.
- mutant B — the tail handoff to `options.recovery` dropped from the chain:
  `AssertionError: expected [ 'rotate:key2' ] to deeply equal [ 'rotate:key2', 'fallback' ]` on test 2
  only — **`Tests 1 failed | 1 passed (2)`**. Killed.
- Together the two kills pin both halves of FR-007: the rotation wins the head of the chain (mutant A),
  and the chain still reaches the caller once the cycle is exhausted (mutant B).

## Cycle 28 — FR-014 the rotation notice through the real harness (U53/U54, A17, A18)

- test: `packages/agent-core-v2/test/agent/loop/loop.test.ts > Agent loop api key rotation notice >
  reports the provider and the new key without leaking the key value`. It drives the real agent loop
  through the harness with a provider configured for two keys and `rotateKeys: true`, exhausts the first
  key's attempt budget on 429s, then subscribes to `WarningIssued`: exactly one warning carries the code
  `api-key-rotation`, names the provider (`test-provider`), the new key's name (`personal`) and its id
  (`k2`), and contains none of the three key values the fixture configured.
- red: `Tests 1 failed | 58 skipped (59)` — `AssertionError: expected [] to have a length of 1 but got
  +0`; no warning of any kind was emitted. The red was **for the wrong reason** and is recorded as such:
  the provider record the test configured never reached the catalog (root cause in cycle 29), so no
  rotation ran and the assertion said nothing about the notice path. An intermediate diagnostic run
  failed earlier with `ReferenceError: IModelCatalog is not defined` (`Tests 1 failed | 58 skipped (59)`)
  — a test-side mistake, not evidence either.
- green: none in this cycle. The case became green only after the harness fix, as `Tests 1 passed | 58
  skipped (59)` (cycle 29).

## Cycle 29 — harness defect fixed: the configured provider record is merged, not replaced

- Root cause of cycle 28's wrong-reason red: the agent test harness
  (`packages/agent-core-v2/test/harness/agent.ts`) built the `test-provider` entry as a *replacement* of
  whatever the caller had configured under that id, so the `apiKeys` / `activeApiKeyId` / `rotateKeys`
  record a test supplied was overwritten by the mock provider record (`{ type, apiKey, baseUrl, model }`)
  before the catalog ever read it — the harness could not offer a rotatable key at all.
- fix: the entry is now merged over the configured record —
  `[providerName]: { ...config.providers[providerName], ...providerConfigForAlias(provider) }`.
- observed after the fix: the notice case **`Tests 1 passed | 58 skipped (59)`**; scoped re-runs
  `test/agent/loop` → **`Tests 75 passed (75)`** and `src/human/test/agent` → **`Tests 60 passed (60)`**,
  so the merge repaired the harness without moving the turn-machine suite.
