# Quickstart: validating Provider API Key Rotation with Per-Key Proxy

Every scenario below is runnable on a fresh checkout of `831-api-key-rotation`. Scenarios 1–6 are
targeted vitest runs; scenario 7 is the one that proves the feature end to end through the real CLI,
real HTTP, and a real `config.toml`. Commands assume the repo root; write scratch files under
`.tmp/` (gitignored) — never into the source tree.

Prerequisite for the whole page: `pnpm install` has been run and Node is `>= 24.15.0`.

---

## Scenario 1 — a rate-limited key rotates, and the cycle is bounded (SC-001, SC-002, SC-008; FR-002, FR-004, FR-006, FR-008)

```bash
pnpm vitest run packages/agent-core-v2/src/human/test/agent/turn.test.ts -t rotation
```

Setup inside the test: a turn machine whose credential provider exposes a rotation controller over a
scripted 8-key set, with a requester stub that answers 429 for every key but the last, and a retry
budget small enough to keep the test fast (`maxAttemptsPerStep: 2`).

Expected observations, in order:

1. The first key is retried exactly `maxAttemptsPerStep` times before any rotation is proposed
   (proves FR-002's "after the retry budget is exhausted").
2. Each rotation emits `llm.recovering` with `strategy: 'api_key_rotation'` and an `action` naming the
   new key, and the following attempt carries that key's credential (FR-014).
3. The failing key is never revisited inside the step, and after `keyCount - 1` rotations the machine
   stops proposing and fails the step (FR-008) — assert the proposal count, not just the outcome.
4. The turn reports `done` on the last key without the caller re-submitting anything (FR-006).

## Scenario 2 — a refusal rotates immediately (SC-002; FR-003)

```bash
pnpm vitest run packages/agent-core-v2/src/human/test/credentials/keyRotationRecovery.test.ts
```

Assert on the pure strategy: an HTTP 403 with `attempt === 1` and `maxAttempts === 10` yields a
proposal (no retry budget consumed); a 429 with `attempt === 3, maxAttempts === 10` yields none; a 429
with `attempt === 10` yields one; a 401, a `quota_exhausted`, a context-overflow, and a transport
error yield none. Also assert the bound: with `appliedRecoveries` already holding `keyCount - 1`
rotation records, the proposal is `undefined`.

## Scenario 3 — rotation off is byte-identical to today (SC-004; FR-001, FR-013)

```bash
pnpm vitest run packages/agent-core-v2/src/human/test/agent/turn.test.ts -t "rotation disabled"
```

The same 3-key provider with `rotateKeys` absent, and again with a single key and `rotateKeys: true`.
Expected: zero rotation records, zero `llm.recovering` events with the rotation strategy, and — the
part that matters — no write to the provider config at any point (assert the `set` spy was never
called).

## Scenario 4 — the per-key proxy follows the active key (SC-005; FR-009, FR-010, FR-018)

```bash
pnpm vitest run packages/agent-core-v2/test/llm-adapter/model/credentialProxyCascade.test.ts
```

The test stands up three listeners: the provider endpoint, `proxy-a` and `proxy-b`. The provider has
`proxy_url = proxy-a` and two keys where `key2.proxyUrl = proxy-b`. Each proxy records the
`Authorization` header of the request it forwards and answers a canned completion.

Expected: a request on `key1` egresses via `proxy-a`; after switching the active key to `key2` — by
calling the same `IProviderService` path rotation uses, not by rebuilding the catalog — the very next
request egresses via `proxy-b` with `key2`'s secret; with both proxies unset the request reaches the
endpoint directly. The same assertions are repeated for a request issued through the catalog's direct
caller (`IModelCatalog.generate`), which is the path ping/compaction/sub-agent-style callers share
(FR-018).

## Scenario 5 — the new active key is persisted and loaded back (SC-003; FR-005, FR-012)

```bash
pnpm vitest run packages/agent-core-v2/test/llm-adapter/provider/apiKeyRotation.test.ts
```

Against a temp config home: rotate from `key1` to `key2`, then read the file back and assert
`active_api_key_id = "key2"` while every other field of the provider section — including the untouched
`proxy_url` values and any unknown keys — is unchanged. Then assert the loop closes: a fresh load of
the file yields `activeApiKeyId === 'key2'`, and the next `resolve()` returns `key2`'s secret.

Same file, concurrency half (FR-016): fire two `rotate('key1')` calls concurrently and assert exactly
one advance (the second reports `already-advanced`); fire two rotations for two different providers
concurrently and assert neither section clobbers the other.

## Scenario 6 — the provider manager asks for the proxy (SC-006; FR-011, FR-012)

```bash
pnpm vitest run apps/kimi-code/test/tui/commands/provider.test.ts apps/kimi-code/test/tui/components/provider-manager.test.ts
```

Assert: the add-key flow prompts name → secret → proxy (exactly one extra question); submitting an
empty proxy writes a key entry without `proxyUrl`; submitting a proxy writes it; cancelling the proxy
prompt writes nothing; invalid input is rejected and re-prompted; the key row shows the proxy host and
the source row shows the rotation state; `R` on a single-key provider writes nothing.

## Scenario 7 — end to end through the real CLI (SC-001, SC-002, SC-005, SC-007)

This is the scenario the feature was requested for: a long-running, non-interactive run against a
provider whose first key is rate-limited, with two keys configured.

### 7.1 Stub provider (`.tmp/rotation-e2e/server.mjs`)

```js
import http from 'node:http';

const badKeys = new Set(['sk-alpha']);
const log = [];
http.createServer((req, res) => {
  const auth = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  log.push({ auth, url: req.url, via: req.headers['x-via-proxy'] ?? 'direct' });
  if (badKeys.has(auth)) {
    res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '0' });
    res.end(JSON.stringify({ error: { message: 'rate limited', type: 'rate_limit_error' } }));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const chunk = (delta, finish) =>
    `data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', created: 0, model: 'stub-1', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
  res.write(chunk({ role: 'assistant', content: 'pong' }, null));
  res.write(chunk({}, 'stop'));
  res.write('data: [DONE]\n\n');
  res.end();
}).listen(8787, '127.0.0.1', () => console.error('stub on 8787'));
process.on('SIGTERM', () => {
  console.error(JSON.stringify(log, null, 2));
  process.exit(0);
});
```

### 7.2 Throwaway config home (`.tmp/rotation-e2e/home/config.toml`)

```toml
default_model = "stub-model"
default_provider = "stub"

[providers.stub]
type = "openai"
base_url = "http://127.0.0.1:8787/v1"
active_api_key_id = "key1"
rotate_keys = true

[providers.stub.api_keys.key1]
key = "sk-alpha"
name = "alpha"

[providers.stub.api_keys.key2]
key = "sk-beta"
name = "beta"

[models.stub-model]
provider = "stub"
model = "stub-1"
max_context_size = 8192
```

### 7.3 Run

```bash
node .tmp/rotation-e2e/server.mjs &                 # note the PID
KIMI_CODE_HOME="$PWD/.tmp/rotation-e2e/home" \
  pnpm -C apps/kimi-code run dev -- -p "reply with pong" 2>&1 | tee .tmp/rotation-e2e/out.txt
```

### 7.4 Expected observations

- The run completes and prints the assistant's reply; the user never resends anything (SC-001).
- `out.txt` reports at least one rotation naming the provider and the new key (`key2`, "beta"), and
  contains no `sk-alpha` / `sk-beta` substring (FR-014, FR-015, SC-007 — the check below makes this
  mechanical).
- `.tmp/rotation-e2e/home/config.toml` now has `active_api_key_id = "key2"` (SC-003).
- The stub's stderr log shows the successful request authenticated with `sk-beta`.

```bash
grep -E 'api-key-rotation|rotate' .tmp/rotation-e2e/out.txt     # expect >= 1 hit
grep -c 'sk-alpha\|sk-beta' .tmp/rotation-e2e/out.txt           # expect 0
grep 'active_api_key_id' .tmp/rotation-e2e/home/config.toml     # expect key2
```

### 7.5 Per-key proxy variant (SC-005)

Add a second key-level proxy to the config (`proxy_url` under `[providers.stub.api_keys.key2]`,
pointing at a local listener that forwards and sets `x-via-proxy`), move `sk-alpha` out of `badKeys`
so `key2` is never used, then flip `active_api_key_id` to `key2` and re-run: the stub must log
`via: 'x-via-proxy'` for that run only.

### 7.6 Full-cycle variant (SC-002)

Set `rotate_keys = true` and put every key but the last into `badKeys`; the run must still succeed
using the last key, with one rotation notice per switch. Then put *every* key into `badKeys`: the run
must fail after one pass over the key list (no infinite rotation), and the failure must be the same
ProviderError a run with rotation disabled produces.

### 7.7 Teardown

```bash
kill %1 || true     # the stub server
rm -rf .tmp/rotation-e2e
```

---

## Scenario 8 — the repo gates

```bash
pnpm lint                                                    # includes scripts/check-no-comments.mjs
pnpm -r --filter './packages/*' run typecheck                 # engine + SDK + klient
pnpm vitest run packages/agent-core-v2/src/human/test/agent/turn.test.ts \
               packages/agent-core-v2/src/human/test/credentials \
               packages/agent-core-v2/test/llm-adapter \
               apps/kimi-code/test/tui
```

`pnpm gen:config-manifest` must be re-run (and the generated
`packages/agent-core-v2/docs/config-manifest.toml` committed) after the config-section change; its
freshness test is `packages/agent-core-v2/test/app/config/configManifest.test.ts`.

Do not run the full suite as part of this feature's validation — the suites above cover every changed
line, and the repo's own guidance is to run targeted tests.

## Coverage map

| Scenario | Requirements / criteria |
|---|---|
| 1 | FR-002, FR-004, FR-006, FR-008, FR-014 · SC-001, SC-002, SC-008 |
| 2 | FR-003, FR-007, FR-008 · FR-013 (non-triggers) |
| 3 | FR-001, FR-013 · SC-004 |
| 4 | FR-009, FR-010, FR-018 · SC-005 |
| 5 | FR-005, FR-012, FR-016 · SC-003 |
| 6 | FR-011, FR-012 · SC-006 |
| 7 | FR-002, FR-005, FR-014, FR-015 · SC-001, SC-002, SC-003, SC-005, SC-007 |
| 8 | repo gates |

Not covered by an automated scenario today, and to be checked by hand during review: a refusal that is
actually about the account's model entitlement (rotates once, then behaves like today), and the
"several sessions, one provider, real-time" case across two OS processes (asserted in-process in
scenario 5; cross-process behavior rests on the config service's per-domain read-merge-write and file
watch).
