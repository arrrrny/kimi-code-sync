---
"@moonshot-ai/kimi-code": minor
---

Add an experimental compaction handoff: before an automatic context compaction, a structured handoff document is saved beside the session records and the completion message points at it. Enable with `KIMI_CODE_EXPERIMENTAL_COMPACTION_HANDOFF=1`.
