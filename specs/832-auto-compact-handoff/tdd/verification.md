---
feature: 832-auto-compact-handoff
audited_at: 563320a13
verdict: PASS_WITH_GAPS
prior_passes: 0
---

# TDD Verification: Auto-Compact Handoff Document

## Evidence

- **Cycle log**: `tdd/cycle-log.md` — 10 cycles plus baseline, each with red/green
  transition and test names.
- **Suite state**: all touched suites green at `563320a13` —
  `packages/agent-core-v2/test/agent/fullCompaction` (137 tests, was 118 at baseline
  `aafdca9be`), plus llmRequester, telemetry conventions, kap-server broadcaster, klient
  contract, and the two TUI files (combined scoped run: 11 files / 340 tests passed).
- **Comment-free zones**: `scripts/check-no-comments.mjs` OK (1785 files); pre-commit
  hook ran oxlint `--type-aware --quiet` clean over the staged diff.
- **Freshness gates**: `test/wire/wireManifest.test.ts` green after
  `pnpm gen:wire-manifest`.
- **Acceptance coverage**: every spec scenario maps to a DONE behavior in
  `tdd/test-list.md` (A1–A9, U1–U11, C1); each FR and SC traces to at least one behavior.

## Test-first discipline

- Genuine red-first cycles: U6, U7, U8, U4, U1, U2, U3, A1, A9 (component + handler) —
  each failed for the right reason before its implementation, with the failure output
  recorded in the cycle log.
- Guard tests (written against the already-wired behavior, green on first run): A3, U5,
  A4, U11, A5, U9 — marked as guards in the cycle log; they additionally caught one real
  defect late (see below), which is their job.
- TEST_AFTER: A2's overflow pass-through (first failure was a test-harness limitation —
  `ctx.llmCalls` does not record custom `generate` fns — not missing behavior; the
  behavior itself shipped with the A1 wiring and is now pinned by the test).

## Defects caught by the loop

- `applyCompaction` originally forwarded `handoffPath` unconditionally, so every raw
  `context.apply_compaction` record would carry a `handoffPath: undefined` key. The A6/A7
  guard tests failed on exactly this before the fix (payload key set only when defined).

## Gaps (why not a clean PASS)

1. **No mutation testing.** The stack profile records no mutation tool and none was added;
   the profile's fallback (deliberate mutants on the highest-risk behaviors) was not run.
   The highest-risk behaviors — the flag/source gate, the failure boundary, the
   footer composition — are each covered by at least one behavior test, but nobody
   verified the tests survive a mutation of the gate condition or the catch block.
2. **Guard-class behaviors** (A3/A4/A5 + U5/U9/U11) never observed a red state for the
   specific behaviors they pin; their value is regression detection going forward.
3. **klient `contract-parity.ts` type check** relies on the workspace type-check rather
   than a vitest run; the klient and node-sdk vitest suites pass, but a dedicated
   `tsc --noEmit` over packages/klient was not executed in isolation.

## Verdict

**PASS_WITH_GAPS.** The feature is delivered with red-first evidence for its core
behaviors, full acceptance coverage, green suites, and clean gates. The named gaps are
documentation-and-discipline gaps, not known defects; closing gap 1 (deliberate mutants
on `generateHandoffDocument`'s gate and catch boundary) is the highest-value follow-up.
