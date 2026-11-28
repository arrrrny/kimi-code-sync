---
"@moonshot-ai/kimi-code": minor
---

Experimental compaction handoffs now anchor on the session's original prompt and list every earlier handoff document from the session, oldest first. Set `KIMI_CODE_EXPERIMENTAL_COMPACTION_HANDOFF=1` to enable.

`IAgentHandoffDocumentService` gains a required `allHandoffPaths()` member, derived from `resumePointer()` and listed with the package's exports. This is a compile-time break for external implementers of the interface: implement the one added method. It is `minor` rather than `patch` for that reason.
