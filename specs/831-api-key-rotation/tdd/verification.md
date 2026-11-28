---
feature: 831-api-key-rotation
verdict: FAIL
standard: .specify/extensions/tdd/templates/tdd-test-quality-rubric.md
verified_at: fb48dc035
behaviors: 91
proven: 1
likely: 65
test_after: 16
no_test: 3
not_applicable: 6
high_smells: 0
criteria_total: 26
criteria_covered: 19
mutation_score: 100
mutants_survived: 0
suite: 157 passed, 0 failed, 25s (7 feature files, this audit's own run; whole-suite baseline red, proved pre-existing)
---

# TDD Verification: Provider API Key Rotation with Per-Key Proxy

**Verdict: FAIL — audit pass 3.** Every blocking finding raised by passes 1 and 2 is **resolved and
independently mutant-verified**: FR-007, FR-014, A19/US5.3 (which pass 2 found *unimplemented*, not
merely untested) and the stubbed-controller findings 4/5 all now have real, red-proved tests. The
verdict nevertheless stays `FAIL` on the rubric's remaining condition — **16 behaviors are
`TEST_AFTER` and 3 are `NO_TEST`** (U49, A2, A7) — and that is the entire blocking set. It is a
smaller and qualitatively milder residue than pass 2's (which also carried a HIGH: a shipped
acceptance scenario with no implementation); nothing is known to be broken, no `HIGH` smell was
found, and every mutant run against this feature was killed.

What the remaining `FAIL` means concretely: three acceptance behaviours have no test at all, and
sixteen behaviours were tested after their implementation rather than before it. `PROVEN` is 1 —
**A19 is now the only behavior whose test-first ordering is corroborated**, because commit
`fb48dc035` is a genuine per-cycle commit (test and source together, with its cycle-log entry added
in the same commit) carrying a real red. Every earlier behavior still rests on the pass-2
file-group-split history (finding 11).

This audit is **not independent** — the same working tree wrote the tests. Mitigation: every claim
below was re-read from the committed files at `fb48dc035`, the feature suite was re-run by this
audit, and all three mutants it applied were its own.

## What changed since pass 2

| Finding | Severity | Status | Evidence |
| --- | --- | --- | --- |
| 12 — US5.3 / A19 unimplemented and untested | HIGH | **RESOLVED** | `keyRotationRecovery.exhausted()` (`keyRotationRecovery.ts:52-60`) shares the strategy's guards and returns `<provider>: all <n> configured keys were tried`; `engine.ts` records it only when no strategy proposed and publishes it in `turn.failed` after `stepFailed`, before `turnSettled`. Cycle 30's reds are genuine and production-path: `Tests 2 failed \| 17 passed (19)` (unit) and `Tests 1 failed \| 59 skipped (60)` — `expected [] to have a length of 1 but got +0` (acceptance). This audit's mutant 1 below kills the acceptance case |
| 4 — mutant 4 left the turn suite green | MED | **RESOLVED** | `turn.test.ts` gained `describe('turn machine api key rotation against the real rotation controller')` driving `createKeyedCredentialProvider` over a real `ProviderService`. Mutant 2 below (persistence deleted) fails both new cases; the pre-existing cases that keep a stub assert turn-machine mechanics, not persistence |
| 5 — mutant 3 left the turn suite green | MED | **RESOLVED** | same block: the wraparound case asserts `activeApiKeyId` `k3 → k1` and the resolved key `sk-gamma → sk-alpha`. Mutant 3 below kills it and nothing else |
| 11 — history is a file-group split, so `PROVEN` = 0 | MED | **PARTLY RESOLVED** | `fb48dc035` adds cycle 30/31 in the same commit as their code, so A19's ordering is corroborated. The earlier commits are unchanged; finding 11 stays open for every behavior before this one |
| 1, 2 — FR-007 / FR-014 had no test | HIGH | **RESOLVED** (pass 2) | unchanged, still mutant-killed |
| 6 — A17/A18 rested on the untested notice path | MED | **RESOLVED** (pass 2) | unchanged |
| 3 — U49, U51–U54 `NO_TEST` | HIGH | U51–U54 resolved; **U49 open** | see finding 16 |
| 7 — FR-018 sub-agent/swarm paths | MED | **OPEN** | `test/session/subagent/spawn.test.ts` still stubs `IModelCatalog` |
| 8 — FR-012 asserted as a written shape, never a restart | MED | **OPEN** | unchanged |
| 9 — duplicate cycle ids | MED | **RESOLVED** (pass 2) | 31 headings, no duplicates |
| 10 — stale frontmatter | LOW | **OPEN** | `tdd/test-list.md:7-8` and `tdd/cycle-log.md:4` still read `3f2a19d8f` / `unknown` |

## Findings

| # | Severity | Finding | Evidence |
| --- | --- | --- | --- |
| 16 | MED | **The test list was not updated with this commit, so it now understates the work.** A19 still reads `PENDING` with an empty `test` column although it is implemented and tested, and the six new `keyRotationRecovery.exhausted` cases trace to no behavior id at all. T066 and T070 remain unticked although the work is done and verified here — the milder inverse the rubric asks to report, because `/speckit.implement` would write both a second time. | `specs/831-api-key-rotation/tdd/test-list.md:52` (A19 `PENDING`), `:150` (U49), `tasks.md` T066/T070 unticked; `git show fb48dc035 --stat` does not list `tdd/test-list.md` |
| 17 | MED | Unchanged from pass 2: FR-018 is verified only for the fallback-tier alias. | `tdd/cycle-log.md` "FR-018 coverage record" |
| 18 | MED | Unchanged from pass 2: FR-012 is asserted as a written config shape, not as a reload after a restart. | `provider.test.ts` "persists a supplied proxy with the key through the existing write path" |
| 19 | MED | Unchanged from pass 2: `machineEngineRecovery.test.ts:57` still hand-rolls `createToolExecutor()` and casts it `as unknown as IAgentToolExecutorService`, bypassing `stubToolExecutor()` at `test/agent/loop/stubs.ts:233`. | `packages/agent-core-v2/test/agent/loop/machineEngineRecovery.test.ts:57` |
| 20 | MED | Unchanged from pass 2, and the new case repeats it: `as unknown as TestAgentOptions` at `loop.test.ts:2279` **and `:2327`**. The escape is why cycle 28's harness defect compiled. | `packages/agent-core-v2/test/agent/loop/loop.test.ts:2279,2327` |
| 21 | LOW | Unchanged from pass 2: six references to two test paths that do not exist (`credentialProxyCascade.test.ts`, `tomlWriteback.test.ts`) inside T007/T007a and T027/T051–T054. | `specs/831-api-key-rotation/tasks.md` |
| 22 | LOW | New-frontmatter staleness carried into the new work: the cycle log's `profile_detected_at` and `suite_baseline` still describe a pre-feature tree, and the test list's `spec_criteria: 19` counts acceptance scenarios, not FR+SC (26). | `tdd/cycle-log.md:4-6`, `tdd/test-list.md:5-8` |

## Test-first evidence

Class definitions are the rubric's. `PROVEN` needs the cycle log's red **and** a history showing the
test changing with or before its source; finding 11 removes the second half for every behavior that
landed in the file-group split, which is all of them except A19.

| Behavior | Class | Evidence |
| --- | --- | --- |
| `A19` | **PROVEN** | cycle 30 records both reds with output; `fb48dc035` changes `keyRotationRecovery.test.ts`, `loop.test.ts` and their sources together, and adds the cycle entry in the same commit — a per-cycle commit with its red, which is the rubric's condition |
| `U1`–`U34`, `U36`, `U37`, `U39`–`U48`, `U50` | LIKELY | cycles 1–10 record reds with command and output; the pre-remediation history cannot order them (finding 11) |
| `U55`, `U56`, `U58`, `U59`, `U61`, `U63`–`U66`, `U68` | LIKELY | cycles 13–25 |
| `A1`, `A3`, `A4`, `A5`, `A13`–`A16` | LIKELY | unit or integration coverage, reds recorded. A3/A4's *strength* is now proved by cycle 31's mutants even though their red is old |
| `U51`–`U54` | TEST_AFTER | cycle 11 shipped the composition and the notice with no test; cycles 26/28 recorded no valid red |
| `A6`, `A8`, `A17`, `A18` | TEST_AFTER | same, via cycles 26/28 |
| `A9`–`A12` | TEST_AFTER | cycle 12: "no red was observable"; mutation stood in |
| `U57`, `U60`, `U62`, `U67` | TEST_AFTER | green on first run, recorded honestly |
| `U49` | **NO_TEST** | no test covers a later step's fresh rotation budget |
| `A2`, `A7` | **NO_TEST** | the 403 acceptance variants; FR-003 and FR-007 are covered by their 429 counterparts |
| `U35`, `U38`, `C1`–`C4` | NOT_APPLICABLE | characterization baselines, green by definition |

**Existing tests were not weakened.** `fb48dc035` adds 175 lines across three test files and removes
none: its `turn.test.ts` and `keyRotationRecovery.test.ts` hunks are pure additions after the
previous blocks, and the only touched pre-existing assertion in the whole feature history remains
pass 1's `async`/`await` change in `credentials.test.ts`. No assertion dropped, loosened,
skipped or renamed; no `it.skip` / `it.only` / `describe.skip` / `.todo` added; no coverage or
mutation threshold altered (`tdd-profile.md` still records `mutation: null`).

**Tasks remain un-overstated, but now understated in two places.** Four boxes are ticked (T062–T065,
all backed by `DONE` behaviors) and 14 of Phase 11's tasks remain unticked — including T066 and T070,
whose work this audit verified as done. No ticked task claims unsupported work; the inverse is
finding 16.

## Smell pass

No `HIGH` smell in the commit's new test code. The six `keyRotationRecovery exhaustion` cases assert
concrete values (`toEqual({ strategy, action, detail })`, `toBeUndefined()`, `not.toContain('sk-')`),
and each negative case isolates one guard — untried key, zero rotations, non-qualifying 401, missing
controller — so a dropped guard fails a named test rather than sliding through. The turn block's two
cases assert the *persisted config state* and the *resolved credential* end to end, which is the
strongest shape in the file; the acceptance case asserts a length plus six content checks on the real
bus event. No snapshots, no assertion-free tests, no conditional assertion logic in a test body, no
tautologies against configured doubles: the arrays the new tests read are filled by production code
calling the real services.

Carried forward unchanged: findings 19 (`Bypassed test utility`) and 20 (the type escape). Also
unchanged is the property that the new tests are deterministic (fake timers) and specific
(`expected 'k3' to be 'k1'` names the wraparound, not the machinery).

## Mutation results

No mutation tool is installed, so the rubric's deliberate-mutant fallback applies. This audit applied
**three** mutations itself against the committed code, one at a time, restoring each file
byte-identically (SHA-256 verified after restore; `git diff` and `git status` both empty at the end).
**Three applied, three killed.**

| Mutant | Behavior | Survived | Judgment |
| --- | --- | --- | --- |
| `engine.ts` — the `failureNotice` publish block deleted from `turn.failed` (this audit) | A19, US5.3 | **No** | `expected [] to have a length of 1 but got +0` — `Tests 1 failed \| 59 skipped (60)`. The acceptance case genuinely tests the notice path, not merely "a warning appeared" |
| `apiKeyRotation.ts:82` — `await this.providers.setActiveApiKey(...)` deleted (this audit) | FR-005, A4, U25 | **No** | `Tests 2 failed \| 26 passed (28)`; `expected 'k1' to be 'k2'` and `expected 'k3' to be 'k1'`. This is exactly pass 2's finding 4, now closed: the turn suite observes real persistence |
| `apiKeyRotation.ts` `planNext` — `entries[(index + 1) % entries.length]` → `entries[index + 1]` (this audit) | FR-004, A3, U23 | **No** | `Tests 1 failed \| 27 passed (28)`: only the wraparound case fails, `expected 'k3' to be 'k1'`. Pass 2's finding 5 closed |

Cumulative across the feature's history: **13 deliberate mutations over the changed files, none
survived** (this audit's 3; pass 2's 2; pass 1's 5; cycles 12, 13, 27's 3 further). The score is
100 % **on that sample**, not a repository-wide or per-behavior guarantee: the `exhausted` detail
format, the config transforms' unknown-field preservation, the TUI prompt's validation branches, the
klient/node-sdk schema mirrors, and the new engine clearing logic on `turn.started` / `llm.sent` were
never mutated — the last of these is the most conspicuous unmeasured surface, since a notice that
leaked into a *successful* turn would not be caught by any test read here.

## Traceability

| Criterion | Tests | End to end |
| --- | --- | --- |
| FR-001 `rotate_keys`, default off | `apiKeyRotation.test.ts` gates; `providerService.test.ts` transform | Yes |
| FR-002 rotate after 429 budget exhausted | `keyRotationRecovery.test.ts` U4; `turn.test.ts` budget tests | Yes |
| FR-003 403 rotates without spending budget | `keyRotationRecovery.test.ts` U1, U2 | Unit only — A2 `NO_TEST` |
| FR-004 definition order + wraparound | `apiKeyRotation.test.ts` U22–U24; `turn.test.ts` real-controller wraparound | **Yes** (mutant-proved at both levels) |
| FR-005 persist then retry | `apiKeyRotation.test.ts` U25; `providerService.test.ts` U29–U31; `turn.test.ts` real-controller persistence | **Yes** (mutant-proved) |
| FR-006 retry inside the same turn | `turn.test.ts` `awaits an accepted proposal before the next request is built` | Yes |
| FR-007 rotation before substitute/fallback | `machineEngineRecovery.test.ts` (both tests) | Yes |
| FR-008 stop after a full cycle | `keyRotationRecovery.test.ts` U10, U11; `machineEngineRecovery.test.ts` handoff test | Yes |
| FR-009 per-key proxy setting | `apiKeyRotation.test.ts` U15; `provider-manager.test.ts` U65 | Yes |
| FR-010 proxy cascade | `credentials.test.ts` U32–U34; `catalog.test.ts` A9–A11; `turn.test.ts` proxy tests | Yes |
| FR-011 add-key asks for the proxy | `provider.test.ts` U55–U62 | Yes |
| FR-012 per-key proxy persists | `provider.test.ts` U61 | Partial — no restart (finding 18) |
| FR-013 fewer than two keys unaffected | `apiKeyRotation.test.ts` single-key; `turn.test.ts`; `provider.test.ts` U64 | Yes |
| FR-014 every rotation reported | `loop.test.ts` notice case; `keyRotationRecovery.test.ts` U13 | Yes |
| FR-015 no secret material | `provider-manager.test.ts` U66; `keyRotationRecovery.test.ts` U13 and `reports no key value`; both `loop.test.ts` notice cases | Yes |
| FR-016 concurrent switches are safe | `apiKeyRotation.test.ts` U28; `providerService.test.ts` U30 | Yes, in-process only |
| FR-017 managed/OAuth excluded | `apiKeyRotation.test.ts` U20, U21; `catalog.test.ts` U38 | Yes |
| FR-018 proxy on every request path | `catalog.test.ts` `carries the active key proxy for every model bound to the provider` | Partial — fallback tiers only (finding 17) |
| SC-001 8 keys, run completes | `turn.test.ts` budget tests | Partial — 2–3 keys, no goal-mode run |
| SC-002 8 keys refused, notice per switch | `loop.test.ts` both notice cases | Partial — one switch and one exhaustion asserted; the 8-key run is not |
| SC-003 file names the key that served | `apiKeyRotation.test.ts` U25; `turn.test.ts` real-controller persistence | Yes |
| SC-004 rotation off changes nothing | `apiKeyRotation.test.ts` gates; `turn.test.ts` single-key | Yes |
| SC-005 egress per key | `catalog.test.ts` A9–A11 | Yes |
| SC-006 add key costs one extra question | `provider.test.ts` U59 | Yes |
| SC-007 no secret in output/logs/telemetry | `provider-manager.test.ts` U66; both `loop.test.ts` notice cases | Partial — no telemetry assertion |
| SC-008 one extra request per key | `keyRotationRecovery.test.ts` U10 | Partial — bound asserted, request count not measured |
| US5.3 (acceptance scenario behind A19) | `loop.test.ts` `reports that every configured key was tried once the cycle is exhausted`; `keyRotationRecovery.test.ts` exhaustion block | **Yes — resolved in pass 3** (mutant-proved) |

**Criteria with at least one test: 19 of 26** — 15 of 18 FRs plus 4 of 8 SCs; the rest are partial:
FR-012, FR-015, FR-018 and SC-001, SC-002, SC-007, SC-008. **No criterion and no acceptance scenario
is now without a test**; what remains untested is the three behaviors U49, A2, A7, which duplicate
criteria that are covered at another level.

**Tests tracing to nothing: the six `keyRotationRecovery exhaustion` cases**, which assert a new
`LlmRecovery.exhausted` surface that no behavior id on `tdd/test-list.md` names (finding 16). Every
other test read this pass maps to a behavior id.

## Baseline and regression attribution

This audit re-ran the feature's affected files itself — `src/human/test/agent`,
`keyRotationRecovery.test.ts`, `test/agent/loop` — **7 files, 157 tests, 157 passed, 0 failed,
24.81 s**. The commit message's own figures (`62 passed`, `76 passed`, `tsc` exit 0,
`check-no-comments.mjs` OK) are consistent with that run; this audit reproduced the test counts and
not the typecheck or lint gates.

The whole-suite baseline is red and was **not** re-run (barred; 819 s), and nothing changed the
pass-1/pass-2 attribution: the failures reduce to 9 files that pass in isolation plus 3 that fail
identically on `3f2a19d8f` (41 failed | 385 passed there). No file this feature touched is in the
failing set. Treat the suite as red but pre-existing.

## What was not audited

- **History ordering before `fb48dc035`.** Finding 11 still stands for every behavior that landed in
  the file-group split; only A19 is corroborated.
- **The full suite and the repo gates** (`pnpm lint`, the comment-free-zone check, a typecheck) were
  not run by this audit; the commit's reported results are taken on trust.
- **Mutation remains a sample** of 13 deliberate mutations. The engine's `failureNotice` clearing on
  `turn.started` / `llm.sent` and its behaviour on a *successful* turn, the `exhausted` detail
  format, and everything under `apps/kimi-code/src/tui`, `packages/node-sdk` and `packages/klient`
  are unmutated.
- **Coverage was not measured**, so no uncovered-branch data backs the traceability table.
- **The smell pass is targeted**: the three files this commit touches were read in full; the other
  feature test files were re-checked mechanically and by name.
- **Performance and load were not assessed**, and the end-to-end CLI validation (T041) was not run.
- **`apps/kimi-inspect`, `packages/pi-tui`, `apps/vis`, `apps/vscode`** are outside the blast radius
  and were not examined.

## Remediation

Written to `tasks.md` as `## Phase 12: TDD remediation` (T077–T085): three `NO_TEST` behaviors, the
`TEST_AFTER` record, and the five MED/LOW findings still open. `FAIL` here is not "the code is
broken" — it is "three behaviors have no test and sixteen were not written test-first". A19's
remediation is the model to copy: a genuine red, an acceptance-level test, and a mutant kill.
