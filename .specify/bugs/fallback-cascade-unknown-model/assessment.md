# Bug Assessment: Fallback model cascade fails on valid models and never reaches the secondary tier

- **Slug**: fallback-cascade-unknown-model
- **Created**: 2026-11-25
- **Source**: pasted text (terminal transcript + freeform description)
- **Verdict**: valid
- **Severity**: high

## Report (verbatim or summarized)

The user enabled the experimental per-provider fallback model cascade
(`KIMI_CODE_EXPERIMENTAL_FALLBACK_MODEL` / `[fallbackModel]` config). Two distinct
failures were observed:

1. **Valid fallback models return `[provider.api_error] Unknown Model`.** Every
   configured fallback tier (`opencode-go/mimo-v2.6-flash`,
   `cliproxy/claude-sonnet-4-5-20250929`, `cliproxy/gemini-3.5-flash-lite`,
   `mistral/deepseek-v4-1-flash-1017`, `kimi-code/kimi-for-coding`) fails with
   `Unknown Model, please check the model code` even though the user states the
   models are valid.
2. **The secondary fallback tier is never tried after the first fallback fails.**
   When fallback #1 errors, the cascade stops and surfaces the error instead of
   advancing to the configured secondary fallback.

Representative transcript (condensed; the user reconfigured tiers between turns):

```
Warning: glm-5.3-flash → opencode-go/mimo-v2.6-flash
Error: [provider.api_error] Unknown Model, please check the model code. ...
Fallback model set to Gemini 3.5 Flash Lite. ...
Secondary fallback model set to Gemini 3.5 Flash Lite. ...
❯ pls resume
Warning: glm-5.3-flash → cliproxy/claude-sonnet-4-5-20250929
Error: [provider.api_error] Unknown Model, ...
❯ pls continue
Warning: glm-5.3-flash → cliproxy/gemini-3.5-flash-lite
Error: [provider.api_error] Unknown Model, ...
```

The user notes the **compaction "squeeze" cascade works correctly** (model 1 →
secondary), and asks whether a leaner base image (without opencode/kimi baked in)
is needed. As shown below, the base image is not the cause.

## Symptom

When the primary model fails with an eligible error, the fallback cascade swaps in
a configured fallback model but sends the request to the **primary provider's
endpoint** with the **fallback model's name**, so the provider returns HTTP 404
`Unknown Model`. Because that 404 is classified as error `kind: 'status'`, which is
**not** in the fallback-eligible set, the cascade halts and never advances to the
secondary tier. Expected: a cross-provider fallback is sent to the fallback
provider's own endpoint, and a failing fallback tier yields to the next tier.

## Reproduction

1. Enable the fallback flag and configure a primary model on provider A plus a
   fallback (and secondary fallback) on a **different** provider B/C, e.g.
   `glm-5.3-flash` primary with `cliproxy/...` fallback.
2. Drive the primary into an eligible failure (provider/timeout/connection/quota).
3. Observe the `Warning: <primary> → <fallback>` line, then
   `Error: [provider.api_error] Unknown Model`.
4. Observe that the secondary fallback is never attempted within the turn; the
   error is surfaced to the user.

(Exact HTTP status the providers return for "Unknown Model" — 400 vs 404 — is
[NEEDS CLARIFICATION: confirm from an `/export-debug-zip`; both map to `kind:
'status'`, so the analysis holds either way].)

## Suspected Code Paths

- `packages/agent-core-v2/src/session/fallback/recovery.ts:18-21` —
  `FallbackModelSwap` carries only `model` + `protocol`; it has **no `endpoint`
  field**, so a swap cannot transport the fallback provider's endpoint.
- `packages/agent-core-v2/src/session/fallback/recovery.ts:83-92` — the recovery
  `rewrite` does `{ ...request, model: swap.model, protocol: swap.protocol ??
  request.protocol }`, keeping the **primary's** `request.endpoint`.
- `packages/agent-core-v2/src/agent/loop/loopService.ts:756-767` — `resolveSwap`
  calls `protocolRegistry.request(model, …)` (which builds the correct endpoint)
  but returns only `{ model: rebuilt.model, protocol: rebuilt.protocol }`,
  **discarding `rebuilt.endpoint`**.
- `packages/agent-core-v2/src/llm-adapter/protocol/protocolAdapterRegistry.ts:153-169`
  — `request()` sets `endpoint = { ...base.endpoint, ...model.endpoint, credentials }`,
  i.e. the rebuilt request *does* carry the fallback provider's base URL + auth.
- `packages/core/src/llm/generate.ts:218-222` — the live HTTP call resolves its
  `baseUrl` from `request.endpoint` (not from `model.spec.provider`), so a stale
  endpoint sends the request to the wrong host.
- `packages/agent-core-v2/src/session/fallback/recovery.ts:33-38` —
  `FALLBACK_ELIGIBLE_KINDS = {provider, timeout, connection, quota_exhausted}`;
  `status` is absent.
- `packages/agent-core-v2/src/llm-adapter/contract/errors.ts:110-163, 400-408,
  762-791` — an HTTP 400/404 becomes an `APIStatusError` whose `code` is
  `provider.api_error` (rendered `[provider.api_error]`) but whose `kind`, via
  `llmMessageFromError`, is **`status`** (the `instanceof APIStatusError` branch
  precedes the generic `ChatProviderError → provider` branch).
- `packages/agent-core-v2/src/agent/fullCompaction/squeezeCascade.ts:21-53` — the
  working reference: it resolves an **alias** and the caller rebuilds the entire
  request through the normal binding path (`bindRequester` →
  `protocolRegistry.request(model, …)`), so the endpoint is always correct.

## Root Cause Hypothesis

**Confidence: high.** Two independent defects compose into the observed behavior.

**Issue 1 — endpoint not swapped (cross-provider "Unknown Model").** The fallback
recovery rebuilds the request through `protocolRegistry.request`, which correctly
produces the fallback provider's endpoint, but `resolveSwap` returns only
`{ model, protocol }` and `FallbackModelSwap` has no `endpoint` field, so the
recovery `rewrite` keeps the primary's `request.endpoint`. The fallback model name
is therefore sent to the **primary** provider's base URL, which returns 404
`Unknown Model`. Same-provider fallbacks happen to share a base URL and work;
every cross-provider tier in the report fails. This is why the models are "valid"
(the catalog resolves them and the squeeze cascade uses them) yet still error.

**Issue 2 — `status` is not fallback-eligible (secondary never tried).** The 404
`Unknown Model` is classified as `kind: 'status'`, which is not in
`FALLBACK_ELIGIBLE_KINDS` and is not an auth rejection (401/403). So when fallback
#1 fails, `createFallbackModelRecovery.propose` returns `undefined`, the recovery
loop stops, and the secondary tier is never proposed. (The *primary's* first
failure was an eligible kind, which is why fallback #1 fired at all.)

The base-image hypothesis is **not** the cause: the catalog resolves these models
and the compaction squeeze cascade uses the same models successfully in the same
environment; the defect is the dropped endpoint plus the error-kind gate.

## Proposed Remediation

**Preferred (fixes both observed failures):**

1. **Carry the endpoint through the swap (Issue 1).** Add
   `readonly endpoint?: LlmRequest['endpoint']` to `FallbackModelSwap`; have
   `resolveSwap` return `endpoint: rebuilt.endpoint`; and have the rewrite set
   `endpoint: swap.endpoint ?? request.endpoint` (mirroring the existing
   `protocol` handling). This routes a cross-provider fallback to its own base URL
   + credentials, exactly as the squeeze/bind path already does. Reuse the existing
   `protocolRegistry.request(model, …)` output rather than re-deriving the endpoint.
2. **Let a failing tier yield to the next (Issue 2).** Treat a model-not-found 404
   from a fallback attempt as cascade-eligible so the secondary is tried. Prefer a
   **narrow** rule (recognize 404 / "unknown model" as eligible) over adding all of
   `status`, to avoid making the cascade fire on generic 400 malformed-request
   errors that would fail on every provider. Once (1) lands, the reported scenario
   no longer 404s, but (2) is still a real gap for a genuinely unavailable tier.

**Alternatives:**
- Rebuild the whole fallback request through the normal binding path
  (`bindRequester`/`requestConfigSnapshotFor(alias)`), like the squeeze cascade,
  instead of piecemeal model/protocol/endpoint — larger change, but eliminates the
  "forgot a field" class of bug.
- Broaden `FALLBACK_ELIGIBLE_KINDS` to include `status` wholesale — simplest, but
  risks wasteful cross-provider retries on non-recoverable 4xx.

**Files likely to change:**
- `packages/agent-core-v2/src/session/fallback/recovery.ts`
- `packages/agent-core-v2/src/agent/loop/loopService.ts`
- `packages/agent-core-v2/test/session/fallback/recovery.test.ts`
- (consider) a loopService/request-level test asserting the swapped endpoint.

**Tests to add or update:**
- `resolveSwap` propagates `rebuilt.endpoint`; the rewrite overrides
  `request.endpoint` (unit, extend the existing `deps()` harness with an endpoint).
- Cross-provider swap: resulting request `endpoint.baseUrl` equals the fallback
  provider's base URL, not the primary's.
- Cascade advances to the secondary tier when fallback #1 fails with a
  model-not-found 404 (`kind: 'status'`).
- Preserve existing contracts: U7 (unresolvable alias still skipped) and
  "ignores non-retryable client errors" (genuinely non-eligible kinds still stop).

## Risks & Considerations

- **Eligibility widening**: making `status`/404 eligible can cause retries on
  errors that no model can satisfy; keep the rule narrow (model-not-found) and
  covered by a test.
- **Credential/rotation wiring**: the registry wraps `model.endpoint.credentials`
  (resolve/rotate/invalidate/canRecover); the swap must carry that wrapped
  endpoint, not a hand-built one, so key rotation keeps working on the fallback
  provider.
- **requestMetadata providers**: some providers add per-request headers in
  `resolveRequest` after binding; confirm the swapped endpoint does not drop those.
- **Recovery memory keying**: `routeKey` includes `endpoint.baseUrl`; fallback
  entries do not set `reuse`, so the memory cache is unaffected — verify no change.
- **Observability**: the `Warning: A → B` detail should still render; consider
  surfacing when a tier is skipped due to an ineligible error kind.

## Open Questions

- [NEEDS CLARIFICATION: exact HTTP status for "Unknown Model" (400 vs 404) — from
  `/export-debug-zip`; does not change the diagnosis but tunes the Issue-2 rule.]
- [NEEDS CLARIFICATION: product intent — should the cascade advance on any generic
  4xx, or only on model-not-found?]