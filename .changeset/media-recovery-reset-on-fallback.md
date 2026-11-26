---
"@moonshot-ai/kimi-code": patch
---

Reset the media-recovery latches when the fallback model takes over. An image the primary model rejects as unsupported or too large is stripped and retried; if that retry then fails and the request cascades to the fallback model, the fallback gets the full media again and may strip it too, instead of failing the turn — or resending the same rejected image indefinitely when `KIMI_CODE_INFINITE_RETRY` is on.
