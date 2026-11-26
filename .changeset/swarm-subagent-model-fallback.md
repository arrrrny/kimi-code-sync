---
"@moonshot-ai/kimi-code": patch
---

Swarm subagents now switch to the session's current model when resumed, and inherit the session's fallback model settings. The fallback inheritance applies to every subagent kind — plain `Agent`-tool subagents and tower workers too, not only swarm items — so a child follows the same fallback mechanism as its parent.
