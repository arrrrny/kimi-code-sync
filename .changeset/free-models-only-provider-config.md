---
"@moonshot-ai/kimi-code-oauth": patch
---

Fix `free_models_only` filter not applied on catalog refresh. The config TOML key was being read with snake_case (`free_models_only`) after TOML parsing converts all keys to camelCase (`freeModelsOnly`), so the filter was silently never triggered.
