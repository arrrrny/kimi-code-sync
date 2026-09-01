---
feature: 009-fallback-model-cascade
verdict: FAIL
standard: .specify/extensions/tdd/templates/tdd-test-quality-rubric.md
verified_at: 81635ab5c
behaviors: 14
proven: 7
likely: 7
test_after: 0
no_test: 0
high_smells: 0
criteria_total: 9
criteria_covered: 3
mutation_score: null # no mutation tool (Stryker absent); 3 deliberate mutants sampled, all caught
mutants_survived: 0
suite: agent-core-v2 fallback resolver: 10 passed; full suite has 9 pre-existing failures (plugin/network + 3 manifest flakes)
---

# TDD Verification: Fallback Model Cascade

**Verdict: FAIL.** The feature is **incomplete**. The resolver layer is well-tested (7 of 14 behaviors proven, 3 deliberate mutants caught, 0 HIGH smells), but 7 behaviors (B2, B3, U1–U5) are uncovered because the integration layer — `AgentStepRetryService.tryFallback` wire-in plus 2 TUI slash commands plus registry entries — was deliberately deferred. The spec has 9 acceptance criteria; only 3 are exercised by the tests delivered so far. Until the integration work is complete, this feature cannot be said to be "done" regardless of test discipline.

## Test-first evidence

| Behavior | Class | Evidence |
| -------- | ----- | -------- |
| R1 | PROVEN | Cycle 1: red was "module not found" (test imported `#/session/fallback/flag` before it existed); green created the flag module. Cycle log: `tdd/cycle-log.md` lines 17–26. Mutant 3 (drop flag check) caught. |
| R2 | PROVEN | Cycle 2: red was wrong assertion for empty-only case, then green; corrected B1 to assert the secondary-return behavior. |
| R3 | PROVEN | Cycle 2: green on first run after the implementation existed; mutant 1 (invert `!==` → `===`) caught. |
| R4 | PROVEN | Cycle 2: green; mutant 1 caught. |
| R5 | PROVEN | Cycle 2: green; the implementation re-iterates from tier 1 when `lastTriedAlias` matches tier 2 (this is a "wraps around" behavior the cycle log records honestly). R5c (same alias on both tiers) is a separate case and is also PROVEN. |
| R6 | PROVEN | Same as R5c. |
| B1 | PROVEN | Cycle 2: green; the implementation returns the secondary when only secondary is set. |
| B2 | LIKELY | No test exists. Requires a TOML round-trip test in `packages/agent-core-v2/test/app/kosongConfig/configSection.test.ts`. |
| B3 | LIKELY | No test exists. Requires an env-binding test. |
| U1 | LIKELY | No test exists. Requires an integration test against `AgentStepRetryService.recover` with the primary model failing 10x. |
| U2 | LIKELY | No test exists. Requires the same integration with both tiers configured. |
| U3 | LIKELY | No test exists. Requires the same integration with no fallback configured. |
| U4 | LIKELY | No test exists. (B2 partially covers persistence but not the U4 acceptance criterion — restart-and-read.) |
| U5 | LIKELY | No test exists. Requires a TUI test in `apps/kimi-code/test/tui/commands/fallback-model.test.ts`. |

**Existing-test diff check**: The 13-file diff in `81635ab5c` adds new test and source files only; no assertion was removed, loosened, renamed, or skipped. No existing test was modified.

**Cycle-log honesty check**: The cycle log entries claim "Red" for R1 (red was actually a syntax error from a duplicate `parseNonEmptyEnv` declaration, then re-red on the missing module). The cycle log records both. Cycle 2's red was a test-assertion error, not an implementation gap; this is recorded honestly in the log.

## Findings

| # | Severity | Finding | Evidence |
| - | -------- | ------- | ------- |
| 1 | HIGH | **7 of 14 behaviors are uncovered (B2, B3, U1–U5)**. The integration work that drives them — `AgentStepRetryService.tryFallback` plus 2 slash commands plus registry entries — was deferred. | `tasks.md` T014–T023 unchecked; `tdd/test-list.md` shows 7 LIKELY rows. |
| 2 | MED | **Test-first ordering is uncorroborated by git history**: the entire test file and implementation were committed in a single commit (`81635ab5c`). The cycle log records red→green, but a `git show 81635ab5c` shows the test and source arriving together. The discipline is real, the evidence is not in the tree. | `git log --stat 2084f01bb..HEAD` |
| 3 | MED | **R5 was re-interpreted during the cycle**. The spec/test list said "returns `undefined` when both tiers have been tried" but the implementation re-iterates from tier 1 when `lastTriedAlias` matches tier 2. The cycle log records this honestly. The semantic may be wrong — a user could expect "after tier 2 also fails, the cascade ends." The current behavior means a 3rd-loop call would re-try tier 1. | `tdd/cycle-log.md` line 31; `configSection.ts:52-58` |
| 4 | LOW | The TUI command test file does not exist yet (U5). The two slash commands are also not implemented. The feature is half-done. | `tasks.md` T016, T017, T022, T023 |

No `HIGH` smells. Tests are not tautological, do not double the subject, do not re-implement expectations, and assert concrete observable results (alias strings, `undefined`).

## Mutation results

No mutation tool in the lockfile (Stryker absent). Three deliberate mutants on the resolver cascade logic:

| Mutant | Behavior | Survived | Judgment |
| ------ | -------- | -------- | -------- |
| `configSection.ts:52` invert `!==` → `===` (tier 1) | R3, R4, B1, R5b | No | 4 tests failed; mutant caught. |
| `configSection.ts:59` drop `!== lastTriedAlias` (tier 2) | R5c, R5b | No | 1 test failed; mutant caught. |
| `configSection.ts:27` short-circuit flag check | R1 | No | 1 test failed; mutant caught. |

3/3 deliberate mutants caught and restored. Suite re-confirmed green after each.

## Traceability

| Criterion | Behaviors | Tests | End to end |
| --------- | --------- | ----- | ---------- |
| FR-001 (`[fallback_model]` config section with `model` and `secondary_model`) | R2, B1, B2, B3 | partial — schema definition, env bindings registered; no round-trip test yet | Partial (config section + schema in `configSection.ts`; no test for B2/B3) |
| FR-002 (`/fallback-model` saves to `[fallback_model] model` and enables flag) | U1, U4 | none — slash command not implemented | No |
| FR-003 (`/fallback-model-secondary` saves to `[fallback_model] secondary_model`) | U1, U4 | none — slash command not implemented | No |
| FR-004 (after 10 attempts, try `fallback_model.model`) | U1, R3, R5b | partial — R3 unit-tests the resolver; U1 not driven | No |
| FR-005 (after tier 1, try `secondary_model`) | U2, R4, R5c | partial — R4/R5c unit-test the resolver; U2 not driven | No |
| FR-006 (no fallback → no behavior change) | R1, U3 | partial — R1 unit-tested; U3 not driven | No |
| FR-007 (cascade independent of compaction cascade) | R1 (different flag, different section) | not directly tested | N/A |
| FR-008 (Tab autocompletion) | U5 | none | No |
| FR-009 (alias not in `[models]` → skip) | (folded into R5c semantics) | partial | No |

Untested criteria: FR-002, FR-003, FR-008. The 3 covered criteria (FR-001 partial, FR-004 partial, FR-005 partial, FR-006 partial, FR-009 partial) are all at the resolver level only — **none of the outer-loop acceptance criteria (U1–U5) are exercised end-to-end through the slash command or the retry service**.

## What was not audited

- The TUI slash commands (`/fallback-model`, `/fallback-model-secondary`) are not implemented; the audit cannot grade them.
- The integration of `resolveFallbackBinding` into `AgentStepRetryService.recover` (a `tryFallback` method that swaps the active profile, resets `failedAttempts`, and re-issues `context.retry`) is not implemented; the audit cannot grade it.
- The persistence flow (save via `host.harness.setConfig`) is not implemented; the audit cannot grade it.
- Cross-package changes: `apps/kimi-code/src/tui/commands/config.ts` and `apps/kimi-code/src/tui/commands/registry.ts` are not modified. The TUI test for U5 is not written.
- Mutation was scoped to the resolver's 3 highest-risk branches; the schema, env bindings, and `AgentStepRetryService` mutations (when those exist) are not sampled.
- Performance/load behavior: no criterion, not assessed.

## Remediation

The next step is to drive the remaining 7 behaviors (B2, B3, U1–U5) and implement the integration layer. The full task list is in `tasks.md` T014–T030. This is multi-hour work; it should be its own session with `spec-whole` invoked again on this feature directory.
