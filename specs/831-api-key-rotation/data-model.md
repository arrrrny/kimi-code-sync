# Phase 1 Data Model: Provider API Key Rotation with Per-Key Proxy

Two layers, deliberately separated: **persisted entities** (everything in `config.toml`, owned by the
provider config domain) and **runtime entities** (per-attempt resolution results and per-step rotation
bookkeeping, owned by the llm layer and the turn machine). Nothing in the runtime layer is persisted;
nothing in the persisted layer knows about requests.

---

## Persisted entities

### ProviderConfig (extended)

Owner: `packages/agent-core-v2/src/llm-adapter/provider/provider.ts` (`ProviderConfig`),
schema `packages/agent-core-v2/src/app/kosongConfig/configSection.ts` (`ProviderConfigSchema`),
mirrors in `packages/klient/src/contract/global/providers.ts` and
`packages/node-sdk/src/config/schema.ts`.

| Field | Type | TOML | Notes |
|---|---|---|---|
| `apiKeys` | `Record<string, ProviderApiKey>` | `[providers.<id>.api_keys.<keyId>]` | existing |
| `activeApiKeyId` | `string?` | `active_api_key_id` | existing; **the rotation cursor** |
| `proxyUrl` | `string?` | `proxy_url` | existing; provider-level egress |
| `apiKey` | `string?` | `api_key` | existing legacy single key; unaffected |
| `rotateKeys` | `boolean?` | `rotate_keys` | **new**; absent ≡ `false` |
| `oauth` | `OAuthRef?` | `[providers.<id>.oauth]` | existing; mutually exclusive with keys |

`rotateKeys` is never materialized as `false` on write: absence is the default and is preserved
through read-modify-write cycles so an untouched file stays byte-identical.

### ProviderApiKey (extended)

Owner: same files (`ProviderApiKey`); schema: `ProviderConfigSchema.apiKeys` entry.

| Field | Type | TOML | Validation |
|---|---|---|---|
| `key` | `string` | `key` | non-empty (existing) |
| `name` | `string` | `name` | non-empty (existing) |
| `proxyUrl` | `string?` | `proxy_url` | **new**; optional; trimmed; absent ≡ inherit the provider proxy |

Validation rules for `proxyUrl` (applied at the entry points that accept user input — config load,
the provider manager — not in the Zod schema, which stays permissive so an existing file never fails
to load):

- The value is trimmed; a value that is empty after trimming is treated as **absent** (never stored
  as `""`).
- The value must parse as an absolute URL with an `http`/`https`/`socks`-class scheme
  (`new URL(value)` plus a protocol check). Invalid input is rejected with a message at the point of
  entry and never written.
- Values are plain addresses; embedded credentials are the user's business and are subject to the same
  no-secret-in-output rule as keys (FR-015).

### ProvidersSection

`Record<providerId, ProviderConfig>` — unchanged shape, one new optional field per provider and per
key entry. Ordering rule that matters for rotation: **key order is the TOML table order**, preserved
by the parser and by `Object.keys()` for the id shapes the TUI generates (`key1`, `key2`, … — non
integer-like, so insertion order is stable). A user who names ids like `1`/`2` gets the JS
integer-key ordering (`1` before `2` before `key1`); the cycle still visits every key exactly once
before repeating.

---

## Runtime entities

### Resolved credential (`LlmCredential`)

Owner: `packages/agent-core-v2/src/human/llm/requester/requester.ts:46-49`.

| Field | Type | Meaning |
|---|---|---|
| `apiKey` | `string?` | existing |
| `headers` | `Record<string, string>?` | existing |
| `proxyUrl` | `string?` | **new** — the per-key proxy for the attempt; `undefined` means "keep the model's" |

Produced fresh for every attempt by the credential provider (`actor.ts:64-73`,
`model-requester-impl.ts:178-180`) and consumed only by `applyCredential`.

### Keyed credential provider

Built per catalog entry by `catalog-service.ts:453-469` for providers configured with `apiKeys`;
see `contracts/credential-provider.md` for the behavioral contract. Its fields, conceptually:

- `providerName` — the provider id it reads.
- `resolve()` — reads `IProviderService.get(providerName)` **now**, picks the active key, returns
  `{ apiKey: entry.key, proxyUrl: entry.proxyUrl }`; `undefined` when no key is resolvable.
- `rotation()` — returns a `LlmKeyRotationController` when `rotateKeys === true`, the key count is ≥ 2,
  and the provider is not `managed:*`; otherwise `undefined`.

### Rotation controller (`LlmKeyRotationController`)

Owner (interface): `src/human/llm/requester/requester.ts`; implementation:
`src/llm-adapter/provider/apiKeyRotation.ts`.

| Member | Type | Meaning |
|---|---|---|
| `providerName` | `string` | for reports and diagnostics |
| `keyCount` | `number` | size of the key set at plan time; drives the cycle bound |
| `plan()` | `{ keyId: string; name: string } \| undefined` | the next key after the current active one, wrapping; `undefined` when the set is empty |
| `rotate(expectedKeyId)` | `Promise<RotationOutcome>` | performs the switch, awaited until persisted |

`RotationOutcome`:

| Variant | Payload | Meaning | Effect on the retry |
|---|---|---|---|
| `rotated` | `keyId`, `name` | the expected key was active; the next key is now active | retry uses the new key |
| `already-advanced` | `keyId`, `name` | another rotation moved the active key first; the failed key is no longer active | retry uses the current active key, no second advance |
| `unavailable` | — | provider or key set disappeared between plan and apply | retry proceeds on whatever resolves; the rotation still counts against the step's cycle |

### Rotation cycle counter

Not a stored entity: the count of `{ strategy: 'api_key_rotation' }` records inside the turn machine's
existing `appliedRecoveries` array (`src/human/agent/turn.ts:233`). Reset happens implicitly wherever
the machine already resets that array — on entering a new step (`turn.ts:855-859`) — which is why the
bound is per step (see research.md (b)). Bound: `keyCount - 1` proposals per step.

### Rotation recovery record

`LlmRecoveryRecord & { detail?: string }`, `strategy: 'api_key_rotation'`, `action: '<keyId>'`.
Appended to `appliedRecoveries` (so it counts toward the bound) and emitted as `llm.recovering` →
`loopService` → an observable agent warning. Contains **no key material** — id and name only.

---

## Relationships

```text
ProvidersSection 1 ──* ProviderConfig
ProviderConfig   1 ──* ProviderApiKey            (ordered; the rotation order)
ProviderConfig   1 ──0..1 activeApiKeyId ────────→ ProviderApiKey          (the cursor)
ProviderApiKey   1 ──0..1 proxyUrl               (overrides ProviderConfig.proxyUrl)

ProviderConfig (rotateKeys, ≥2 keys) ──→ KeyedCredentialProvider ──→ LlmKeyRotationController
KeyedCredentialProvider.resolve()   ──→ LlmCredential ──→ applyCredential(model) ──→ per-attempt HTTP client
LlmKeyRotationController.rotate()   ──→ IProviderService.setActiveApiKey ──→ in-memory + persisted
turn step: appliedRecoveries[]      ──→ bounds the number of rotations
```

## Key invariants

1. **Cursor validity.** `activeApiKeyId` either names an existing entry of `apiKeys` or is absent. An
   id that names no entry is treated as absent everywhere (resolution falls back to the first key for
   rotation, and to the legacy `apiKey` for requests) — the spec's "active key deleted while a turn is
   running" edge case.
2. **Opt-in.** With `rotateKeys` absent or `false`, no request line differs from today's behavior, and
   no config write happens as a side effect of a request (FR-001, SC-004).
3. **One pass per step.** A step performs at most `keyCount - 1` rotations; the `(keyCount)`-th
   proposal is never made (FR-008).
4. **Persisted before retried.** A `rotated` outcome has already been through
   `IProviderService.setActiveApiKey` → `KosongConfigService` persist chain → `config.replace` when the
   retry attempt starts; a failed write is reported and does not block the retry (FR-005).
5. **Secret containment.** Every user-visible and logged value introduced by this feature is a key id
   or a key name; `key` values and proxy credentials never leave the credential payload (FR-015).

## State transitions

```text
Provider key set
  (no keys) ──add key──→ (1 key: rotation inert) ──add key──→ (≥2 keys)
  (≥2 keys) ──toggle rotate_keys──→ (rotating) ──toggle off──→ (≥2 keys, inert)
  (any)     ──remove active key──→ activeApiKeyId = first remaining | absent
             → cursor repair, applied consistently by the provider manager and by
               ProviderService.setActiveApiKey()

One turn step, rotation enabled
  attempt(k) on key K ──403───→ propose rotation ──apply──→ attempt(1) on next(K)
  attempt(k) on key K ──429, k < maxAttempts──→ retry backoff on the same key (no rotation)
  attempt(k) on key K ──429, k ≥ maxAttempts──→ propose rotation ──apply──→ attempt(1) on next(K)
  rotations applied this step = keyCount-1 ──→ proposal declined ──→ fail (existing handoff)
  attempt succeeds ──→ step complete; next step starts with a fresh rotation budget
```
