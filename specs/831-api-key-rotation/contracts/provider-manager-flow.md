# Contract: Provider Manager Key Flow (TUI)

Scope: what a user does in the provider manager for this feature — adding a key (now with an optional
per-key proxy) and turning rotation on or off. Owner files:
`apps/kimi-code/src/tui/commands/provider.ts`, `apps/kimi-code/src/tui/commands/prompts.ts`,
`apps/kimi-code/src/tui/components/dialogs/provider-manager.ts`. App code reaches the engine only
through `@moonshot-ai/kimi-code-sdk`, so every write below goes through the existing harness config
surface, not through engine internals.

## 1. Entry points

| Path | Trigger |
|---|---|
| Provider manager dialog | `/provider` (existing) |
| Add key | `A` on a key row, or `A` on a `source` row whose provider is standalone (existing) |
| Set active key | `S` on a key row (existing) |
| Delete key | `D` on a key row, with confirmation (existing) |
| Set provider proxy | `P` on a `source` row (existing) |
| **Toggle rotation** | **`R` on a `source` row whose provider has ≥ 2 keys (NEW)** |
| **Per-key proxy** | **the third question of the add-key flow (NEW)** |

## 2. Add-key flow (normative)

```text
1. name   : promptKeyName            → non-empty after trim, else cancel
2. secret : promptApiKey             → unchanged
3. proxy  : promptKeyProxyUrl (NEW)  → optional; Enter on an empty box = no per-key proxy
4. persist: apiKeys[<keyId>] = { key, name, proxyUrl? }   (proxyUrl omitted when empty)
5. status : `Added API key "<name>" to <providerId>`
6. reopen : provider manager, on the newly added key row
```

Rules:

- **Step count (SC-006)**: exactly one additional question versus today, and it is skippable with a
  single Enter.
- **Give-up points**: cancelling at the name or secret prompt abandons the flow (unchanged); cancelling
  at the proxy prompt also abandons it — "empty" and "cancel" must stay distinguishable.
  `promptProxyUrl` cannot express that (it maps empty to `undefined`, `prompts.ts:249-266`), so the new
  helper `promptKeyProxyUrl` returns a tri-state: `undefined` = cancel, `{ proxyUrl: undefined }` =
  accepted with no proxy, `{ proxyUrl: string }` = accepted with a proxy.
- **Validation at input time**: the value is trimmed; a non-empty value must parse as an absolute
  `http`/`https`/`socks`-class URL. Invalid input re-prompts with a message instead of being saved.
- **Persistence**: unchanged mechanism — `harness.replaceConfigSections({ providers })` when
  `supportsAtomicSectionReplace()`, else `harness.setConfig({ providers })`, followed by
  `authFlow.refreshConfigAfterLogin()` (the existing pattern at `provider.ts:181-191`).
- **First key becomes active**: unchanged (`activeApiKeyId ??= keyId`); adding a key never changes an
  existing active key.
- **Key id**: still the first free `key1..keyN` (`generateKeyId`, `provider.ts:261-270`).

## 3. Rotation toggle flow (new)

```text
R on a source row with ≥ 2 keys → flip rotateKeys for that provider → persist → status line
  on  : `Key rotation enabled for <providerId> (<n> keys)`
  off : `Key rotation disabled for <providerId>`
```

- `R` is a no-op (with a short error notice) when the provider has fewer than 2 keys — the setting
  would have no effect (FR-013).
- The toggle never touches `activeApiKeyId`.
- Persistence uses the same replace/set path as the other key actions.

## 4. Rendering contract

| Row | Shows |
|---|---|
| key row | name, masked secret preview (`maskApiKey`, existing), `← current` marker on the active key (existing), **and the per-key proxy host when one is set** — new muted line, formatted as the URL's host (e.g. `proxy: 127.0.0.1:8081`) |
| source row | base URL (existing) and, when the provider has ≥ 2 keys, **rotation state** — `rotate keys: on` / `rotate keys: off` |
| action hint line | `A add key · S set active · D delete · R rotate keys` on key-capable rows |

- No full secret is ever rendered; the per-key proxy is displayed as a host, and its userinfo (if a
  user embeds credentials) is never printed.
- A key whose proxy fails validation is never stored, so the dialog never shows an invalid value.

## 5. Interaction with the running engine

The TUI writes through the SDK harness; the engine's `ProviderService` learns about it either from the
write path (same process) or from the config service's file watch, and reloads the section. The
provider manager therefore needs no engine-specific code, and a rotation happening during a run
appears as a refresh of the key rows' `← current` marker — no extra wiring required.

## 6. Tests this contract demands

- Add-key flow: three prompts in order; empty proxy ⇒ stored without `proxyUrl`; proxy supplied ⇒ stored
  with it; cancel at each prompt abandons without writing.
- Invalid proxy input is rejected and re-prompted (no write).
- `R` on a 1-key provider does not write; `R` on a multi-key provider flips only `rotateKeys`.
- Dialog rows: per-key proxy line present/absent, rotation state text, `← current` marker unchanged.
- Every write path still goes through `replaceConfigSections` when supported (mirroring the existing
  assertions in `apps/kimi-code/test/tui/kimi-tui-startup.test.ts:1902-2005`).
