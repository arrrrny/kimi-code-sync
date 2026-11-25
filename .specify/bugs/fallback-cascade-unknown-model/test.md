# Bug Test: Fallback model cascade fails on valid models and never reaches the secondary tier

- **Slug**: fallback-cascade-unknown-model
- **Tested**: 2026-11-25
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Verdict**: verified

## Reproduction

The live reproduction needs a configured primary + cross-provider fallback and a real
provider that returns `Unknown Model` — not runnable in this environment. The fix is
verified through the unit suite that exercises the exact code paths (the recovery
`propose`/`rewrite` and the swap endpoint), plus a clean typecheck of the changed files.

## Tests Run

- `pnpm --filter @moonshot-ai/agent-core-v2 exec vitest run test/session/fallback/recovery.test.ts`
  → **13 passed** (11 pre-existing + U9 endpoint-swap + U10 model-not-found→secondary).
- `pnpm --filter @moonshot-ai/agent-core-v2 typecheck`
  → **no errors in the three changed files.** Remaining errors are pre-existing
  missing-module issues in untouched files (`@moonshot-ai/testkit`, `uuid`, `pathe` not
  installed in this checkout).
- `test/agent/loop/loop.test.ts` could not load because `packages/core` deps `uuid`/`pathe`
  are not installed (pre-existing environment gap, unrelated to this change).

## What the new tests pin down

- **U9** — `entry.rewrite(request).endpoint.baseUrl` equals the swap endpoint
  (`https://fallback.example`), not the primary's — the Issue-1 regression guard.
- **U10** — a `status`/404 error proposes fallback #1; with fallback #1 already applied,
  a `status`/400 "Unknown Model" error proposes the secondary (`fb2`) — the Issue-2
  regression guard.
- Existing "ignores non-retryable client errors" still passes (a generic `unknown`/400
  that is not model-not-found still stops the cascade).

## Verdict

**verified** — the changed code paths are covered by passing unit tests and typecheck;
the only unrun suite is blocked by a pre-existing missing-dependency environment issue,
not by this change.