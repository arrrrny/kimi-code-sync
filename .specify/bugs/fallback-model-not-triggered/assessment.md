# Bug Assessment: OpenAI-compatible model enrichment not working — context defaults

- **Slug**: `fallback-model-not-triggered` (repurposed: this is now about enrichment)
- **Created**: 2026-09-03
- **Source**: pasted text
- **Verdict**: likely valid, needs reproduction
- **Severity**: high

## Report (verbatim)

> Error: [provider.api_error] Error: [object Object] I got this after 10 tries, it was expected, what was not expected is that why the fuck the /fallback-model did not kick in after model failed? check the /compact when squeeze-model fails squeeze-model-secondary kicks in perfectly.
>
> [Follow-up] I confirm it works, what does not work is that when I refresh catalog, opencode models are not enriched properly. this was supposedly fixed recently check recent PR merges. because it is not enriched all models get default fallback 128K context. for sanity first make that fallback to 256K, open a PR for that now, and then fix the enrichment issue. it is about the model ids names. check models.dev and check the opencode models. also we can have an aggregated catalog locally since openrouter and kilo propagate correctly. the only difference is it is deepseek-v4-flash-free on opencode deepseek-v4-flash:free on kilo and openrouter. you can convert that -free into :free first check catalog, if no match strip -free entirely check catalog and it will definitely match.

## Symptom

After running `/refresh-catalog` for an opencode provider, models are not enriched with context lengths from the models.dev catalog. All models get the default fallback context size (user reports 128K). OpenRouter and Kilo providers enrich correctly.

## Verified Data (from models.dev/api.json)

### Provider keys that exist in models.dev:
- `opencode` — has `deepseek-v4-flash` (1M), `deepseek-v4-flash-free` (200K), and many more
- `opencode-go` — has `deepseek-v4-flash` (1M), `deepseek-v4-flash-vision-exp` (1M)
- `kilo` — uses `:free` suffix convention (e.g., `nvidia/nemotron-3.5-lightning:free`)
- `openrouter` — uses `:free` suffix convention

### Key model ID differences:
| Provider | Free model ID convention | Example |
|----------|------------------------|---------|
| opencode | `-free` suffix | `deepseek-v4-flash-free` |
| opencode-go | No free variants listed | `deepseek-v4-flash` |
| kilo | `:free` suffix | `nvidia/nemotron-3.5-lightning:free` |
| openrouter | `:free` suffix | `cohere/north-mini-code:free` |

## Reproduction

1. Configure an opencode provider in config.toml
2. Run `/refresh-catalog`
3. Check the `maxContextSize` on the resulting model aliases
4. **Expected**: Enriched context from models.dev (e.g., `deepseek-v4-flash-free` → 200K, `deepseek-v4-flash` → 1M)
5. **Actual**: Default fallback context applied (user reports 128K; code default is 256K)

[NEEDS CLARIFICATION: Is the actual default seen 128K or 256K? The code default `OPENAI_COMPATIBLE_DEFAULT_CONTEXT` is 262144 (256K). The 128K default only exists in `CUSTOM_REGISTRY_DEFAULT_MAX_CONTEXT` for custom registries.]

## Suspected Code Paths

### The enrichment chain (verified working in code):
- `packages/oauth/src/refreshProviderModels.ts:889` — calls `applyOpenAiCompatibleCatalog(next, providerId, filteredModels, aliasPrefix)`
- `packages/oauth/src/managed-kimi-code.ts:724-775` — `applyOpenAiCompatibleCatalog()`: iterates models, calls `lookupModelsDevModel()`, resolves `maxContextSize` with 4-tier fallback
- `packages/oauth/src/modelsDevCatalog.ts:117-130` — `lookupModelsDevModel()`: tries exact match, `:free` strip, `-free` strip
- `packages/oauth/src/openai-compatible.ts:9` — `OPENAI_COMPATIBLE_DEFAULT_CONTEXT = 262144` (256K)

### The `-free` → strip fallback (ALREADY IMPLEMENTED):
```typescript
// packages/oauth/src/modelsDevCatalog.ts:122-124
return (
  modelInfoFrom(entry, modelId) ??
  modelInfoFrom(entry, modelId.replace(/:free$/i, '')) ??
  modelInfoFrom(entry, modelId.replace(/-free$/i, ''))
);
```
For `deepseek-v4-flash-free` on opencode:
1. `modelInfoFrom(entry, "deepseek-v4-flash-free")` → **HIT** (opencode catalog has this exact ID, context: 200K)
2. No fallback needed — the exact match works.

### What SHOULD happen for opencode models:
- `deepseek-v4-flash-free` → exact match in opencode catalog → context: 200,000
- `deepseek-v4-flash` → exact match in opencode catalog → context: 1,000,000
- The enrichment chain correctly pulls from models.dev.

## Root Cause Hypothesis

**Confidence: medium**

The code logic appears correct — the enrichment chain, catalog lookup, and `-free` fallback all look functional. The issue may be:

**Hypothesis 1 (most likely): Provider ID mismatch.**
If the user configured the opencode provider with a key that doesn't match the models.dev catalog entry (`opencode` or `opencode-go`), the enrichment silently fails. The `entryFor()` function returns `undefined` for unknown provider IDs, and the whole enrichment falls through to the 256K default.

**Hypothesis 2: The `/models` endpoint is not returning model IDs.**
If opencode's `/models` endpoint returns no data (or only `id` fields without models), `fetchOpenAIProviderModels` produces an empty list, and `applyOpenAiCompatibleCatalog` has nothing to enrich. The stale curated entries would keep whatever `maxContextSize` they had (possibly 128K from a custom registry import).

**Hypothesis 3: Stale cached config.**
The enrichment writes to `config.models[alias].maxContextSize`. If the user's config file was created by an older custom-registry import (which uses 128K default), and the `existingMaxContextSize` in the enrichment chain picks up the old 128K value before the catalog lookup, the catalog result is ignored.

## Proposed Remediation

**Quick fix (sanity default):**
The `OPENAI_COMPATIBLE_DEFAULT_CONTEXT` is already 262144 (256K), not 128K. If the user sees 128K, the issue is in the custom registry path (`CUSTOM_REGISTRY_DEFAULT_MAX_CONTEXT = 131072`). To change the custom registry default:
- `packages/oauth/src/custom-registry.ts:66` — change `131072` to `262144`

**Enrichment fix:**
Need to verify the actual `providerId` passed at runtime. If it doesn't match `opencode` or `opencode-go`, the catalog lookup fails. Consider:
1. Adding debug logging to `lookupModelsDevModel` when no catalog entry is found
2. Or checking if the provider ID is being transformed somewhere in the refresh chain

**Files likely to change:**
- `packages/oauth/src/custom-registry.ts` — change default to 256K if that's the goal
- `packages/oauth/src/modelsDevCatalog.ts` — potential enrichment fix
- `packages/oauth/src/refreshProviderModels.ts` — potential provider ID resolution fix

**Tests to add or update:**
- Test that `lookupModelsDevModel("opencode", "deepseek-v4-flash-free")` returns context: 200000
- Test that `lookupModelsDevModel("opencode", "deepseek-v4-flash")` returns context: 1000000
- Test that `applyOpenAiCompatibleCatalog` produces correct `maxContextSize` for opencode models

## Risks & Considerations

- Changing `CUSTOM_REGISTRY_DEFAULT_MAX_CONTEXT` from 128K to 256K affects ALL custom registries, not just opencode — this is a broader default change.
- The user's suggestion of a "local aggregated catalog" is a separate feature (having models.dev data bundled with the app for offline enrichment).
- The `-free` → `:free` conversion is NOT needed — the existing code already handles both conventions.
- The enrichment works correctly for providers whose IDs match the models.dev catalog keys. The issue is likely provider-ID resolution, not catalog data.

## Open Questions

- [NEEDS CLARIFICATION: What is the exact `providerId` stored in config.toml for the opencode provider? Is it `opencode`, `opencode-go`, or something else?]
- [NEEDS CLARIFICATION: What exact context size do the models show after `/refresh-catalog`? 128K (131072) or 256K (262144)?]
- [NEEDS CLARIFICATION: Do the opencode models show any context size at all, or is it 0/unknown?]
