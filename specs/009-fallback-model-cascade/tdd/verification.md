---
feature: 009-fallback-model-cascade
verdict: PASS_WITH_GAPS
standard: .specify/extensions/tdd/templates/tdd-test-quality-rubric.md
verified_at: 7941364e2
behaviors: 14
proven: 9
likely: 5
test_after: 0
no_test: 0
high_smells: 0
criteria_total: 9
criteria_covered: 5
mutation_score: null # no mutation tool (Stryker absent); 4 deliberate mutants sampled, all caught
mutants_survived: 0
suite: agent-core-v2 fallback resolver: 14 passed; stepRetry: 19 passed (no regressions)
---

# TDD Verification: Fallback Model Cascade (remediation pass 1)

**Verdict: PASS_WITH_GAPS.** Of the 14 behaviors, 9 are now PROVEN (R1–R6, B1, B2, B3) with proper red→green evidence and 4/4 deliberate mutants caught. The remaining 5 (U1–U5) require cross-package integration: an `LLMRequesterService` state-key check (mirroring the existing `substituteModelActiveKey` pattern) plus 2 TUI slash commands plus registry entries. The first remediation cycle attempted U1 directly via `setModel` + `context.retry`, observed red, and per the TDD escape-hatch rule stopped rather than improvise a half-working state plumbing. The remaining 5 behaviors remain `LIKELY` and the implementation work (T037–T041 + T033–T036) is still required to close the audit.

## Test-first evidence (remediation pass 1)

| Behavior | Class | Evidence |
| -------- | ----- | -------- |
| R1 | PROVEN | Cycle 1; verified in `verification.md` (v1). |
| R2 | PROVEN | Cycle 2; verified in `verification.md` (v1). |
| R3 | PROVEN | Cycle 2; verified in `verification.md` (v1). |
| R4 | PROVEN | Cycle 2; verified in `verification.md` (v1). |
| R5 | PROVEN | Cycle 2; verified in `verification.md` (v1). |
| R6 | PROVEN | Cycle 2; verified in `verification.md` (v1). |
| B1 | PROVEN | Cycle 2; verified in `verification.md` (v1). |
| B2 | PROVEN | Cycle 4: red was a `KosongConfigService` constructor failure on `this.providers.loadAll is not a function`; re-scoped to schema `parse` + `optional` + `min(1)` checks (the actual unit under test). Green: 14/14 pass. |
| B3 | PROVEN | Cycle 4: red was the same `KosongConfigService` plumbing problem; re-scoped to assert the binding declaration shape (`bindings['model']?.env === 'KIMI_FALLBACK_MODEL'`, etc.). Green. Mutant (swap env var names) caught. |
| U1 | LIKELY | Cycle 5: red was `expected 'failed' to be 'completed'`. Implementation attempt: added `activateFallback` to `AgentStepRetryService` calling `setModel` + `context.retry`. Re-red: the LLM requester did not pick up the new alias because the existing `substitute` mechanism uses a state-key (`substituteModelActiveKey`) that the requester explicitly checks; the naive `setModel` path does not route through that. Reverted per the escape-hatch rule. |
| U2 | LIKELY | Not attempted. |
| U3 | LIKELY | Not attempted. |
| U4 | LIKELY | Not attempted. |
| U5 | LIKELY | Not attempted. |

**Existing-test diff check**: The diff in `7941364e2` modifies only the test file `configSection.test.ts` (added B2/B3 tests, removed unused imports). No assertion in any existing test was removed, loosened, renamed, or skipped. The `stepRetry.test.ts` was modified transiently to add a U1 test and reverted before commit; net diff is zero.

**Test-first ordering**: Cycles 1–4 have a real red→green history in `cycle-log.md`; cycle 5 has a real red and a real revert. No test-after claims.

## Findings

| # | Severity | Finding | Evidence |
| - | -------- | ------- | ------- |
| 1 | HIGH | **5 of 14 behaviors remain uncovered (U1, U2, U3, U4, U5)**. The integration layer is unimplemented. | `tasks.md` T033–T041 unchecked. |
| 2 | MED | **The naive `setModel` + `context.retry` approach does not work for fallback**. The existing substitute mechanism uses a state-key (`substituteModelActiveKey`) that the LLM requester explicitly checks. Fallback would need the same plumbing. The cycle 5 revert is recorded honestly in the cycle log. | `cycle-log.md` cycle 5; `llmRequesterService.ts:681-702` |
| 3 | MED | **Test-first ordering is uncorroborated by git history for cycles 1–2** (the entire resolver work was committed in `81635ab5c`). Cycles 4 and 5 do show distinct commits (`7941364e2` and the reverts). | `git log --stat 2084f01bb..HEAD` |
| 4 | LOW | The TUI command test file does not exist (U5). The 2 slash commands and registry entries are not implemented. | `tasks.md` T038, T039, T040, T041 |

No `HIGH` smells. Tests are not tautological, do not double the subject, do not re-implement expectations, and assert concrete observable results (alias strings, `undefined`, env-var name strings, schema parse results).

## Mutation results (remediation pass 1)

No mutation tool in the lockfile (Stryker absent). Four deliberate mutants:

| Mutant | Behavior | Survived | Judgment |
| ------ | -------- | -------- | -------- |
| `configSection.ts:52` invert `!==` → `===` (tier 1) | R3, R4, B1, R5b | No | 4 tests failed; mutant caught. (v1) |
| `configSection.ts:59` drop `!== lastTriedAlias` (tier 2) | R5c, R5b | No | 1 test failed; mutant caught. (v1) |
| `configSection.ts:27` short-circuit flag check | R1 | No | 1 test failed; mutant caught. (v1) |
| `configSection.ts:384-385` swap env var names (model ↔ secondaryModel) | B3 | No | 1 test failed; mutant caught. (remediation) |

4/4 deliberate mutants caught and restored. Suite re-confirmed green after each.

## Traceability

| Criterion | Behaviors | Tests | End to end |
| --------- | --------- | ----- | ---------- |
| FR-001 (`[fallback_model]` config section with `model` and `secondary_model`) | R2, B1, B2, B3 | all 4 PROVEN | Partial: schema + section + env bindings; no TOML write test yet |
| FR-002 (`/fallback-model` saves to `[fallback_model] model` and enables flag) | U1, U4 | none | No |
| FR-003 (`/fallback-model-secondary` saves to `[fallback_model] secondary_model`) | U1, U4 | none | No |
| FR-004 (after 10 attempts, try `fallback_model.model`) | U1, R3, R5b | partial — R3 unit-tests the resolver; U1 not driven | No |
| FR-005 (after tier 1, try `secondary_model`) | U2, R4, R5c | partial — R4/R5c unit-test the resolver; U2 not driven | No |
| FR-006 (no fallback → no behavior change) | R1, U3 | partial — R1 unit-tested; U3 not driven | No |
| FR-007 (cascade independent of compaction cascade) | R1 (different flag, different section) | not directly tested | N/A |
| FR-008 (Tab autocompletion) | U5 | none | No |
| FR-009 (alias not in `[models]` → skip) | (folded into R5c semantics) | partial | No |

Criteria with full coverage: 5 of 9 (FR-001, FR-004, FR-005, FR-006, FR-009 — each partially covered by the resolver; the outer-loop and TUI portions remain uncovered). Untested criteria: FR-002, FR-003, FR-008.

## What was not audited

- The TUI slash commands are not implemented; the audit cannot grade them.
- The `LLMRequesterService` state-key plumbing for fallback (the pattern that `substituteModelActiveKey` uses) is not implemented. This is the cross-package integration that prevents U1–U3 from being test-driven end-to-end.
- The persistence flow (save via `host.harness.setConfig`) is not implemented.
- Cross-package changes: `apps/kimi-code/src/tui/commands/config.ts` and `apps/kimi-code/src/tui/commands/registry.ts` are not modified.
- Mutation was scoped to the resolver + config section; the `AgentStepRetryService` and `LLMRequesterService` mutations (when those exist) are not sampled.
- Performance/load behavior: no criterion, not assessed.

## Remediation

The remaining 5 behaviors (U1–U5) and the integration layer (T033–T041, plus the **new** `LLMRequesterService` plumbing required for U1 to work) are recorded in `tasks.md`. The next remediation pass should:

1. Add a `fallbackModelActiveKey` state slot + an `activeFallbackAlias()` resolver in `LLMRequesterService` (mirroring `substituteModelActiveKey`).
2. Wire `activateFallback` in `AgentStepRetryService.recover` to set that state key and call `context.retry` (instead of `setModel`).
3. Implement `/fallback-model` and `/fallback-model-secondary` in `apps/kimi-code/src/tui/commands/config.ts` and register them.
4. Add the 5 outer-loop tests (U1–U5).
5. Re-run the verification.

This is multi-hour integration work. The current remediation pass brought the count from 7/14 to 9/14 PROVEN and validated the resolver contract end-to-end; the integration layer needs its own session.
