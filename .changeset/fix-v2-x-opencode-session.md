---
"@moonshot-ai/agent-core-v2": patch
---

Send `x-opencode-session` on outbound LLM requests in agent-core-v2 so the OpenCode Go managed-inference API can route conversations correctly. The header is set only for Kimi providers (`providerType === 'kimi'`) using the session ID that was already carried in the request body as `prompt_cache_key` / `metadata.user_id`. Direct Anthropic, OpenAI, and Google requests are unaffected.
