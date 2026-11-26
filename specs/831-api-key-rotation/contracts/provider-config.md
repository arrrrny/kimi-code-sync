# Contract: Provider Config Surface (TOML + in-memory)

Scope: everything a user writes in `~/.kimi-code/config.toml` for this feature, and the shape the
engine sees after loading it. Owner files: `configSection.ts` (engine zod schema + TOML transforms),
`provider.ts` (engine type), `klient/src/contract/global/providers.ts`, `node-sdk/src/config/schema.ts`
+ `toml.ts`. All four must agree; the engine is the source of truth.

## 1. Surface

### 1.1 `rotate_keys` (new, provider level)

| Aspect | Contract |
|---|---|
| TOML key | `rotate_keys` inside `[providers.<providerId>]` |
| In-memory field | `ProviderConfig.rotateKeys?: boolean` |
| Type / default | `boolean`, absent ≡ `false` (no behavior change for existing files — FR-001) |
| Effect | enables rotation for that provider only, and only when the provider has ≥ 2 entries in `api_keys` (FR-013) |
| Written when | only by an explicit user action or by a rotation toggle; never synthesized during read-modify-write |
| Ignored when | the provider resolves its credential from `oauth` (including `managed:*`) — FR-017 |

### 1.2 `proxy_url` inside a key entry (new, key level)

| Aspect | Contract |
|---|---|
| TOML key | `proxy_url` inside `[providers.<providerId>.api_keys.<keyId>]` |
| In-memory field | `ProviderApiKey.proxyUrl?: string` |
| Type / default | `string`, absent ≡ inherit the provider-level `proxy_url` |
| Resolution order | key `proxy_url` → provider `proxy_url` → no proxy (FR-010) |
| Applies to | every request issued while that key is the active key, on every request path — main loop, sub-agents, swarm items, fallback tiers, ping, media uploads (FR-018) |
| Empty value | trimmed; empty ⇒ treated as absent, never stored as `""` |
| Round-trip | `proxy_url` ⇄ `proxyUrl`; unknown fields inside a key entry survive a read-modify-write unchanged |

## 2. TOML shapes

Full example, matching the config the feature was designed around:

```toml
[providers.kilo]
type = "openai"
base_url = "https://api.example.com/v1"
proxy_url = "http://127.0.0.1:8080"     # provider-level egress
active_api_key_id = "key2"
rotate_keys = true                       # NEW — opt in to rotation

[providers.kilo.api_keys.key1]
key = "sk-alpha"
name = "work"
proxy_url = "http://127.0.0.1:8081"      # NEW — this key egresses elsewhere

[providers.kilo.api_keys.key2]
key = "sk-beta"
name = "personal"                        # no proxy_url ⇒ inherits the provider proxy

[providers.kilo.api_keys.key3]
key = "sk-gamma"
name = "backup"
proxy_url = "http://127.0.0.1:8082"
```

Minimal case, rotation off and no per-key proxy (the common file today — must load and behave
exactly as before):

```toml
[providers.kilo]
type = "openai"
base_url = "https://api.example.com/v1"
active_api_key_id = "key1"

[providers.kilo.api_keys.key1]
key = "sk-alpha"
name = "work"
```

## 3. Mapping rules (normative)

1. Provider-level keys are snake_case in TOML and camelCase in memory via the existing
   `snakeToCamel` / `camelToSnake` transforms in `providerEntryFromToml` / `providerEntryToToml`.
   `rotate_keys` ⇄ `rotateKeys` therefore arrives for free.
2. **Key-entry fields are currently passed through untransformed** (`providerEntryFromToml` sends
   `apiKeys` down the plain-value path). The contract requires per-entry transformation: a key entry
   is camelized on read and snake_cased on write, preserving unknown raw fields the way the provider
   level already does (`cloneRecord(rawProvider)` pattern).
3. A key entry's `proxy_url` must survive a write cycle it did not participate in (adding a key,
   removing another key, toggling rotation) — writes rebase on the raw on-disk entry.
4. Unknown top-level provider fields continue to be preserved (existing behavior).

## 4. Validation

| Rule | Where enforced | Failure mode |
|---|---|---|
| `rotate_keys` is a boolean | zod schema | invalid value ⇒ config diagnostic, section rejected as today |
| key `proxy_url` parses as an absolute URL with an `http`/`https`/`socks`-class scheme | entry points that accept user input (provider manager; not the loader) | rejected with a message at input time; the loader stays permissive so an existing file always loads |
| a key `proxy_url` is trimmed; empty means absent | same | empty ⇒ field omitted |
| `active_api_key_id` names an existing key or is absent | domain rule (resolution + rotation), not the schema | unknown id ⇒ treated as absent (resolution falls back, rotation starts at the first key) |

## 5. Cross-package mirrors

| Package | File | Change |
|---|---|---|
| `agent-core-v2` | `src/app/kosongConfig/configSection.ts` | `rotateKeys` in `ProviderConfigSchema`; `proxyUrl` in the `apiKeys` entry schema; per-key transforms |
| `agent-core-v2` | `src/llm-adapter/provider/provider.ts` | `ProviderConfig.rotateKeys?: boolean`, `ProviderApiKey.proxyUrl?: string` |
| `klient` | `src/contract/global/providers.ts` | `rotateKeys`, `providerApiKeySchema.proxyUrl` |
| `node-sdk` | `src/config/schema.ts` | `rotateKeys`, `ProviderApiKeySchema.proxyUrl` |
| `node-sdk` | `src/config/toml.ts` | `rotate_keys` at provider level (automatic), `proxy_url` inside key entries (per-entry transform) |

A mirror that lags the engine silently strips the field on a client write. Where a test exists for a
mirror's provider section, extend it; otherwise cover the mirror through the engine's round-trip test
plus the SDK config test.

## 6. Generated artifacts

`packages/agent-core-v2/docs/config-manifest.toml` is generated from the registered section and its
freshness is enforced by `test/app/config/configManifest.test.ts`. Regenerate with
`pnpm gen:config-manifest` after the schema change.

## 7. Explicit non-goals

- No migration or versioning: files without the new fields load unchanged, and adding fields to a
  provider that never rotates writes nothing.
- No environment-variable binding for `rotate_keys` (the env binding table for providers covers
  `apiKey`/`type`/`baseUrl` only; a global env override for rotation would contradict the
  per-provider opt-in).
- No global proxy fallback (`HTTP_PROXY`) is introduced or changed.
