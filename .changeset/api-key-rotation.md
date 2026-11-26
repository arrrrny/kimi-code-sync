---
"@moonshot-ai/kimi-code": minor
---

Add automatic API key rotation for providers with several keys. Set `rotate_keys = true` under `[providers.<name>]`, and give a key its own `proxy_url` if it needs a different proxy.
