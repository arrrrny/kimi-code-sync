---
"@moonshot-ai/agent-core-v2": patch
---

Always send `x-opencode-session` on outbound LLM requests in agent-core-v2 so the OpenCode Go managed-inference API can route conversations correctly. The header uses the session ID already carried in the request body as `prompt_cache_key` / `metadata.user_id`. Previously the header was only sent for `providerType === 'kimi'` or `'opencode'`, but OpenCode Go providers are configured with `type: 'openai'`, so the header was never sent for them.
