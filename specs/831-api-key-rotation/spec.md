# Feature Specification: Provider API Key Rotation with Per-Key Proxy

**Feature Branch**: `831-api-key-rotation`

**Created**: 2026-09-17

**Status**: Draft

**Input**: User description: "when a provider has multiple api keys there should be a setting to rotate-keys which sets the active key and reload the config and continue when client fails after 429 or 403 errors. we should also have proxy_url per key, as a cascading rule so if the key has a dedicated proxy_url that should override the proxy per provider. when adding api keys it should ask the proxy_url as well. check my config ~/.kimi-code/config.toml I have 8 keys for kilo and 8 keys for opencode, when I am in goal mode and running a long task, when I receive 429 (repeatedly already 10 retries) or 403 it should switch to the next key after the last key it should move back to beginning like a circle. we already have a /substitute model and fallback-model chains. this should be a setting per provider and this should preceed those settings if enabled"

---

## Summary

Providers can already hold several named API keys, with one marked as the active key. Today
that set is inert: when the active key is rate-limited or rejected, the request fails or the
agent falls through to the substitute-model and fallback-model chains, and the user must
change keys by hand.

This feature makes an exhausted key rotate: with a per-provider `rotate_keys` setting turned
on, a request that fails with a rate-limit response after its retries are used up, or that is
refused outright, moves to the next configured key — wrapping back to the first key after the
last — records the new active key in the configuration file, reloads it, and retries the
in-flight request so a long-running goal-mode task keeps going instead of dying.

It also lets each key carry its own proxy setting, resolved as a cascade: a key-level proxy
overrides the provider-level proxy. Creating a key through the provider manager asks for that
optional proxy.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A rate-limited turn rotates to the next key instead of failing (Priority: P1)

A user runs a long goal-mode task against a provider that has several API keys configured
(e.g. eight keys for `kilo`). The active key starts returning rate-limit responses. After the
request has exhausted its retry budget on that key, the agent switches to the next key,
records it as the active key, and continues the same turn without the user doing anything.

**Why this priority**: This is the core value. Without it, a rate-limited provider stops a
long autonomous run even though the user has seven more usable keys.

**Independent Test**: Configure a provider with at least two keys, enable rotation, make the
first key return a rate-limit response until its retries are exhausted, and confirm that the
turn completes on the second key without a new user message.

**Acceptance Scenarios**:

1. **Given** a provider with rotation enabled and three keys, **When** the active first key
   returns rate-limit responses until its retry budget is exhausted, **Then** the request is
   retried with the second key within the same turn and the turn is not failed.
2. **Given** a provider with rotation enabled, **When** the active key is refused (403) by the
   provider, **Then** the next key is used for the retry without first consuming the retry
   budget on the refused key.
3. **Given** the last key in the provider's key list is active, **When** it is exhausted,
   **Then** rotation continues from the first key (circular order).
4. **Given** a rotation moved activity to a different key, **When** the turn succeeds, **Then**
   the configuration file records that key as the provider's active key.
5. **Given** rotation is disabled for the provider (the default), **When** the active key is
   rate-limited or refused, **Then** behavior is unchanged from today.

---

### User Story 2 - Rotation takes precedence over the fallback chains (Priority: P1)

The user already relies on `/substitute-model` and fallback-model chains for resilience. With
rotation enabled, those chains must not be reached while usable keys remain — switching key is
cheaper and keeps the user on their chosen model.

**Why this priority**: Without an explicit precedence rule the two mechanisms race, and the
user silently loses their chosen model to a fallback they did not need.

**Independent Test**: Enable rotation on a multi-key provider with a fallback model
configured; exhaust the active key; confirm the retry uses the next key and the same model,
and that no substitute/fallback model was activated.

**Acceptance Scenarios**:

1. **Given** rotation is enabled and a substitute model is configured, **When** the active key
   is rate-limited, **Then** the next key is tried on the current model before any substitute
   model is considered.
2. **Given** rotation is enabled and fallback models are configured, **When** the active key is
   refused (403), **Then** the next key is tried before the fallback chain is entered.
3. **Given** every configured key has been tried once in the current turn and all were
   refused, **When** no key remains, **Then** the system stops rotating and hands control to
   the existing substitute-model and fallback-model behavior.

---

### User Story 3 - A key can use its own proxy (Priority: P2)

The user routes provider traffic through a proxy. Some keys must use a different egress than
the provider default (different upstream accounts, different regions, different quotas). A key
that declares its own proxy uses it; a key that does not falls back to the provider's proxy.

**Why this priority**: Valuable but secondary — rotation alone solves the core problem, while
per-key proxying matters only for users with per-key network routing.

**Independent Test**: Set a provider-level proxy and give one key a different proxy; issue a
request with each key active and confirm each request leaves through the expected proxy.

**Acceptance Scenarios**:

1. **Given** a provider proxy is configured and the active key also declares one, **When** a
   request is made with that key, **Then** the key's proxy is used.
2. **Given** a provider proxy is configured and the active key declares none, **When** a
   request is made with that key, **Then** the provider's proxy is used.
3. **Given** neither the key nor the provider declares a proxy, **When** a request is made,
   **Then** no proxy is applied (current behavior).
4. **Given** a request is sent with a rotated-to key that declares its own proxy, **When** the
   retry happens, **Then** that key's proxy is used for the retry.

---

### User Story 4 - Adding a key asks for its proxy (Priority: P2)

While adding an API key to a provider through the provider manager, the user is asked for the
optional proxy for that key in addition to the key name and secret.

**Why this priority**: Without it, per-key proxies can only be set by editing the configuration
file by hand, which makes the feature unusable for most users.

**Independent Test**: Open the provider manager, add a key, leave the proxy empty, and then
add another key with a proxy value; confirm both are stored and shown.

**Acceptance Scenarios**:

1. **Given** the user adds an API key to a provider, **When** the key name and secret are
   entered, **Then** the flow also asks for an optional proxy value that may be left empty.
2. **Given** the user leaves the proxy empty while adding a key, **When** the key is saved,
   **Then** the key has no proxy of its own and inherits the provider's proxy.
3. **Given** the user supplies a proxy while adding a key, **When** the key is saved, **Then**
   the value is persisted with that key and survives a restart.
4. **Given** a key with its own proxy is listed in the provider manager, **When** the user
   inspects the key, **Then** the proxy is visible without revealing the secret.

---

### User Story 5 - The rotation is visible while it happens (Priority: P3)

During a long autonomous run the user should be able to see that keys are being rotated — which
provider, which key is now active — without waiting for the run to end.

**Why this priority**: Trust and debuggability. A silent rotation looks like a stalled run.

**Independent Test**: Force rotation with a rate-limited key while watching the session output
and confirm each switch is reported with the provider and key identity.

**Acceptance Scenarios**:

1. **Given** rotation switches the active key, **When** the switch happens, **Then** the
   session reports the provider and the new active key by name or identifier.
2. **Given** a rotation is reported, **When** the user reads the report, **Then** no secret key
   material is shown.
3. **Given** rotation has cycled through every key without success, **When** it gives up,
   **Then** the user is told that all configured keys were tried.

---

### Edge Cases

- **Single key configured**: rotation is a no-op; the provider behaves exactly as today.
- **Rotation enabled with no keys**: the provider falls back to its legacy single key value and
  does not attempt rotation.
- **Active key deleted while a turn is running**: the next rotation starts from the key that
  now holds the active slot, or from the first key if the slot was cleared.
- **All keys refused in one turn**: the full cycle is attempted exactly once per turn; the
  system then stops rotating and hands off to the existing substitute/fallback behavior rather
  than looping forever.
- **A key's proxy is unreachable**: the failure is attributed to that key's proxy; rotation
  continues to the next key rather than failing the whole provider.
- **A refusal unrelated to the key** (e.g. the account may not use the requested model): the
  key is still rotated once, and if every key is refused the existing fallback path takes over.
- **Rate-limit response carries a retry-after hint**: the wait is honored before the key is
  rotated.
- **Several sessions use the same provider concurrently**: key switches are written without
  corrupting the configuration file, and each session continues from a valid key.
- **Managed/OAuth providers**: providers whose credentials come from a login flow are not
  rotated by this feature.
- **Proxy value entered with surrounding whitespace or as an invalid address**: the value is
  validated when saved rather than silently accepted.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Provider configuration MUST accept a `rotate_keys` setting that is disabled by
  default, so existing users see no behavior change until they opt in.
- **FR-002**: When `rotate_keys` is enabled for the provider serving a request, the system MUST
  switch to the next API key after a rate-limit failure once that key's retry budget is
  exhausted.
- **FR-003**: When `rotate_keys` is enabled, the system MUST switch to the next API key on a
  refusal (403) without first exhausting the retry budget on the refused key.
- **FR-004**: Rotation MUST follow the order in which keys are defined for the provider and
  MUST wrap around from the last key to the first.
- **FR-005**: A rotation MUST persist the newly active key to the configuration file and make
  the reloaded value effective before the retry is attempted.
- **FR-006**: After a rotation the in-flight request MUST be retried inside the same turn; the
  turn MUST NOT fail and the user MUST NOT have to resend the message.
- **FR-007**: When `rotate_keys` is enabled, key rotation MUST be attempted before the
  substitute-model chain and before the fallback-model chain.
- **FR-008**: After every configured key has been tried once in the current turn without
  success, rotation MUST stop and control MUST pass to the existing substitute-model and
  fallback-model behavior.
- **FR-009**: Each API key entry MUST support an optional per-key proxy setting.
- **FR-010**: Proxy resolution MUST cascade: the key-level proxy overrides the provider-level
  proxy; when the key declares none, the provider-level proxy applies; when neither exists, the
  request is made without a proxy.
- **FR-011**: The provider manager's add-key flow MUST ask for the optional per-key proxy after
  the key name and secret, and MUST accept an empty answer.
- **FR-012**: A per-key proxy MUST be persisted with the key it belongs to and MUST survive a
  restart.
- **FR-013**: Providers with fewer than two API keys MUST NOT be affected by `rotate_keys`.
- **FR-014**: Every rotation MUST be reported to the user with the provider and the identity
  (name or identifier) of the newly active key.
- **FR-015**: No secret key material MUST appear in user-visible output, logs, or telemetry as
  a result of this feature.
- **FR-016**: Concurrent key switches from different sessions MUST NOT corrupt the provider
  configuration file, and MUST leave a valid active key.
- **FR-017**: Providers whose credentials are supplied by a managed login flow MUST be excluded
  from rotation.
- **FR-018**: The per-key proxy MUST apply to every request issued while that key is active,
  including requests the agent makes for sub-agents, swarm batch items, and fallback tiers that
  bind to the same provider.

### Key Entities

- **Provider key set**: The named API keys configured for a provider plus the identifier of the
  currently active key.
- **Active key**: The key the provider will use for the next request; the target of rotation.
- **Rotation setting (`rotate_keys`)**: Per-provider opt-in that enables automatic key
  switching. Disabled by default.
- **Per-key proxy**: An optional network route attached to one API key; overrides the
  provider-level proxy for requests made with that key.
- **Provider proxy**: The existing provider-wide network route, used when the active key
  declares none.
- **Rotation cycle**: One pass through the provider's keys in definition order, wrapping at the
  end; exactly one full cycle is attempted per turn.
- **Key identity**: The human-readable label (name or identifier) used when reporting rotation;
  never the secret itself.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A goal-mode run against a provider with 8 keys where the first 7 are rate-limited
  completes without the user resending a message, provided at least one key succeeds.
- **SC-002**: With 8 keys where the first 7 are refused, the eighth key is used for the retry
  and the turn succeeds, with the user-visible transcript showing a rotation notice per switch.
- **SC-003**: After a successful rotation, the active key recorded in the configuration file is
  the key that served the successful request (verified by reading the file back).
- **SC-004**: With rotation disabled — the default — a rate-limited or refused request produces
  exactly the same outcome and user-visible output as before this feature.
- **SC-005**: A key that declares its own proxy routes through that proxy, and a key that does
  not routes through the provider proxy, verified by observing the egress used for each key.
- **SC-006**: Adding a key through the provider manager completes in the same number of steps as
  today plus exactly one optional proxy question.
- **SC-007**: No API key secret appears in session output, log files, or telemetry events
  produced while rotating (checked by scanning the produced text for the secret values).
- **SC-008**: A full rotation cycle through 8 keys adds no more than one extra request per key
  beyond the configured retry budget for the failing key.

---

## Assumptions

- The existing retry budget for a single key remains 10 attempts (current default); rotation is
  evaluated only after that budget is exhausted, or immediately on a refusal.
- "Refused (403)" is treated as key-level by default. A refusal that is actually about the
  account's model entitlement still rotates once and then hands off to the existing fallback
  path, so the behavior degrades to today's outcome rather than looping.
- Key order is the order in which keys appear in the provider's configuration; the cycle wraps
  from the last key back to the first.
- The active key is persisted by the same configuration-writing path the provider manager
  already uses, so other sessions and restarts see it.
- Rotation is opt-in per provider and defaults to off; users with a single key are unaffected.
- Managed/OAuth providers (`managed:*`) are out of scope: their credentials are refreshed by the
  login flow, not by selecting a stored key.
- Per-key proxy values are plain network addresses without embedded credentials; secret handling
  rules that apply to keys apply to any credentials a user embeds in a proxy value.
- The feature covers the main agent loop and every other request path that binds to the provider
  (sub-agents, swarm batch items, fallback tiers), since they all resolve credentials the same
  way.
- No new external dependency is introduced; the configuration section, provider manager dialog,
  and retry machinery already exist.

---

## Notes

- The user's `~/.kimi-code/config.toml` already contains `[providers.kilo.api_keys.key1..key8]`
  and `[providers.opencode.api_keys.key1..key8]`, each with `key` and `name`, plus a
  provider-level `proxy_url` and an `active_api_key_id` — this feature extends that structure
  rather than introducing a new one.
- The existing `/substitute-model` and fallback-model chains remain the last resort; rotation
  only pre-empts them when it is enabled and usable keys remain.
- This specification deliberately stops at observable behavior: file formats, function
  placement, and event names belong to the planning phase.
