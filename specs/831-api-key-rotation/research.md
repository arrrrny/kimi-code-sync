# Phase 0 Research: Provider API Key Rotation with Per-Key Proxy

Every decision below is grounded in the code as it exists on branch `831-api-key-rotation`, at the
line numbers cited. Where the reconnaissance notes this plan was seeded with disagreed with the code,
the code won and the correction is recorded under "Recon corrections".

## (a) Where rotation is triggered from

**Decision**: rotation is a **recovery strategy** in the turn machine's existing recovery chain, and
the credential provider contributes the *capability* rather than the policy. Concretely:

- `LlmCredentialProvider` (`src/human/llm/requester/requester.ts:51-55`) gains an optional
  `rotation?(): LlmKeyRotationController | undefined`.
- A new pure strategy (`src/human/credentials/keyRotationRecovery.ts`, shaped like
  `credentialsRecovery` at `src/human/credentials/credentials.ts:56-70`) proposes
  `{ strategy: 'api_key_rotation', action: '<keyId>', detail: '<provider> → <key name>', beforeNextAttempt }`.
- The engine composes it in `src/agent/loop/machine/engine.ts:331-333`, ahead of `credentialsRecovery`
  (today the chain is *only* `credentialsRecovery`; `AgentLoopService.engineOptions()`
  — `src/agent/loop/loopService.ts:195-223` — never passes `recovery`).
- The keyed credential provider built by `src/llm-adapter/model/catalog-service.ts:453-469` supplies
  the controller; the controller performs the write.

**Rationale**: the turn machine already owns exactly the three facts rotation needs — the error, the
attempt count, and the list of recoveries applied to this step — and its failure cascade
(`src/human/agent/turn.ts:632-705`) already consults a strategy chain before retrying and before
failing. Anything lower (inside `streamWithCredentialRecovery`) has a deliberate single-shot guard and
no attempt knowledge; anything higher (the loop service) would have to re-implement the retry ladder.

**Alternatives considered**:

- *A rotating `LlmCredentialProvider` that decides on its own* (`resolve()` returns the next key after
  a failure). Rejected: a credential provider is resolved per attempt and cannot see the retry budget
  (FR-002's "once that key's retry budget is exhausted" versus FR-003's "immediately on a refusal"),
  cannot count a cycle, and would silently rotate on unrelated failures — including the 401 that the
  OAuth path owns. Also rejected by the recorded design: the provider's contract is
  `resolve/canRecover/invalidate`, and recovery policy is explicitly the caller's
  (`packages/agent-core-v2/docs/en/llm.md`, principles 5 and 7).
- *Rotating inside `streamWithCredentialRecovery`* (`src/llm-adapter/model/credential-recovery.ts:17-35`).
  Rejected: the `recovered` boolean exists to make OAuth re-authorization single-shot; widening it to
  "loop while the provider says yes" would let a repeatedly-401ing OAuth provider spin, regressing the
  login-refresh path. Rotation stays out of that helper (see (f) for what that costs).
- *A new state machine / an agent-scope retry wrapper around the turn.* Rejected: an extra
  orchestration layer with no state anyone consumes is an explicitly recorded rejected scheme
  (`docs/en/llm.md`, "Rejected Schemes").

## (b) How the "full cycle exhausted" bound is tracked

**Decision**: the bound lives in the turn machine, in the array it already maintains:
`context.appliedRecoveries` (`src/human/agent/turn.ts:233`, reset to `[]` whenever a step completes
and the next step starts, `turn.ts:855-859`). The strategy counts its own records:

```text
maxRotations = keyCount - 1        // the attempt that just failed already consumed one key
if (appliedRecoveries.filter(r => r.strategy === 'api_key_rotation').length >= maxRotations) → do not propose
```

When the bound is reached the strategy returns `undefined`, so the machine falls through to
`shouldRetry` and then to `failed` — which is the existing handoff to the substitute/fallback
machinery (see the conflict note at the end of this file about what that machinery currently does).

**Rationale**: zero new state, no cross-scope plumbing, and the counter is naturally scoped to the
only place where an unbounded rotation loop could actually occur — the failure cascade of one step.
`keyCount - 1` is exactly FR-004 + FR-008: the failing key plus one rotation per remaining key equals
one full pass over the key set.

**Interpretation of "per turn"**: FR-008 says one cycle per *turn*; the counter resets per *step*
(a step is one LLM request; a turn can contain many steps). A turn whose step exhausts every key
fails that turn, so no loop is possible either way. Should a *later* step of a long goal-mode turn
hit fresh rate limits, per-step counting lets it rotate again — which is the behavior the feature
exists for (SC-001 is an 8-key, long-running goal-mode run). A turn-wide counter would suppress that
re-rotation after any successful rotation earlier in the turn; it was rejected as strictly worse for
the primary use case, and it would need a new context field plus explicit turn-boundary resets.

**Alternatives considered**: a counter on the rotation controller (state must not live in the
provider — catalog entries are invalidated and rebuilt on every provider change, see
`catalog-service.ts:86-98`); a counter in a new agent-scope state key (duplicates what
`appliedRecoveries` already is, and would need garbage collection per turn).

## (c) Rate-limit-after-budget versus an ordinary retryable rate limit

**Decision**: widen the recovery context with the two raw facts and keep the policy in the strategy.

- `LlmRecoveryContext` (`src/human/llm/requester/recovery.ts:10-15`) gains
  `readonly attempt: number` and `readonly maxAttempts: number`; the turn machine fills them where it
  builds the context (`turn.ts:636-641`, values from `context.attempt` and
  `resolveMaxAttempts(retry)`).
- The strategy proposes a rotation for a rate limit **only** when `attempt >= maxAttempts`
  (`shouldRetry` at `src/human/llm/requester/retry.ts:59-66` is the inverse boundary, so the two agree
  by construction), and for a refusal (HTTP 403) at any attempt.

**Rationale**: the retry ladder and the rotation ladder then compose without either knowing the
other's constants. `attempt` is incremented in the `retrying` state and reset to 1 on every applied
recovery (`turn.ts:718`, `turn.ts:662`), so each key gets its own full budget before rotation — the
spec's "Assumptions" state exactly that. `retry-after` hints are honored before rotation for free,
because the wait happens in `retrying` (`turn.ts:683-687`) before the next failure is evaluated.

**Alternatives considered**: passing a precomputed `retryBudgetExhausted` boolean (hides the two
numbers the strategy's message wants to report: "after 10 attempts"); comparing inside the machine
(puts provider policy in the machine, against the "pure policy functions" split documented at
`docs/en/llm.md` principle 5); inferring the budget from `delayMs` (fragile).

**Qualifying failure set**: (i) HTTP 429 / the classified rate-limit kind; (ii) HTTP 403. Explicitly
**not** triggers: `quota_exhausted` (account-level, not key-level — the classification already
separates it, `src/llm-adapter/contract/errors.ts:355-357`), 401 (belongs to the OAuth refresh path),
context-overflow / request-too-large / image-format / tool-adjacency (all recoverable by other
strategies), and transport errors (a network failure says nothing about the key).

## (d) Persisting and making the new active key effective

**Decision**: the rotation controller calls a new write method on the provider domain,
`IProviderService.setActiveApiKey(providerName, keyId)`, implemented as a read-modify-write over the
in-memory provider record with the existing `set()`:

```text
rotate():  read the provider config now → if activeApiKeyId already moved past the expected key,
           report the current one and stop (another session won the race)
           else providers.setActiveApiKey(name, nextKeyId)  // awaited
```

`ProviderService.set()` (`src/llm-adapter/provider/provider-service.ts:66-70`) updates memory first,
then awaits `fireAsync`, which awaits every listener's `waitUntil` promise
(`src/_base/event.ts:158-181`). The registered listener is
`KosongConfigService` (`src/app/kosongConfig/kosongConfigService.ts:56-65`), which enqueues the write
on its serialized `persistChain` and runs `config.replace(PROVIDERS_SECTION, …)` with 3 retries
(`kosongConfigService.ts:149-166`). The awaited `set()` therefore means **persisted**, which is what
FR-005 asks, and the same call invalidates the catalog entry for that provider
(`catalog-service.ts:86-98`), so the very next attempt re-resolves the new key.

Making the proposal's apply awaitable is the one structural change to existing machinery: see the
Complexity Tracking table in plan.md. A failed persist is logged and surfaced as a warning but does
not fail the turn — the run continues on the in-memory switch.

**Concurrency (FR-016)**: within a process, rotations for one provider are serialized through a
per-provider promise chain in the rotation controller, and the read-modify-write happens inside that
section, so two concurrent rotations cannot both advance. Across processes, `config.replace` is a
per-domain read-merge-write over `IAtomicDocumentStore` (`configService.ts:797-870`), and the
in-process `persistChain` serializes writes; the last writer wins for the same section, and every
write is schema-validated before it lands, so the file cannot hold an invalid key. The running session
also re-reads external changes — the config service watches the home directory and fires
`onDidSectionChange` (`configService.ts:338-343`, `:633`), and `KosongConfigService` reloads the
providers section from it (`kosongConfigService.ts:88-95`).

**Alternatives considered**: writing the TOML directly from the rotation controller (violates the
persistence doctrine in `packages/agent-core-v2/AGENTS.md` and duplicates the retry/serialize logic);
fire-and-forget persistence (see plan.md Complexity Tracking); a session-scope override that never
touches the file (violates FR-005 and SC-003).

## (e) Per-key proxy cascade

**Decision**: the proxy travels with the credential, resolved on every attempt.

- `LlmCredential` (`src/human/llm/requester/requester.ts:46-49`) gains `readonly proxyUrl?: string`.
- The keyed credential provider's `resolve()` live-reads the active key and returns
  `{ apiKey: key, proxyUrl: key.proxyUrl }` — `undefined` when the key declares none.
- `applyCredential` (`src/human/credentials/credentials.ts:40-52`) merges it over the model:
  `proxyUrl: credential.proxyUrl ?? model.proxyUrl`. Both are optional `LlmConnection` fields
  (`src/human/llm/model.ts:3-10`), and the provider-level value is already on the model
  (`catalog-service.ts:376`), so the cascade is: key → provider → none, with no new branch anywhere.

**Where it becomes effective**: every path that performs a request applies a credential to the model
for that attempt — the turn machine's request actor (`src/human/llm/requester/actor.ts:64-73`) and the
direct-caller path (`src/llm-adapter/model/model-requester-impl.ts:178-180`, also used by ping,
compaction, image/video upload). The HTTP client is built per request from that model
(`createClient(model)` in each `bases/*/requester.ts`, e.g.
`src/human/llm/requester/bases/openai/requester.ts:59-66` via the `clientFactory` at `:215-216`), and
`buildProxyDispatcher` turns the URL into the undici `ProxyAgent`. So the proxy follows whichever key
is active for that attempt, on every request, including sub-agents, swarm batch items, and fallback
tiers (FR-018) — they all bind to the same catalog entry and resolve the same credential provider.

**Alternatives considered**: baking the per-key proxy into `Model.proxyUrl` in `catalog-service`
(would need a catalog rebuild per rotation, and `Model` is cached per alias — the retry could still
use the stale model); a second `resolveProxyUrl()` method (two resolution points, every call site
duplicated); configuring the proxy at the transport layer per provider (cannot distinguish keys).

## (f) Not disturbing small, managed, and OAuth providers

**Decision**: the keyed provider is constructed by auth material, and the rotation surface is
additionally gated by configuration:

| Provider shape | Credential provider | Rotation surface |
|---|---|---|
| Legacy single `apiKey`, no `apiKeys` | `createStaticCredentialProvider(apiKey)` (unchanged) | none |
| `apiKeys` with exactly one entry | keyed provider (resolves the active key + its proxy) | none — `rotate_keys` has no effect (FR-013) |
| `apiKeys` with ≥ 2 entries, `rotate_keys` absent/false | keyed provider (per-key proxy still cascades, FR-009/FR-010) | none |
| `apiKeys` with ≥ 2 entries, `rotate_keys = true` | keyed provider | exposed; the strategy may propose |
| `oauth` (including `managed:*` logins) | `createOAuthCredentialProvider` (unchanged) | none (FR-017) |

The gate is structural, not defensive: `resolveModelAuthMaterial`
(`src/llm-adapter/model/model-auth.ts:26-65`) throws when a provider declares both `apiKey` and
`oauth`, and `buildCredentialProvider` (`catalog-service.ts:453-469`) already branches on
`auth.apiKey` versus `auth.oauth` — rotation is only reachable from the `auth.apiKey` branch, and only
when the config says so. A `managed:*` provider id is additionally rejected inside the controller as
belt and braces, since its credentials come from the login flow.

**Direct callers stay single-shot**: `runWithCredentialRecovery` / `streamWithCredentialRecovery`
are deliberately left alone (see (a)). A 403 during a ping therefore still fails the ping; the
per-key proxy, however, applies to those requests too, because they go through the same per-attempt
credential resolution.

**Alternatives considered**: a global rotation switch (spec is explicit that it is per provider);
treating "≥2 keys" as the only gate (a user keeping two keys for convenience would start rotating and
rewriting their config file without opting in — FR-001 forbids that).

## Adjacent decisions

### Setting or experimental flag

**Decision**: `rotate_keys` per provider, default off, is the gate. No
`KIMI_CODE_EXPERIMENTAL_*` flag is added.

**Rationale**: root `AGENTS.md` asks for flags on not-yet-public features; the requirement here is the
opposite — a user-visible, per-provider setting whose default keeps existing users byte-identical
(FR-001, SC-004). Adding a global flag on top would create two off-switches and a second way for the
feature to be mysteriously absent.

### TOML shape for the new fields

**Decision**: `rotate_keys` at the provider level (camelCase `rotateKeys` in memory) and
`proxy_url` inside each key table (camelCase `proxyUrl` in memory).

**Rationale and a required transform change**: `providerEntryFromToml`
(`src/app/kosongConfig/configSection.ts:96-109`) camelizes every provider-level key, so a snake_case
*field name in the TypeScript type* would never load — `free_models_only` in that schema is an
existing instance of exactly that trap (see "Conflicts found"). The keyed entries, by contrast, are
currently passed through verbatim, so `[providers.kilo.api_keys.key1] proxy_url = "…"` would be
silently dropped by zod (`ProviderConfigSchema.apiKeys` is a plain `z.object`, which strips unknown
keys). The plan therefore adds per-key transforms to `providerEntryFromToml` /
`providerEntryToToml` that camelize a key entry on read and snake_case it on write, preserving unknown
raw fields the way the provider level already does — plus the matching field in the node-sdk and
klient mirrors.

### Where the user-visible report comes from

**Decision**: the strategy's proposal carries a `detail` string (provider → key id + name) that rides
`llm.recovering` to `src/agent/loop/loopService.ts`'s existing `'recovering'` case
(`loopService.ts:1549-1558`), which dispatches an observable agent event (`WarningIssued`, the same
channel `activateFallback` uses at `llmRequesterService.ts:819-825`) with code `api-key-rotation`.
Key **names and ids only** — never key material (FR-014, FR-015).

**Alternatives considered**: a new wire event class (heavier: schema + `registerEvent2Class` + wire
manifest regeneration, for a notice the warning channel already carries); emitting from the credential
provider (App scope, no agent dispatcher, and it would have to invent the message text).

## Recon corrections

- `packages/agent-core-v2/src/llm-adapter/human/**` does not exist. The `#human/*` specifier maps to
  `src/human/*` (`package.json` `imports`), so the real paths are `src/human/llm/requester/*`,
  `src/human/credentials/credentials.ts` (not `src/llm-adapter/human/…`), `src/human/agent/turn.ts`,
  and `src/human/llm/requester/bases/*/requester.ts`.
- `isProviderRateLimitError` lives at `src/llm-adapter/contract/errors.ts:355` as noted, but the
  human-layer analogue used by credential policy is `errorStatusCode` from `src/human/llm/errors.ts:20`.
- The turn machine's recovery chain is composed at `engine.ts:331-333`, but nothing ever sets
  `options.recovery`, so today the chain is effectively just `credentialsRecovery`.

## Conflicts found between the spec and the code

1. **FR-008's handoff is only half-wired for the failures this feature cares about.**
   `isTerminalProviderApiError` (`src/llm-adapter/contract/errors.ts:247-267`) deliberately excludes
   401/403/408/409/429, so a 429 or 403 that exhausts the rotation cycle does **not** activate the
   fallback model via `activateFallback('terminal-error')` (`llmRequesterService.ts:519-531`). The
   declared `'retry-budget'` cause has no call site at all. Rotation stops correctly and the turn
   fails as it would today — but "hands control to the existing substitute-model and fallback-model
   behavior" is, for 429/403, "the turn fails and the session layer reports it". This plan does not
   change those semantics (that would be a separate behavioral decision); it only guarantees that
   rotation never *blocks* the existing handoff.
2. **403 is not currently recoverable at all**, so FR-003 is a genuine addition rather than a
   rerouting: today a 403 is non-retryable, not terminal, and not credential-recoverable.
3. **`free_models_only` is a pre-existing config trap** (`configSection.ts:58` and
   `packages/node-sdk/src/config/schema.ts:60` declare snake_case while the TOML transform camelizes
   provider-level keys). Out of scope for this feature, but the reason the new toggle is declared
   camelCase and mapped to `rotate_keys` in the file — do not copy the snake_case pattern.
4. **The provider manager cannot clear a proxy today** (`handleProviderProxyUrl`,
   `apps/kimi-code/src/tui/commands/provider.ts:601-638`: an empty answer is treated as cancel, so the
   proxy can only be replaced, never removed), while FR-011 requires the per-key prompt to accept an
   empty answer. The per-key prompt is therefore a new tri-state helper rather than a reuse of
   `promptProxyUrl`.
