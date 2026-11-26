---
"@moonshot-ai/agent-core-v2": patch
---

Fix the fallback-model recovery to carry the fallback provider's endpoint through the model swap, so a cross-provider fallback is sent to the fallback provider's base URL instead of failing with an unknown-model error, and classify a model-not-found status error as cascade-eligible so the secondary tier is attempted.