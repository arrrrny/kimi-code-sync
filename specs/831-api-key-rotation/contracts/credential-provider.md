# Contract: Credential Provider Behavior

Scope: how a credential is chosen and applied for one request attempt, and what a credential provider
must guarantee to the turn machine, the direct-caller executors, and the rotation strategy.
Owner (types): `packages/agent-core-v2/src/human/llm/requester/requester.ts`.
Owner (implementation): `packages/agent-core-v2/src/llm-adapter/provider/apiKeyRotation.ts`, with
`createStaticCredentialProvider` / `createOAuthCredentialProvider` in
`src/human/credentials/credentials.ts` unchanged.

## 1. Interfaces (normative shapes)

```ts
export interface LlmCredential {
  readonly apiKey?: string;
  readonly headers?: Record<string, string>;
  readonly proxyUrl?: string;            // NEW: per-key egress for this attempt
}

export interface LlmCredentialProvider {
  resolve(): Promise<LlmCredential | undefined> | LlmCredential | undefined;
  canRecover?(error: unknown): boolean;
  invalidate?(): void;
  rotation?(): LlmKeyRotationController | undefined;   // NEW
}

export interface LlmKeyRotationController {
  readonly providerName: string;
  readonly keyCount: number;
  plan(): { readonly keyId: string; readonly name: string } | undefined;
  rotate(expectedKeyId: string | undefined): Promise<LlmKeyRotationOutcome>;
}

export type LlmKeyRotationOutcome =
  | { readonly outcome: 'rotated'; readonly keyId: string; readonly name: string }
  | { readonly outcome: 'already-advanced'; readonly keyId: string; readonly name: string }
  | { readonly outcome: 'unavailable' };
```

`applyCredential(model, credential)` merges in exactly this order (existing fields plus the new one):

```ts
{ ...model,
  apiKey: credential.apiKey ?? model.apiKey,
  proxyUrl: credential.proxyUrl ?? model.proxyUrl,
  defaultHeaders: mergeRequestHeaders(model.defaultHeaders, credential.headers) }
```

## 2. Resolution timing (the load-bearing rule)

A credential is resolved **per attempt**, by the caller, immediately before the request is built:

| Caller | Site | Consequence |
|---|---|---|
| Turn machine (main loop, sub-agents, swarm, fallback tiers) | `src/human/llm/requester/actor.ts:64-73` | each retry, each recovery re-entry, each step re-resolves |
| Catalog requester (ping, compaction, media upload) | `src/llm-adapter/model/model-requester-impl.ts:111-113, 127-129, 178-180` | same |
| Turn machine's credential view | `src/agent/loop/machine/engine.ts:301-311` (delegating wrapper) | live-reads through `current()`, so a catalog rebuild never strands a turn on a stale provider instance |

`resolve()` must therefore be **live**: it reads the provider config at call time and must not cache
the active key across calls. The HTTP client is built per request from the resulting model
(`createClient(model)` in each `bases/*/requester.ts` via `clientFactory`), so key, headers, and proxy
all apply to the attempt that resolved them.

## 3. Provider selection

| Provider shape | Provider implementation | `canRecover` | `rotation()` |
|---|---|---|---|
| legacy `apiKey`, no `apiKeys` | `createStaticCredentialProvider(apiKey)` | absent | `undefined` |
| `apiKeys` with 1 entry | keyed provider | absent | `undefined` (FR-013) |
| `apiKeys` with ≥ 2 entries, `rotateKeys` off | keyed provider | absent | `undefined` |
| `apiKeys` with ≥ 2 entries, `rotateKeys` on, not `managed:*` | keyed provider | absent | controller |
| `oauth` (managed or not) | `createOAuthCredentialProvider` | 401-only | `undefined` (FR-017) |

Structural guarantees the implementation must preserve:

- `resolveModelAuthMaterial` throws when a provider declares both a key source and `oauth`
  (`model-auth.ts:26-65`); rotation is only reachable from the key branch.
- A provider id under `managed:*` never gets a controller, even if it somehow carries `apiKeys`.
- The keyed provider never returns a key the config does not currently contain.

## 4. Proxy cascade

Resolution order for one attempt: **active key's `proxyUrl` → provider `proxyUrl` → none.** The
provider-level value already sits on the model (`catalog-service.ts:376`), so the cascade is decided
purely by whether `resolve()` returns a `proxyUrl`. An empty or whitespace-only value counts as
absent. Nothing else in the stack may special-case key proxies: the four protocol bases keep calling
`buildProxyDispatcher(model.proxyUrl)`.

## 5. Rotation contract (what the controller owes the strategy)

1. `plan()` is pure with respect to the current config: it returns the next key **after the current
   `activeApiKeyId` in key-definition order**, wrapping to the first key; if the active id is absent
   or unknown it returns the first key; if there are no keys it returns `undefined`.
2. `rotate(expectedKeyId)` is serialized per provider inside the process. It re-reads the config and:
   - if the active id still equals `expectedKeyId` → advance and await persistence → `rotated`;
   - if the active id has already moved to another existing key → change nothing → `already-advanced`;
   - if the provider or the key set is gone → `unavailable`.
3. `rotate()` resolves only after the write has been handed to the persist chain and awaited
   (`IProviderService.setActiveApiKey` → `ProviderService.set` → `fireAsync` → `KosongConfigService`
   persist chain → `config.replace`), so "rotated" implies "recorded in the file" (FR-005).
4. A write failure rejects; the caller logs it, reports it, and continues on the in-memory switch.
   It must never leave the config section invalid: writes are schema-validated before landing.
5. `rotation()` itself must be cheap and side-effect free — the strategy calls it on every failure.

## 6. Reporting obligations

- The controller returns key **ids and names**; never key material, never a masked key, never a header.
- The strategy's proposal carries `detail` in the form `<providerId> → <key name> (<keyId>)`; the
  agent layer turns it into an observable notice. Nothing else about the rotation is user-visible.
- `llm.recovering` retains its existing meaning (a strategy changed something before the next
  attempt); rotation does not add new event types.

## 7. Non-goals / boundaries

- `runWithCredentialRecovery` and `streamWithCredentialRecovery` keep their single-shot semantics and
  do **not** drive rotation; a 403 during a ping still fails the ping. The per-key proxy still applies
  to those paths because they share the resolution timing in §2.
- No key is ever "cooled down" or blacklisted across turns: rotation is a per-step reaction, and the
  only persistent fact is which key is active.
- No automatic key discovery, no key validation probing, no key creation.

## 8. Tests this contract demands

- `applyCredential` proxy merge precedence (key over provider, absent key value keeps the provider one).
- Keyed provider resolution against a mutated provider config (simulating another session's write).
- `rotate()` outcomes: rotated / already-advanced / unavailable, plus order and wrap over ≥ 3 keys.
- Persistence: `rotate()` awaited ⇒ the written section names the new key; a rejected write does not
  throw out of the turn.
- `rotation()` is `undefined` for: 0 keys, 1 key, `rotateKeys` off, OAuth provider, `managed:*` id.
