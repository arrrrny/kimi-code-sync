---
feature: 831-api-key-rotation
loop: outside-in
profile: .specify/memory/tdd-profile.md
spec_criteria: 19
planned_at: 3f2a19d8f
updated_at: 3f2a19d8f
suite_baseline: unknown
---

# Test List: Provider API Key Rotation with Per-Key Proxy

Behavior ids: `A1`–`A19` are the outer loop, one per acceptance scenario in `spec.md`;
`U1`–`U68` are the inner loop, grouped by the component `plan.md` gives them; `C1`–`C4`
are characterization baselines that capture what the code does today and must be green
against untouched code before the task that changes that component starts.

Every trace resolves to a user-story scenario (`US<n>.<m>`, numbered as in the story's
`Acceptance Scenarios` list), a functional requirement (`FR-0xx`), a success criterion
(`SC-0xx`), or one of the invariants recorded at the bottom of this file.

## Outer loop: acceptance behaviors

The profile records no verified end-to-end runner (`acceptance: null`; the `apps/kimi-code`
e2e command needs a full `build:packages` first and was not executed during profiling). The
outer loop therefore runs at the highest level this repository tests deterministically: the
agent machine driven through the real harness for the rotation stories, the provider-manager
slash command for the add-key story, and the agent loop for the notice story. That is an
integration level, not an end-to-end one, and the quickstart scenarios (T041) are what cover
the real CLI.

| id  | behavior                                                                                                             | traces        | kind    | state   | test |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------------- | ------- | ------- | ---- |
| A1  | A provider with three keys and rotation on, whose first key exhausts its retry budget on 429s, retries on the second key inside the same turn and the turn is not failed | US1.1, FR-002, FR-006, SC-001 | example | DONE | `packages/agent-core-v2/src/human/test/agent/turn.test.ts::gives the next key a full attempt budget after an applied rotation`; `packages/agent-core-v2/test/agent/loop/machineEngineRecovery.test.ts::takes the rotation proposal for an exhausted key even when the fallback chain proposes too` |
| A2  | A refused (403) active key is retried on the next key without first consuming that key's retry budget                 | US1.2, FR-003, SC-002 | example | PENDING |      |
| A3  | With the last key active and exhausted, the retry uses the first key again                                             | US1.3, FR-004 | example | DONE | `packages/agent-core-v2/test/llm-adapter/provider/apiKeyRotation.test.ts::wraps to the first key when the active key is the last one` |
| A4  | After a rotation the provider's active key in the configuration file is the key that served the successful request      | US1.4, FR-005, SC-003 | example | DONE | `packages/agent-core-v2/test/llm-adapter/provider/apiKeyRotation.test.ts::advances the active key after the persist chain ran and reports the new key`; `packages/agent-core-v2/test/llm-adapter/provider/providerService.test.ts::setActiveApiKey advances the cursor only after the persist chain ran` |
| A5  | With rotation off (the default), a rate-limited or refused key produces today's outcome: no rotation, no config write  | US1.5, FR-001, SC-004 | example | DONE | `packages/agent-core-v2/test/llm-adapter/provider/apiKeyRotation.test.ts::exposes no controller when rotateKeys is absent`; `packages/agent-core-v2/test/llm-adapter/provider/apiKeyRotation.test.ts::exposes no controller when rotateKeys is false`; `packages/agent-core-v2/src/human/test/credentials/keyRotationRecovery.test.ts::declines when the credential provider exposes no rotation controller` |
| A6  | With a substitute model configured, a rate-limited key rotates to the next key on the current model before any substitute model is considered | US2.1, FR-007 | example | DONE | `packages/agent-core-v2/test/agent/loop/machineEngineRecovery.test.ts::takes the rotation proposal for an exhausted key even when the fallback chain proposes too` |
| A7  | With fallback models configured, a refused (403) key rotates to the next key before the fallback chain is entered       | US2.2, FR-007 | example | PENDING |      |
| A8  | After every key has been tried once in the step and all failed, rotation stops and the existing substitute/fallback behavior takes over | US2.3, FR-008, SC-008 | example | DONE | `packages/agent-core-v2/test/agent/loop/machineEngineRecovery.test.ts::hands control to the caller fallback chain once every key of the step has been tried` |
| A9  | With a provider proxy and a key proxy both configured, a request made with that key leaves through the key's proxy      | US3.1, FR-010, SC-005 | example | DONE | `packages/agent-core-v2/test/llm-adapter/model/catalog.test.ts::applies the active key's proxy over the provider proxy for a request` |
| A10 | With a provider proxy configured and the active key declaring none, the request leaves through the provider's proxy     | US3.2, FR-010, SC-005 | example | DONE | `packages/agent-core-v2/test/llm-adapter/model/catalog.test.ts::falls back to the provider proxy when the active key declares none` |
| A11 | With neither the key nor the provider declaring a proxy, the request is made without a proxy                           | US3.3, FR-010 | example | DONE | `packages/agent-core-v2/test/llm-adapter/model/catalog.test.ts::issues the request without a proxy when neither the provider nor the key declares one` |
| A12 | After a rotation to a key that declares its own proxy, the retry leaves through that key's proxy                        | US3.4, FR-010, FR-018, SC-005 | example | DONE | `packages/agent-core-v2/test/llm-adapter/model/catalog.test.ts::carries the active key proxy for every model bound to the provider`; `packages/agent-core-v2/src/human/test/agent/turn.test.ts::applies the active key proxy to every attempt of the step` |
| A13 | Adding a key asks for the key name and secret and then one optional proxy value that may be left empty                  | US4.1, FR-011, SC-006 | example | DONE | `apps/kimi-code/test/tui/commands/provider.test.ts::adds a key through name, secret, then one optional proxy question`; `apps/kimi-code/test/tui/commands/provider.test.ts::accepts an empty answer as "no proxy of my own"` |
| A14 | A key added with an empty proxy answer has no proxy of its own and inherits the provider's proxy                         | US4.2, FR-011, FR-010 | example | DONE | `apps/kimi-code/test/tui/commands/provider.test.ts::stores no per-key proxy when the proxy answer is empty`; `packages/agent-core-v2/src/human/test/agent/turn.test.ts::keeps the provider proxy for a key that declares none` |
| A15 | A key added with a proxy value is persisted with that value and the value is still there after a restart                  | US4.3, FR-012 | example | DONE | `apps/kimi-code/test/tui/commands/provider.test.ts::persists a supplied proxy with the key through the existing write path` |
| A16 | A key that has its own proxy shows that proxy in the provider manager while the secret stays hidden                      | US4.4, FR-015 | example | DONE | `apps/kimi-code/test/tui/components/dialogs/provider-manager.test.ts::shows a key's own proxy host on its row`; `apps/kimi-code/test/tui/components/dialogs/provider-manager.test.ts::never renders a key's proxy userinfo or the key secret` |
| A17 | A rotation reports the provider and the newly active key by name or identifier                                           | US5.1, FR-014 | example | DONE | `packages/agent-core-v2/test/agent/loop/loop.test.ts::reports the provider and the new key without leaking the key value`; `packages/agent-core-v2/src/human/test/credentials/keyRotationRecovery.test.ts::names the provider and the target key without the key value` |
| A18 | Nothing the rotation reports contains secret key material                                                                | US5.2, FR-015, SC-007 | example | DONE | `packages/agent-core-v2/test/agent/loop/loop.test.ts::reports the provider and the new key without leaking the key value`; `apps/kimi-code/test/tui/components/dialogs/provider-manager.test.ts::never renders a key's proxy userinfo or the key secret` |
| A19 | A rotation that cycled through every key without success tells the user that all configured keys were tried             | US5.3, FR-008, FR-014 | example | PENDING |      |

## Inner loop: unit behaviors

### `packages/agent-core-v2/src/human/credentials/keyRotationRecovery.ts` (new — pure strategy)

| id  | behavior                                                                                       | traces       | kind    | state   | test |
| --- | ---------------------------------------------------------------------------------------------- | ------------ | ------- | ------- | ---- |
| U1  | Proposes `api_key_rotation` targeting the next key on a 403 at attempt 1                        | FR-003       | example | DONE | `packages/agent-core-v2/src/human/test/credentials/keyRotationRecovery.test.ts::proposes on a 403 at the first attempt` |
| U2  | Proposes on a 403 at the last allowed attempt too (the refusal rule has no budget threshold)    | FR-003       | example | DONE | `packages/agent-core-v2/src/human/test/credentials/keyRotationRecovery.test.ts::proposes on a 403 at the last allowed attempt` |
| U3  | Declines a 429 at attempt `maxAttempts - 1` (one attempt of budget left)                        | FR-002       | example | DONE | `packages/agent-core-v2/src/human/test/credentials/keyRotationRecovery.test.ts::declines a 429 while one attempt of budget is left` |
| U4  | Proposes on a 429 at attempt `maxAttempts`                                                     | FR-002       | example | DONE | `packages/agent-core-v2/src/human/test/credentials/keyRotationRecovery.test.ts::proposes on a 429 once the attempt budget is exhausted` |
| U5  | Declines for a 401 (the OAuth refresh path owns it)                                            | FR-002, FR-003 | example | DONE | `packages/agent-core-v2/src/human/test/credentials/keyRotationRecovery.test.ts::declines for a 401` |
| U6  | Declines for a `quota_exhausted` failure (account-level, not key-level)                         | FR-002, FR-003 | example | DONE | `packages/agent-core-v2/src/human/test/credentials/keyRotationRecovery.test.ts::declines for a quota-exhausted failure` |
| U7  | Declines for a context-overflow failure (another strategy owns it)                              | FR-002, FR-003 | example | DONE | `packages/agent-core-v2/src/human/test/credentials/keyRotationRecovery.test.ts::declines for a context-overflow failure` |
| U8  | Declines for a transport failure (a network error says nothing about the key)                    | FR-002, FR-003 | example | DONE | `packages/agent-core-v2/src/human/test/credentials/keyRotationRecovery.test.ts::declines for a transport failure` |
| U9  | Declines when the credential provider exposes no `rotation()`                                   | FR-013       | example | DONE | `packages/agent-core-v2/src/human/test/credentials/keyRotationRecovery.test.ts::declines when the credential provider exposes no rotation controller` |
| U10 | Declines after `keyCount - 1` rotation records are already in `appliedRecoveries`               | FR-008       | example | DONE | `packages/agent-core-v2/src/human/test/credentials/keyRotationRecovery.test.ts::declines once keyCount - 1 rotations were applied to this step` |
| U11 | Still proposes while only `keyCount - 2` rotation records are in `appliedRecoveries`            | FR-008       | example | DONE | `packages/agent-core-v2/src/human/test/credentials/keyRotationRecovery.test.ts::still proposes while only keyCount - 2 rotations were applied to this step` |
| U12 | The proposal's `beforeNextAttempt` awaits the controller's `rotate()` for the planned key       | FR-005       | example | DONE | `packages/agent-core-v2/src/human/test/credentials/keyRotationRecovery.test.ts::awaits the controller rotate call for the planned key before the next attempt` |
| U13 | The proposal's `detail` names the provider and the target key id or name and never the key value | FR-014, FR-015 | example | DONE | `packages/agent-core-v2/src/human/test/credentials/keyRotationRecovery.test.ts::names the provider and the target key without the key value` |

### `packages/agent-core-v2/src/llm-adapter/provider/apiKeyRotation.ts` (new — keyed provider + controller)

| id  | behavior                                                                                                 | traces       | kind    | state   | test |
| --- | -------------------------------------------------------------------------------------------------------- | ------------ | ------- | ------- | ---- |
| U14 | `resolve()` reads the provider config on every call, so a key switched underneath is visible to the next resolve | FR-005       | example | DONE | `packages/agent-core-v2/test/llm-adapter/provider/apiKeyRotation.test.ts::re-reads the provider config on every resolve` |
| U15 | `resolve()` returns the active key's `proxyUrl`, and `undefined` when the key declares none               | FR-009, FR-010 | example | DONE | `packages/agent-core-v2/test/llm-adapter/provider/apiKeyRotation.test.ts::returns the active key proxyUrl and nothing when the key declares none` |
| U16 | With no `apiKeys` entries, `resolve()` returns the legacy provider `apiKey` value                         | FR-013       | example | DONE | `packages/agent-core-v2/test/llm-adapter/provider/apiKeyRotation.test.ts::falls back to the legacy apiKey when no key set is configured` |
| U17 | `rotation()` is `undefined` when `rotate_keys` is absent                                                  | FR-001       | example | DONE | `packages/agent-core-v2/test/llm-adapter/provider/apiKeyRotation.test.ts::exposes no controller when rotateKeys is absent` |
| U18 | `rotation()` is `undefined` when `rotateKeys` is `false`                                                  | FR-001       | example | DONE | `packages/agent-core-v2/test/llm-adapter/provider/apiKeyRotation.test.ts::exposes no controller when rotateKeys is false` |
| U19 | `rotation()` is present for two or more keys with `rotateKeys: true`                                      | FR-001       | example | DONE | `packages/agent-core-v2/test/llm-adapter/provider/apiKeyRotation.test.ts::exposes a controller for two or more keys with rotateKeys on` |
| U20 | `rotation()` is `undefined` for an oauth provider (`apiKey` and `oauth` never coexist)                     | FR-017       | example | DONE | `packages/agent-core-v2/test/llm-adapter/provider/apiKeyRotation.test.ts::exposes no controller for an oauth-backed provider` |
| U21 | `rotation()` is `undefined` for a `managed:*` provider id                                                 | FR-017       | example | DONE | `packages/agent-core-v2/test/llm-adapter/provider/apiKeyRotation.test.ts::exposes no controller for a managed provider id` |
| U22 | `plan()` returns the key after the active one in definition order                                         | FR-004       | example | DONE | `packages/agent-core-v2/test/llm-adapter/provider/apiKeyRotation.test.ts::plans the key after the active one in definition order` |
| U23 | `plan()` returns the first key when the active key is the last one                                         | FR-004       | example | DONE | `packages/agent-core-v2/test/llm-adapter/provider/apiKeyRotation.test.ts::wraps to the first key when the active key is the last one` |
| U24 | `plan()` returns the first key when `activeApiKeyId` names no entry (the cursor was cleared or the key deleted) | FR-004, INV-1 | example | DONE | `packages/agent-core-v2/test/llm-adapter/provider/apiKeyRotation.test.ts::plans the first key when the cursor names no entry` |
| U25 | `rotate(expected)` advances the active key, awaits persistence, and reports `rotated` with the new key      | FR-005       | example | DONE | `packages/agent-core-v2/test/llm-adapter/provider/apiKeyRotation.test.ts::advances the active key after the persist chain ran and reports the new key` |
| U26 | `rotate()` reports `already-advanced` when another rotation moved the active key first, without advancing twice | FR-016       | example | DONE | `packages/agent-core-v2/test/llm-adapter/provider/apiKeyRotation.test.ts::reports already-advanced without advancing twice` |
| U27 | `rotate()` reports `unavailable` when the provider or its key set disappeared between plan and apply        | FR-016       | example | DONE | `packages/agent-core-v2/test/llm-adapter/provider/apiKeyRotation.test.ts::reports unavailable when the provider disappeared before the apply` |
| U28 | Two concurrent `rotate()` calls for one provider serialize and advance the active key exactly once          | FR-016       | example | DONE | `packages/agent-core-v2/test/llm-adapter/provider/apiKeyRotation.test.ts::serializes concurrent rotations so the cursor advances exactly once` |

### `packages/agent-core-v2/src/llm-adapter/provider/provider-service.ts`

| id  | behavior                                                                                                 | traces | kind    | state   | test |
| --- | -------------------------------------------------------------------------------------------------------- | ------ | ------- | ------- | ---- |
| U29 | `setActiveApiKey` advances `activeApiKeyId` and resolves only after the persist chain has run              | FR-005 | example | DONE | `packages/agent-core-v2/test/llm-adapter/provider/providerService.test.ts::setActiveApiKey advances the cursor only after the persist chain ran` |
| U30 | `setActiveApiKey` leaves every other field of the provider entry and every other provider entry untouched   | FR-016 | example | DONE | `packages/agent-core-v2/test/llm-adapter/provider/providerService.test.ts::setActiveApiKey leaves every other field and every other provider untouched` |
| U31 | A failed persist rejects the returned promise while the in-memory entry keeps the advanced active key       | FR-005, FR-016 | example | DONE | `packages/agent-core-v2/test/llm-adapter/provider/providerService.test.ts::setActiveApiKey keeps the advanced key in memory when a persist listener fails` (the rejection half is unobservable — see cycle 3's recorded deviation) |

### `packages/agent-core-v2/src/human/credentials/credentials.ts`

| id  | behavior                                                                                                 | traces | kind    | state   | test |
| --- | -------------------------------------------------------------------------------------------------------- | ------ | ------- | ------- | ---- |
| U32 | `applyCredential` overrides the model's `proxyUrl` with the credential's `proxyUrl`                        | FR-010 | example | DONE | `packages/agent-core-v2/src/human/test/credentials/credentials.test.ts::overrides the model proxy with the credential proxy` |
| U33 | `applyCredential` keeps the model's `proxyUrl` when the credential carries none                            | FR-010 | example | DONE | `packages/agent-core-v2/src/human/test/credentials/credentials.test.ts::keeps the model proxy when the credential carries none` |
| U34 | `applyCredential` leaves the attempt with no proxy when neither the credential nor the model declares one  | FR-010 | example | DONE | `packages/agent-core-v2/src/human/test/credentials/credentials.test.ts::leaves the attempt without a proxy when neither declares one` |
| U35 | `applyCredential` returns the model unchanged for an undefined credential                                 | FR-010 | example | DONE    | `packages/agent-core-v2/src/human/test/credentials/credentials.test.ts::returns the model unchanged when the credential is undefined` |

### `packages/agent-core-v2/src/llm-adapter/model/catalog-service.ts`

| id  | behavior                                                                                                 | traces | kind             | state    | test |
| --- | -------------------------------------------------------------------------------------------------------- | ------ | ---------------- | -------- | ---- |
| U36 | A provider configured with `apiKeys` gets a credential provider whose `resolve()` follows the active key   | FR-009 | example          | DONE     | `packages/agent-core-v2/test/llm-adapter/model/catalog.test.ts::follows the active key for a provider configured with apiKeys` |
| C4  | Current behavior: a provider with only the legacy `apiKey` (or an env bag) keeps the static credential provider that returns that value | FR-013 | characterization | BASELINE |      |
| U37 | An oauth-backed provider exposes no rotation controller                                                   | FR-017 | example          | DONE     | `packages/agent-core-v2/test/llm-adapter/model/catalog.test.ts::exposes no rotation controller for an oauth-backed model` |
| U38 | An oauth-backed model keeps its recoverable (401-only) credential provider                                | FR-017 | example          | DONE     | `packages/agent-core-v2/test/llm-adapter/model/catalog.test.ts::builds recoverable OAuth credentials for oauth-backed models` |

### `packages/agent-core-v2/src/app/kosongConfig/configSection.ts`

| id  | behavior                                                                                                 | traces       | kind             | state    | test |
| --- | -------------------------------------------------------------------------------------------------------- | ------------ | ---------------- | -------- | ---- |
| U39 | `rotate_keys` inside a provider table loads as `rotateKeys` and writes back as `rotate_keys`               | FR-001       | example          | DONE     | `packages/agent-core-v2/test/llm-adapter/provider/providerService.test.ts::carries rotate_keys through the transform and the provider schema` |
| U40 | `proxy_url` inside a key table loads as `proxyUrl` and writes back as `proxy_url`                          | FR-009, FR-012 | example          | DONE     | `packages/agent-core-v2/test/llm-adapter/provider/providerService.test.ts::round-trips a key entry proxy_url and preserves unknown key fields` |
| U41 | Fields of a key entry this schema does not know survive a read-modify-write verbatim                      | INV-2        | example          | DONE     | `packages/agent-core-v2/test/llm-adapter/provider/providerService.test.ts::round-trips a key entry proxy_url and preserves unknown key fields` |
| U42 | A key entry's empty `proxy_url` is treated as absent and is never written back as an empty string          | FR-010       | example          | DONE     | `packages/agent-core-v2/test/llm-adapter/provider/providerService.test.ts::treats an empty key proxy_url as absent on read and on write` |
| C3  | Current behavior: a provider section with none of the new fields round-trips byte-identically through a read-modify-write | FR-001       | characterization | BASELINE |      |

### `packages/node-sdk/src/config/schema.ts` and `toml.ts`

| id  | behavior                                                                                                 | traces       | kind    | state   | test |
| --- | -------------------------------------------------------------------------------------------------------- | ------------ | ------- | ------- | ---- |
| U43 | The SDK config surface carries `rotate_keys` and a key entry's `proxy_url` through a client read/write cycle | FR-001, FR-009 | example | DONE | `packages/node-sdk/test/config.test.ts::carries provider rotate_keys and a key proxy_url through a read/write cycle` |

### `packages/klient/src/contract/global/providers.ts`

| id  | behavior                                                                                                 | traces       | kind     | state   | test |
| --- | -------------------------------------------------------------------------------------------------------- | ------------ | -------- | ------- | ---- |
| U44 | The client provider contract mirrors `rotateKeys` and `apiKeys[].proxyUrl`, asserted at compile time       | FR-001, FR-009 | contract | DONE | `packages/klient/test/contract.test.ts::keeps rotateKeys and a key entry proxyUrl through a client round-trip` |

### `packages/agent-core-v2/src/human/agent/turn.ts`

| id  | behavior                                                                                                 | traces | kind    | state   | test |
| --- | -------------------------------------------------------------------------------------------------------- | ------ | ------- | ------- | ---- |
| U45 | A 429 below the retry budget retries on the same key and appends no rotation record                        | FR-002 | example | DONE | `packages/agent-core-v2/src/human/test/agent/turn.test.ts::retries a rate-limited key on the same key while the attempt budget lasts` |
| U46 | An applied rotation resets the attempt counter, so the next key gets a full budget to itself               | FR-002 | example | DONE | `packages/agent-core-v2/src/human/test/agent/turn.test.ts::gives the next key a full attempt budget after an applied rotation` |
| U47 | The recovery context carries the real `attempt` and `maxAttempts` for the failing request                  | FR-002, FR-003 | example | DONE | `packages/agent-core-v2/src/human/test/agent/turn.test.ts::hands the recovery chain the real attempt and maxAttempts` |
| U48 | An accepted proposal is applied and awaited before the machine re-enters `thinking`                        | FR-005, FR-006 | example | DONE | `packages/agent-core-v2/src/human/test/agent/turn.test.ts::awaits an accepted proposal before the next request is built` |
| U49 | A later step of the same turn starts with a fresh rotation budget                                          | FR-008 | example | PENDING |      |
| U50 | With rotation enabled but a single key, the turn records no rotation and writes no config                  | FR-013 | example | DONE | `packages/agent-core-v2/src/human/test/agent/turn.test.ts::records no rotation when only one key is configured` |

### `packages/agent-core-v2/src/agent/loop/machine/engine.ts`

| id  | behavior                                                                                                 | traces | kind    | state   | test |
| --- | -------------------------------------------------------------------------------------------------------- | ------ | ------- | ------- | ---- |
| U51 | The composed recovery chain consults the rotation strategy before the credentials strategy                 | FR-007 | example | DONE | `packages/agent-core-v2/test/agent/loop/machineEngineRecovery.test.ts::takes the rotation proposal for an exhausted key even when the fallback chain proposes too` |
| U52 | `rotation()` reaches the machine through the delegating credential view                                    | FR-002, FR-003 | example | DONE | `packages/agent-core-v2/test/agent/loop/loop.test.ts::reports the provider and the new key without leaking the key value` |

### `packages/agent-core-v2/src/agent/loop/loopService.ts`

| id  | behavior                                                                                                 | traces | kind    | state   | test |
| --- | -------------------------------------------------------------------------------------------------------- | ------ | ------- | ------- | ---- |
| U53 | A completed rotation produces exactly one observable warning naming the provider and the new active key    | FR-014 | example | DONE | `packages/agent-core-v2/test/agent/loop/loop.test.ts::reports the provider and the new key without leaking the key value` |
| U54 | The warning carries no key material and no masked key value                                               | FR-015 | example | DONE | `packages/agent-core-v2/test/agent/loop/loop.test.ts::reports the provider and the new key without leaking the key value` |

### `apps/kimi-code/src/tui/commands/prompts.ts`

| id  | behavior                                                                                                 | traces | kind    | state   | test |
| --- | -------------------------------------------------------------------------------------------------------- | ------ | ------- | ------- | ---- |
| U55 | The per-key proxy prompt resolves `undefined` when the user cancels                                        | FR-011 | example | DONE | `apps/kimi-code/test/tui/commands/provider.test.ts::resolves undefined when the user cancels` |
| U56 | An empty answer is accepted and resolves as an empty value rather than as a cancel                          | FR-011 | example | DONE | `apps/kimi-code/test/tui/commands/provider.test.ts::accepts an empty answer as "no proxy of my own"` |
| U57 | A value with surrounding whitespace is resolved trimmed                                                      | FR-011 | example | DONE | `apps/kimi-code/test/tui/commands/provider.test.ts::resolves a value with surrounding whitespace trimmed` |
| U58 | An invalid proxy address is re-prompted and is never resolved as the answer                                 | FR-011 | example | DONE | `apps/kimi-code/test/tui/commands/provider.test.ts::re-prompts on an invalid proxy address instead of resolving it` |

### `apps/kimi-code/src/tui/commands/provider.ts`

| id  | behavior                                                                                                 | traces | kind             | state    | test |
| --- | -------------------------------------------------------------------------------------------------------- | ------ | ---------------- | -------- | ---- |
| C1  | Current behavior: adding a key asks for the name then the secret, stores `{ key, name }`, makes the first key active, and never asks for a proxy | FR-011 | characterization | BASELINE |      |
| U59 | The add-key flow asks name, then secret, then exactly one proxy question                                   | FR-011 | example          | DONE     | `apps/kimi-code/test/tui/commands/provider.test.ts::adds a key through name, secret, then one optional proxy question` |
| U60 | An empty proxy answer stores no per-key proxy on the entry                                                 | FR-011 | example          | DONE     | `apps/kimi-code/test/tui/commands/provider.test.ts::stores no per-key proxy when the proxy answer is empty` |
| U61 | A supplied proxy is persisted with the key through the existing write path                                 | FR-012 | example          | DONE     | `apps/kimi-code/test/tui/commands/provider.test.ts::persists a supplied proxy with the key through the existing write path` |
| U62 | Cancelling at the proxy prompt abandons the flow and writes nothing                                        | FR-011 | example          | DONE     | `apps/kimi-code/test/tui/commands/provider.test.ts::abandons the flow and writes nothing when the proxy prompt is cancelled` |
| U63 | The `R` toggle flips only `rotate_keys` and leaves the key set and the proxies untouched                   | FR-001 | example          | DONE     | `apps/kimi-code/test/tui/commands/provider.test.ts::flips only rotate_keys from the R key, leaving the keys and their proxies alone` |
| U64 | The `R` toggle writes nothing on a single-key provider                                                     | FR-013 | example          | DONE     | `apps/kimi-code/test/tui/commands/provider.test.ts::writes nothing when R is pressed on a provider with a single key` |

### `apps/kimi-code/src/tui/components/dialogs/provider-manager.ts`

| id  | behavior                                                                                                 | traces | kind             | state    | test |
| --- | -------------------------------------------------------------------------------------------------------- | ------ | ---------------- | -------- | ---- |
| C2  | Current behavior: a key row shows the key name, the masked preview and the `← current` marker on the active key; no proxy text appears | FR-015 | characterization | BASELINE |      |
| U65 | A key row shows the per-key proxy's host                                                                | FR-009 | example          | DONE     | `apps/kimi-code/test/tui/components/dialogs/provider-manager.test.ts::shows a key's own proxy host on its row` |
| U66 | A key row never renders the proxy's userinfo or the key secret                                           | FR-015 | example          | DONE     | `apps/kimi-code/test/tui/components/dialogs/provider-manager.test.ts::never renders a key's proxy userinfo or the key secret` |
| U67 | A key row for a key with no per-key proxy shows no proxy text                                            | FR-009 | example          | DONE     | `apps/kimi-code/test/tui/components/dialogs/provider-manager.test.ts::shows no proxy text for a key without a proxy of its own` |
| U68 | The source row shows the rotation state and the `R` hint                                                 | FR-001 | example          | DONE     | `apps/kimi-code/test/tui/components/dialogs/provider-manager.test.ts::shows the rotation state and the R hint for a provider with several keys` |

## Invariants and edge cases still to place

None. The invariants this list relies on are recorded below with their rationale.

## Recorded invariants

- **INV-1 (cursor validity).** `activeApiKeyId` either names an entry of `apiKeys` or is absent; an id that
  names nothing is treated as absent everywhere (resolution falls back to the first key). Rationale:
  `spec.md` Edge Cases, "Active key deleted while a turn is running"; the provider manager already repairs
  the cursor on delete (`apps/kimi-code/src/tui/commands/provider.ts:211-223`), and the engine side must
  agree with it.
- **INV-2 (file integrity across concurrent writers).** A write to one provider section preserves the
  entries and unknown fields of that section and of every other section. Rationale: FR-016 plus `spec.md`
  Edge Cases, "Several sessions use the same provider concurrently".

## Assumptions recorded while deriving this list

- **A19 is the one criterion `plan.md` says is only half-wired.** research.md's "Conflicts found" records
  that a 429/403 exhausting the cycle does not activate the fallback model today, so "the user is told that
  all configured keys were tried" is read literally as: the step fails and that failure reaches the session.
  If the intended reading is a dedicated "all keys tried" notice, that is a new requirement the plan does
  not implement, and the behavior will stay red until it does.
- **The cycle bound is per step, not per turn.** research.md (b) records the decision to count
  `appliedRecoveries`, which the machine resets when a step completes. U49 pins the per-step reading
  (a later step may rotate again); FR-008's own wording says "per turn".
- **U42's "empty is absent" applies to the file and to the prompt.** data-model.md puts proxy validation at
  the entry points rather than in the schema, so the schema stays permissive and the prompt is where an
  invalid value is rejected (U58).
- **Every per-key proxy value in a test fixture is a placeholder host** (`example.test`), never a real
  address, and every key value is a fixture string, never a secret.

## Out of scope

- Rotating a managed/OAuth provider: FR-017 excludes it, and its credentials come from the login flow.
- A global rotation flag (`KIMI_CODE_EXPERIMENTAL_*`): research.md's "Setting or experimental flag" record
  makes the per-provider setting the only gate.
- Making 429/403 activate the fallback model: research.md's conflicts section records this as an existing
  semantic outside this feature.
- Clearing a provider-level proxy from the provider manager (an empty answer is still a cancel there) and
  editing an existing key's proxy: FR-011 covers the add-key flow only.
- `free_models_only`'s snake_case/camelCase trap: pre-existing, recorded in research.md, not touched here.
- Provider-manager key deletion and cursor repair: already implemented and covered where it lives.
- The end-to-end CLI harness (the stub provider and the throwaway config home) belongs to quickstart.md /
  T041, which is not a list behavior.
- Property-based, approval, and mutation runs: the profile records no such tool (`fast-check` and
  `@stryker-mutator` are absent from the lockfile). Boundary values are sampled explicitly instead.

## Verification commands

Copied verbatim from `.specify/memory/tdd-profile.md` at planning time. `pnpm` is not on the default
non-interactive `PATH` — prepend `export PATH="/usr/local/lib/node_modules/corepack/shims:$PATH"` first.

- Single test: `pnpm vitest run {file} -t "{name}"`
- Whole file: `pnpm vitest run {file}`
- Full suite: `pnpm test`
- Package-scoped run: `pnpm vitest run packages/agent-core-v2`
- Coverage: `pnpm vitest run {file} --coverage`
- Watch: `pnpm test:watch`
- Mutation: not available (no mutation tool installed)
- Property: not available (no property-based library installed)
- Approval/snapshot: not available (no approval tooling in the tree)

**The single-test command exits 0 when the name matches nothing.** A red must be asserted on the
`Tests  N passed` line of the output, never on `$?`. The full suite is sharded and slow: use the scoped
commands for the inner loop and a package-scoped run before committing.
