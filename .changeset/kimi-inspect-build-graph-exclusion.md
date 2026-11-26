---
"@moonshot-ai/kimi-code": patch
---

Suspend the `kimi-inspect` web inspector from the root build and lint graphs. The 2026-11 upstream restructure removed the `@moonshot-ai/transcript` package and the `/api/v1` transcript surface the inspector's client was built on (replaced by the kap-server conversation feed), so the app no longer compiles. The app's source stays in the tree untouched; root `pnpm build` filters it (`--filter=!@moonshot-ai/kimi-inspect`) and `.oxlintrc.json` ignores it until the inspector is ported onto the conversation feed as a follow-up.
