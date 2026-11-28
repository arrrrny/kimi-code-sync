# Bug Fix: Fallback model cascade fails on valid models and never reaches the secondary tier

- **Slug**: fallback-cascade-unknown-model
- **Fixed**: 2026-11-25
- **Assessment**: ./assessment.md
- **Status**: applied
- **Branch**: fix/fallback-cascade-unknown-model
- **Revision**: 499ad29af

## Summary

The fallback recovery swapped the model + protocol but kept the primary request's
endpoint, so a cross-provider fallback sent the fallback model name to the primary
provider's base URL and got `404 Unknown Model`; and because that 404 classifies as
error `kind: 'status'` (not in the fallback-eligible set), the cascade stopped instead
of advancing to the secondary tier. The fix carries the rebuilt endpoint through the
swap and treats a model-not-found status error as cascade-eligible.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `packages/agent-core-v2/src/session/fallback/recovery.ts` | modified | `FallbackModelSwap` gains `endpoint?`; rewrite sets `endpoint: swap.endpoint ?? request.endpoint`; new `isModelNotFound()` makes a 404 / "Unknown Model" status error eligible so the cascade advances to the secondary tier |
| `packages/agent-core-v2/src/agent/loop/loopService.ts` | modified | `resolveSwap` returns `endpoint: rebuilt.endpoint` (the fallback provider's resolved base URL + credentials) |
| `packages/agent-core-v2/test/session/fallback/recovery.test.ts` | added tests | U9 (rewrite swaps endpoint), U10 (model-not-found 404 → secondary) |

## Diff Highlights

```ts
// recovery.ts
export interface FallbackModelSwap {
  readonly model: LlmRequestModel;
  readonly protocol?: LlmRequest['protocol'];
  readonly endpoint?: LlmRequest['endpoint'];
}

function isModelNotFound(error: LlmErrorMessage): boolean {
  if (error.kind !== 'status') return false;
  if (error.statusCode === 404) return true;
  return /unknown model|model\s+(?:not found|does not exist)|please check the model code/i.test(error.message);
}

// propose(): ... else if (!FALLBACK_ELIGIBLE_KINDS.has(ctx.error.kind) && !isModelNotFound(ctx.error)) return undefined;
// rewrite:  { ...request, model: swap.model, protocol: swap.protocol ?? request.protocol, endpoint: swap.endpoint ?? request.endpoint }

// loopService.ts resolveSwap
return { model: rebuilt.model, protocol: rebuilt.protocol, endpoint: rebuilt.endpoint };
```

## Tests Added or Updated

- `test/session/fallback/recovery.test.ts::U9` — the recovery rewrite overrides `request.endpoint` with the swap endpoint.
- `test/session/fallback/recovery.test.ts::U10` — a `status`/404 (and a 400 "Unknown Model") error is eligible and advances from fallback #1 to the secondary tier.

## Local Verification

- `pnpm --filter @moonshot-ai/agent-core-v2 exec vitest run test/session/fallback/recovery.test.ts` → 13 passed.
- `pnpm --filter @moonshot-ai/agent-core-v2 typecheck` → no errors in the three changed files (remaining errors are pre-existing missing-module issues in untouched files: `@moonshot-ai/testkit`, `uuid`, `pathe` not installed in this checkout).
- `test/agent/loop/loop.test.ts` → 75 passed (after `pnpm install` populated the
  previously-missing `uuid`/`pathe` deps), confirming the `resolveSwap` change is
  regression-free.

## Deviations from Assessment

None. Implemented the preferred remediation (carry endpoint through the swap; narrow
model-not-found eligibility for the cascade) exactly as proposed.

## Follow-ups

- The base-image idea (`proxy-node-lean`) from the report is not needed — the models
  are valid; the defect was the dropped endpoint + error-kind gate.
- Confirm the exact HTTP status providers return for "Unknown Model" (400 vs 404) from
  an `/export-debug-zip`; the fix handles both (404 by status, 400 by message).
- If the full `loop.test.ts` run is desired, install the workspace deps (`pnpm install`)
  so `uuid`/`pathe`/`@moonshot-ai/testkit` resolve.