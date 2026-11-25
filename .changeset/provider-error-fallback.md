---
"@moonshot-ai/kimi-code": minor
---

Retry the turn on a configured fallback model when the provider returns an error, times out, or the connection or quota fails, once API key rotation is exhausted; enable the `fallback-model` experiment and set `[fallback_model] model` (and optionally `secondary_model`).