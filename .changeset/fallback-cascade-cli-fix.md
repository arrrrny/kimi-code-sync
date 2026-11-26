---
"@moonshot-ai/kimi-code": patch
---

Fix the experimental fallback model cascade so a fallback on another provider connects and the secondary fallback runs when the first one is unavailable. Enable it with the `fallback-model` experiment flag.