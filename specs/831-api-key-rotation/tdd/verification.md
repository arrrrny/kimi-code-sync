---
feature: 831-api-key-rotation
verdict: FAIL
standard: .specify/extensions/tdd/templates/tdd-test-quality-rubric.md
verified_at: 3f2a19d8f
behaviors: 91
proven: 0
likely: 66
test_after: 8
no_test: 11
not_applicable: 6
high_smells: 0
criteria_total: 26
criteria_covered: 17
mutation_score: 100
mutants_survived: 0
suite: 184 passed, 0 failed, 21s (scoped to the 10 feature test files; whole-suite baseline 50 failed / 16802 passed / 60 skipped / 729s, none of it in a file this feature touched)
---

# TDD Verification: Provider API Key Rotation with Per-Key Proxy

**Verdict: FAIL.** Two functional requirements — FR-007 (rotation must be attempted before the
substitute/fallback chains) and FR-014 (every rotation reported to the user) — have **no test at
all**, and four behaviors (`U51`–`U54`) were shipped as implementation with no test. The rubric's
verdict table fails a feature on "any acceptance criterion without a test"; that condition is met.
Separately, nothing in this feature is committed, so *no* behavior can be classified `PROVEN` —
there is no history to corroborate any red. The tests that do exist are strong: five deliberate
mutants, five killed, none survived.

This audit was **not independent**. The same session wrote the tests. Mitigation was limited to
re-reading every artifact from the current file contents and running mutants rather than trusting
the log.

## Test-first evidence

`verified_at` is the only SHA that exists: `3f2a19d8f` is `HEAD`, and **every artifact of this
feature is uncommitted** — 42 paths in `git status`, 8 of them untracked. The rubric's `PROVEN`
class requires git history showing the test file changing in the same commit as, or before, the
source change. There is no such commit. `PROVEN` is therefore **0 by construction**, and every
behavior whose cycle log records a red is downgraded to `LIKELY`: the log says what happened, but
nothing independent can corroborate the ordering.

| Behavior group | Class | Evidence |
| --- | --- | --- |
| `U1`–`U13` | LIKELY | cycle 7 records a module-level red (`Cannot find module '#/credentials/keyRotationRecovery'`); no history to corroborate |
| `U14`–`U28` | LIKELY | cycle 8 records a module-level red for the same reason |
| `U29`–`U31` | LIKELY | cycle 3 records `TypeError: service.setActiveApiKey is not a function` ×3 |
| `U32`–`U34` | LIKELY | cycle 6 records `expected 'http://127.0.0.1:8080' to be 'http://127.0.0.1:8081'` |
| `U35`, `U38` | NOT_APPLICABLE | already covered by a pre-existing test at baseline; the cycle log says so |
| `U36`, `U37` | LIKELY | cycle 9 records a re-proven red after the first attempt was red for the wrong reason |
| `U39`–`U48`, `U50` | LIKELY | cycles 1, 2, 4, 5, 10 each record a red with output |
| `U49` | NO_TEST | no test exists; `turn.test.ts` has no later-step-budget case |
| `U51`–`U54` | NO_TEST | cycle 11 records the implementation with **no test added**, and says why |
| `U55`, `U56`, `U58`, `U59`, `U61`, `U63`–`U66`, `U68` | LIKELY | cycles 13, 14, 16, 17, 19, 20, 21, 22, 23, 24 each record a red |
| `U57`, `U60`, `U62`, `U67` | TEST_AFTER | green on the first run; the log records this honestly as a gap |
| `A9`–`A12` | TEST_AFTER | cycle 12 (second) records "no red was observable"; mutation stood in for it |
| `A1`, `A3`, `A4`, `A5`, `A8`, `A13`–`A16` | LIKELY | covered at unit or integration level; the acceptance level itself is thinner (below) |
| `A2`, `A6`, `A7`, `A17`, `A18`, `A19` | NO_TEST | no test exercises these criteria |
| `C1`–`C4` | NOT_APPLICABLE | characterization baselines, green against untouched code by definition |

**The stale test list is itself a finding.** `tdd/test-list.md` still carries `updated_at: 3f2a19d8f`
and marks 85 of 91 behaviors `PENDING` with an empty `test` column, although ~74 of them are
implemented and green today. The list was never updated by the loop, so it cannot be used as the
evidence of record — the cycle log and the file contents are. Anything that trusts the list's
`state` column (including `/speckit.implement`) will re-write work that already exists.

**Existing tests were not weakened.** The diff over all nine changed test files removes exactly five
lines, all of them imports replaced by equivalents plus one helper `return` that gained the new
context fields. No assertion was removed, loosened, skipped, renamed out of a filter's reach, or
made conditional; no `it.skip` / `it.only` / `describe.skip` was added; no coverage or mutation
threshold was touched. `.specify/memory/tdd-profile.md` still records `mutation: null`. This is the
highest-signal check in the audit and it comes back clean.

**Tasks are not overstated.** `tasks.md` has **zero boxes ticked** across T001–T061, so no task
claims a completion the evidence does not support. Three task-referenced test files do not exist as
written — T027/T051–T054 name `packages/agent-core-v2/test/llm-adapter/model/credentialProxyCascade.test.ts`
(missing; the tests actually live in `catalog.test.ts`), and T007/T007a name
`packages/agent-core-v2/test/app/config/tomlWriteback.test.ts` while the tests landed in
`providerService.test.ts`. Those files exist and are untouched by this feature. The tasks are
inaccurate about *where* the work is, not about whether it was done.

## Findings

| # | Severity | Finding | Evidence |
| --- | --- | --- | --- |
| 1 | HIGH | FR-007 has no test. The composition that puts rotation ahead of the substitute/fallback chains is referenced by zero tests. | `packages/agent-core-v2/src/agent/loop/machine/engine.ts:336-337`; `grep -rl keyRotationRecovery --include=*.test.ts` returns only `turn.test.ts` and `keyRotationRecovery.test.ts`, neither of which imports `engine.ts` |
| 2 | HIGH | FR-014 has no test. The `api-key-rotation` warning is emitted but never asserted on. | `packages/agent-core-v2/src/agent/loop/loopService.ts` is the only file in the repository containing the string `api-key-rotation` |
| 3 | HIGH | `U49`, `U51`–`U54` are `NO_TEST`: implementation shipped with no test, acknowledged in cycle 11. | `tdd/cycle-log.md` "Cycle 11 — engine composition + user-visible report (U51/U52/U53/U54)" |
| 4 | HIGH | Mutant 4 (`activeApiKeyId` persistence removed) left the entire 26-test turn-machine suite green. The acceptance path for FR-005 / A4 runs against a stubbed controller, so the turn machine never observes real persistence. | mutant 4 result below; `turn.test.ts` names contain no persistence assertion |
| 5 | HIGH | Mutant 3 (circular wraparound removed) left the turn-machine suite green, so A3 / FR-004's circular order has no test above the unit level despite T045 claiming acceptance closure in `turn.test.ts`. | mutant 3 result below |
| 6 | MED | `A17`/`A18` (SC-002, SC-007) depend on the notice path that finding 2 shows is untested, so the "no secret in user-visible output" criterion is verified only on the dialog side. | `provider-manager.test.ts` U66 covers the row; nothing covers the loop warning |
| 7 | MED | FR-018 is verified only for the fallback-tier alias. Sub-agent and swarm batch request paths are explicitly not driven through the real catalog. | `tdd/cycle-log.md` "FR-018 coverage record"; `test/session/subagent/spawn.test.ts` stubs `IModelCatalog` |
| 8 | MED | FR-012 ("survives a restart") is asserted as a written config shape, not as an actual reload after a restart. No test re-reads through a fresh process or a fresh service instance. | `provider.test.ts` "persists a supplied proxy with the key through the existing write path" |
| 9 | MED | Cycle ids are duplicated in the cycle log: two entries numbered `Cycle 12` and two numbered `Cycle 13`. Any tool or reader indexing cycles by number will silently merge unrelated work. | `tdd/cycle-log.md`, entries at lines 171/320 and 183/341 |
| 10 | LOW | `tdd/test-list.md` is stale and its frontmatter still records `suite_baseline: unknown` while the profile records `red`. | `tdd/test-list.md:8` |

Smell pass: no `HIGH` smell found. Specifically checked across the six highest-risk test files — no
assertion-free tests, no tautological assertions against configured doubles, no re-implemented
expectations, no vacuous assertions in the feature's own tests (the two `toBeDefined()` calls in
`provider-manager.test.ts:63,73` are pre-existing guards followed by concrete value assertions), no
snapshots, no conditional logic deciding what the feature's own tests assert. The `if`/`for`
occurrences found are inside shared scripted-step builders, which is the repository's established
harness idiom.

## Mutation results

No mutation tool is installed (`@stryker-mutator` absent from `pnpm-lock.yaml`), so the rubric's
deliberate-mutant fallback was used. **Five mutants, five killed, none survived.** Each was applied
alone, observed, reverted, and the revert verified by SHA-256 against a hash taken before the first
mutation. The working tree is byte-identical (`42` changed paths before and after; the four mutated
files all verify `OK`).

| Mutant | Behavior | Survived | Judgment |
| --- | --- | --- | --- |
| `keyRotationRecovery.ts:13` `attempt >= maxAttempts` → `attempt > maxAttempts` (rotation trigger threshold) | FR-002, U4 | No | Caught by 3 tests: `proposes on a 429 once the attempt budget is exhausted`, `gives the next key a full attempt budget after an applied rotation`, `awaits an accepted proposal before the next request is built`. The rate-limit threshold is pinned at both strategy and turn level. |
| `keyRotationRecovery.ts:27` `keyCount - 1` → `keyCount` (cycle bound) | FR-008, U10 | No | Caught by exactly 1 test: `declines once keyCount - 1 rotations were applied to this step`. A thin but real kill — `U11` cannot discriminate this mutant. |
| `apiKeyRotation.ts:39` dropped `% entries.length` (circular wraparound) | FR-004, A3, U23 | No | Caught by exactly 1 test: `wraps to the first key when the active key is the last one`. **The 26-test turn-machine suite stayed green**, which is finding 5. |
| `provider-service.ts:76` `activeApiKeyId: keyId` → `activeApiKeyId: config.activeApiKeyId` (no advance, no persist) | FR-005, A4, U25, U29 | No | Caught by 8 tests across `apiKeyRotation.test.ts` and `providerService.test.ts`. **The turn-machine suite stayed green**, which is finding 4. |
| `credentials.ts:50` `credential.proxyUrl ?? model.proxyUrl` → `model.proxyUrl ?? credential.proxyUrl` (precedence inverted) | FR-010, U32, A9, A12 | No | Caught by 4 tests across `credentials.test.ts`, `catalog.test.ts` and `turn.test.ts`. The proxy cascade is well covered at three levels. |

The score is 100 % **on this five-mutant sample**, not a repository-wide mutation score. The sample
was chosen for the task-specified high-risk surfaces: the rotation trigger/threshold, the circular
wraparound, the `keyCount - 1` bound, the persistence of `activeApiKeyId`, and per-key proxy
precedence. Everything else is unmeasured.

## Traceability

| Criterion | Tests | End to end |
| --- | --- | --- |
| FR-001 `rotate_keys`, default off | `apiKeyRotation.test.ts` gates (`rotateKeys` absent/false), `providerService.test.ts` transform | Yes |
| FR-002 rotate after 429 budget exhausted | `keyRotationRecovery.test.ts` U4; `turn.test.ts` budget tests | Yes (real strategy; stubbed controller at turn level) |
| FR-003 403 rotates without spending budget | `keyRotationRecovery.test.ts` U1, U2 | Yes at strategy level; **no turn-level test** |
| FR-004 definition order + wraparound | `apiKeyRotation.test.ts` U22–U24 | Unit only (mutant 3) |
| FR-005 persist then retry | `apiKeyRotation.test.ts` U25; `providerService.test.ts` U29–U31 | Yes at service level; not at turn level (mutant 4) |
| FR-006 retry inside the same turn | `turn.test.ts` `awaits an accepted proposal before the next request is built` | Yes |
| FR-007 rotation before substitute/fallback | **none** | **No — finding 1** |
| FR-008 stop after a full cycle | `keyRotationRecovery.test.ts` U10, U11 | Strategy only; the handoff itself is untested |
| FR-009 per-key proxy setting | `apiKeyRotation.test.ts` U15; `provider-manager.test.ts` U65 | Yes |
| FR-010 proxy cascade | `credentials.test.ts` U32–U34; `catalog.test.ts` A9–A11; `turn.test.ts` proxy tests | Yes (mutant 5 proves it) |
| FR-011 add-key asks for the proxy | `provider.test.ts` U55–U62 | Yes |
| FR-012 per-key proxy persists | `provider.test.ts` U61 | Partial — written shape only, no restart |
| FR-013 fewer than two keys unaffected | `apiKeyRotation.test.ts` single-key; `turn.test.ts`; `provider.test.ts` U64 | Yes |
| FR-014 every rotation reported | **none** | **No — finding 2** |
| FR-015 no secret material | `provider-manager.test.ts` U66; `keyRotationRecovery.test.ts` U13 | Partial — the notice path is untested |
| FR-016 concurrent switches are safe | `apiKeyRotation.test.ts` U28; `providerService.test.ts` U30 | Yes, in-process only |
| FR-017 managed/OAuth excluded | `apiKeyRotation.test.ts` U20, U21; `catalog.test.ts` U38 | Yes |
| FR-018 proxy on every request path | `catalog.test.ts` `carries the active key proxy for every model bound to the provider` | Partial — fallback tiers only; sub-agents and swarm unverified |
| SC-001 8 keys, run completes | `turn.test.ts` budget tests | Partial — 2–3 keys, no goal-mode run |
| SC-002 8 keys refused, notice per switch | none for the notice | Partial |
| SC-003 file names the key that served | `apiKeyRotation.test.ts` U25 | Yes |
| SC-004 rotation off changes nothing | `apiKeyRotation.test.ts` gates; `turn.test.ts` single-key | Yes |
| SC-005 egress per key | `catalog.test.ts` A9–A11 | Yes |
| SC-006 add key costs one extra question | `provider.test.ts` U59 | Yes |
| SC-007 no secret in output/logs/telemetry | `provider-manager.test.ts` U66 | Partial |
| SC-008 one extra request per key | `keyRotationRecovery.test.ts` U10 | Partial — bound asserted, request count not measured |

**Criteria with a test through the real entry point: 17 of 26** — 13 of 18 FRs (FR-001–FR-006,
FR-008–FR-011, FR-013, FR-016, FR-017) plus 4 of 8 SCs (SC-003, SC-004, SC-005, SC-006). Three FRs
are partial (FR-012, FR-015, FR-018) and four SCs are partial (SC-001, SC-002, SC-007, SC-008).
**Two FRs have no test whatsoever: FR-007 and FR-014.**

**Tests tracing to nothing: none.** Every test examined maps to a behavior id on the list.

## Baseline and regression attribution

The whole-suite baseline is RED and was **not** re-run by this audit (the caller barred it; the
recorded run took 729 s). The recorded result is `50 failed | 16802 passed | 60 skipped` across 8
files. Attributing the failures from the suite logs on disk plus the per-file re-runs already
recorded in `.tmp/tdd-files-rerun.log`:

- `apps/kimi-code/test/tui/kimi-tui-message-flow.test.ts` — 1 failure, **fails standalone**
  (`https://www.kimi.com/code` vs the app's `https://www.kimi.ai/code`). Pre-existing and genuine.
- `apps/kimi-code/test/tui/controllers/editor-keyboard-image-paste.test.ts` — 5–7 failures under
  load, **16/16 green standalone**. Load flake.
- `apps/kimi-code/test/cli/update/preflight.test.ts` — 39 failures whenever
  `KIMI_CODE_NO_AUTO_UPDATE=1` is inherited; 48/48 green with it unset. Environmental.
- `packages/kap-server/test/instanceRegistry.test.ts` — 6 under load, **18/18 green standalone**.
  Load flake.
- `packages/tree-sitter-bash/test/parse.test.ts` — 1 under load, **62/62 green standalone**. Flake.
- `packages/tree-sitter-bash/test/performance.test.ts` — 1, **fails standalone**. Pre-existing.
- `packages/kap-server/test/search/searchService.test.ts` — 1–2; fails standalone on a watchdog
  test. Pre-existing.

**No file this feature touched is among the failing set.** All ten feature test files pass together:
`184 passed (184)`, ten files, 21 s. Nothing here is a regression from this feature.

## What was not audited

- **Git history.** Nothing is committed, so the rubric's ordering check has no data at all. Every
  `LIKELY` above is `LIKELY` *because* of this, not because of a squashed history.
- **The full suite was not run.** The counts in the header are the recorded ones, not a measurement
  taken by this audit. Two of the eight failing files could not be positively attributed within the
  time budget, though none of the attributed ones is a feature file.
- **Mutation was scoped to five deliberate mutants on four hand-picked surfaces.** There is no
  repository-wide mutation score, and no mutant was run against the TUI, node-sdk or klient files.
- **Coverage was not measured.** The profile's coverage command instruments the whole repository and
  was not run; no per-file uncovered-branch data backs the traceability table.
- **The smell pass was not exhaustive.** Findings are based on a full mechanical scan (skips,
  removals, vacuous/tautological patterns, conditional assertions, snapshots) plus a reading of test
  names and the cited lines, not on reading every test body end to end.
- **Performance and load behavior were not assessed.** No criterion covers them.
- **The end-to-end CLI validation (T041, `quickstart.md`) was not run**, and neither were the repo
  gates (`pnpm lint`, the comment-free-zone check, a typecheck).
- **Remediation tasks were not appended to `tasks.md`.** The caller barred writing that file, so the
  findings above stand unactioned until someone adds them.

## Remediation tasks

Not written to `tasks.md` (the caller barred modifying it). The findings worth acting on, in order:

1. Test FR-007 at the composition site in `engine.ts:336-337` — assert rotation is proposed ahead of
   `credentialsRecovery` and the caller's fallback chain.
2. Test FR-014 by asserting the `api-key-rotation` `WarningIssued` from `loopService.ts`, including
   that it carries no key material (closes SC-007).
3. Write `U49`, `U51`–`U54` or remove them from the test list.
4. Drive `turn.test.ts`'s rotation cases against the **real** `ApiKeyRotationController` and real
   `ProviderService` rather than a stub, so persistence and wraparound are observable at the
   acceptance level (findings 4 and 5).
5. Refresh `tdd/test-list.md` states and `test` columns, and renumber the duplicate cycle entries.
6. Correct the three task-referenced test file paths in `tasks.md`.
