---
"@moonshot-ai/agent-core-v2": minor
---

Add a fallback-model recovery to the request pipeline: after key rotation is inapplicable or exhausted, a provider, timeout, connection, or quota-exhausted failure retries on the configured fallback model and then the secondary tier, skipping already-tried or unresolvable tiers and terminating once every tier is spent. The recovery is ordered after key rotation, so rate-limit and rejected-credential key rotation is unchanged.