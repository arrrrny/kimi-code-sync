---
feature: 831-api-key-rotation
verdict: FAIL
standard: .specify/extensions/tdd/templates/tdd-test-quality-rubric.md
verified_at: 6202e94e2
behaviors: 91
proven: 0
likely: 65
test_after: 16
no_test: 4
not_applicable: 6
high_smells: 0
criteria_total: 26
criteria_covered: 19
mutation_score: 100
mutants_survived: 0
suite: 245 passed, 0 failed, 44s (12 feature test files, this audit's own run; whole-suite baseline red, proved pre-existing)
---

# TDD Verification: Provider API Key Rotation with Per-Key Proxy

**Verdict: FAIL — audit pass 2.** The two blocking functional findings of pass 1 are **resolved**:
FR-007 and FR-014 each now have a real test that fails under a deliberate mutant. The verdict stays
`FAIL` on the rubric's other condition, "any `TEST_AFTER` or `NO_TEST` behavior": **16 behaviors are
`TEST_AFTER`** and **4 are `NO_TEST`** (U49, A2, A7, A19), and one acceptance scenario — US5.3 /
A19, "the user is told that all configured keys were tried" — has **neither a test nor an
implementation**. `PROVEN` is **0**: the git history is a three-commit *file-group split*, not a
chronological record, so it cannot corroborate ordering for any behavior (finding 11).

`FAIL` here is a statement about the completeness of the TDD evidence, not about the code: 245 tests
across the 12 feature files pass, every FR and SC has at least one test, no `HIGH` smell was found,
and every deliberate mutant run against this feature was killed. What is missing is test-first
history and four behaviors' worth of coverage.

This audit was again **not independent** — the same working tree that wrote the tests produced the
report. Mitigation: every cited file was re-read, the whole feature suite was re-run by this audit,
and the two remediation tests were mutation-checked here rather than trusted from the log.

## What changed since pass 1

| Pass-1 finding | Status | Evidence |
| --- | --- | --- |
| 1 HIGH — FR-007 has no test | **RESOLVED** | `packages/agent-core-v2/test/agent/loop/machineEngineRecovery.test.ts` — 2 tests driving the real `machineEngineAttachBundle`; this audit re-ran them: `Tests 2 passed (2)`; the `engine.ts:336` mutation below kills both |
| 2 HIGH — FR-014 has no test | **RESOLVED** | the case `reports the provider and the new key without leaking the key value` at `packages/agent-core-v2/test/agent/loop/loop.test.ts:2260`; the `loopService.ts:1562` mutation below kills it |
| 3 HIGH — U49, U51–U54 `NO_TEST` | **PARTLY RESOLVED** | U51–U54 are now `DONE` with real tests; **U49 is still `NO_TEST`** (pass-1 finding 3, still open) |
| 4 HIGH — mutant 4 (persistence removed) left the turn suite green | **OPEN**, re-graded MED | `packages/agent-core-v2/src/human/test/agent/turn.test.ts:809` still injects a stub `rotation: () => controller`; the new composition test stubs it too. FR-005 is real at service level (`providerService.test.ts` U29–U31, `apiKeyRotation.test.ts` U25), so the acceptance level is missing, not the requirement |
| 5 HIGH — mutant 3 (wraparound removed) left the turn suite green | **OPEN**, re-graded MED | A3 still resolves only through `apiKeyRotation.test.ts` (unit). FR-004 has a test; it has no acceptance-level one |
| 6 MED — A17/A18 rest on the untested notice path | **RESOLVED** | the notice test asserts exactly one `api-key-rotation` warning carrying provider, key name and key id, and asserts `not.toContain` for all three configured key values |
| 7 MED — FR-018 verified only for the fallback-tier alias | **OPEN** | unchanged; `test/session/subagent/spawn.test.ts` still stubs `IModelCatalog` |
| 8 MED — FR-012 asserted as a written config shape, never a restart | **OPEN** | unchanged |
| 9 MED — duplicate cycle ids in the cycle log | **RESOLVED** | cycles renumbered once through 25, then 26–29 appended; `grep -c '^## Cycle '` shows 29 entries, 0 duplicate numbers |
| 10 LOW — stale test-list frontmatter | **OPEN** | `tdd/test-list.md:7-8` still reads `updated_at: 3f2a19d8f` / `suite_baseline: unknown` although the body was refreshed to 83 DONE; `tdd/cycle-log.md:4` still says `suite_baseline: unknown` |

## New findings in pass 2

| # | Severity | Finding | Evidence |
| --- | --- | --- | --- |
| 11 | MED | **The git history is a reconstructed file-group split, so it corroborates nothing.** The *spec* commit — the oldest of the three — already contains the final cycle log **including cycles 26–29**, which describe tests added by the later feature commit, and its `tdd/test-list.md` blob is byte-identical to today's 83-DONE version. Everything the feature changed landed in one commit, so the rubric's "same commit" clause is satisfied only vacuously; per the skill's fail-closed rule, a history that cannot show ordering means `LIKELY`, not `PROVEN`. | `git show a30aa7b3b:specs/831-api-key-rotation/tdd/cycle-log.md \| grep -c '^## Cycle 2[6-9]'` → `4`; `git show a30aa7b3b:…/test-list.md \| diff - …/test-list.md` → identical; commit `5a5ff71fe` is the only commit touching `*.test.ts` and `src/` |
| 12 | HIGH | **US5.3 / A19 is unimplemented as well as untested.** Nothing in the engine or the CLI tells the user that all configured keys were tried when the cycle is exhausted. `spec.md`'s own test list already recorded this as "only half-wired"; an acceptance scenario with no implementation cannot be tested, so this is a product gap, not only an evidence gap. | `grep -rniE "all (configured )?keys\|keys? (were\|was) tried\|exhausted all" packages/agent-core-v2/src apps/kimi-code/src --include=*.ts` → the single hit is an unrelated comment at `apps/kimi-code/src/tui/commands/provider.ts:232` |
| 13 | MED | `machineEngineRecovery.test.ts:54-58` hand-rolls `createToolExecutor()` and casts it `as unknown as IAgentToolExecutorService`, bypassing `stubToolExecutor()` which `packages/agent-core-v2/test/agent/loop/stubs.ts:233` already exports for exactly this. Same smell class as the one that hid cycle 28's defect. | `packages/agent-core-v2/test/agent/loop/machineEngineRecovery.test.ts:54` vs `packages/agent-core-v2/test/agent/loop/stubs.ts:233` |
| 14 | MED | The notice test casts its config `as unknown as TestAgentOptions` (`loop.test.ts:2279`). That escape is why cycle 28's harness defect — a provider record the harness silently replaced — compiled and ran for a whole cycle before anyone saw it. The harness now merges, but the cast still suppresses the check that would catch the next such defect. | `packages/agent-core-v2/test/agent/loop/loop.test.ts:2262-2279` |
| 15 | LOW | Three task-referenced test paths still name files that do not exist: T007/T007a point at `packages/agent-core-v2/test/app/config/tomlWriteback.test.ts` and T027/T051–T054 at `packages/agent-core-v2/test/llm-adapter/model/credentialProxyCascade.test.ts`. Nothing claims those tasks complete, so no coverage is overstated, but the paths mislead the next implementer. | `specs/831-api-key-rotation/tasks.md` (T007, T007a, T027, T051–T054) |

## Test-first evidence

Class definitions are the rubric's. `PROVEN` needs the cycle log's red **and** a history that shows
the test changing with or before its source; finding 11 removes the second half for every behavior.
`TEST_AFTER` is "no red recorded" — it includes behaviors whose test went green on its first run and
behaviors whose implementation shipped in an earlier cycle than their test.

| Behavior | Class | Evidence |
| --- | --- | --- |
| `U1`–`U34` | LIKELY | cycles 3, 6, 7, 8, 9 record reds with command and output; history cannot order them (finding 11) |
| `U36`, `U37` | LIKELY | cycle 9 — the red was re-proven after the first attempt failed for the wrong reason |
| `U39`–`U48`, `U50` | LIKELY | cycles 1, 2, 4, 5, 10 |
| `U51`–`U54` | **TEST_AFTER** | cycle 11 shipped the composition and the notice with **no test**; cycles 26 and 28 record that no red of the production path was ever observed — cycle 28's red was for the wrong reason (a harness defect, fixed in cycle 29). The 4 behaviors are now correct and mutant-backed, but they were implemented first |
| `U55`, `U56`, `U58`, `U59`, `U61`, `U63`–`U66`, `U68` | LIKELY | cycles 13, 14, 16, 17, 19, 20, 21, 22, 23, 24 |
| `U57`, `U60`, `U62`, `U67` | TEST_AFTER | green on first run; the log records this honestly |
| `U49` | **NO_TEST** | no test in `turn.test.ts` covers a second step's rotation budget |
| `A6`, `A8`, `A17`, `A18` | **TEST_AFTER** | all four resolve to cycles 26/28, which recorded no valid red |
| `A9`–`A12` | TEST_AFTER | cycle 12 (second half) records "no red was observable"; mutation stood in |
| `A1`, `A3`, `A4`, `A5`, `A13`–`A16` | LIKELY | unit or integration coverage, reds recorded |
| `A2`, `A7` | **NO_TEST** | the 403 acceptance scenarios; FR-003 and FR-007 are covered by their 429 counterparts (U1/U2, and now `machineEngineRecovery.test.ts`) |
| `A19` | **NO_TEST** | finding 12 — no test and no implementation |
| `U35`, `U38`, `C1`–`C4` | NOT_APPLICABLE | characterization baselines, green by definition |

**Existing tests were not weakened.** The diff against `3f2a19d8f` removes 8 lines across all test
files, all accounted for: three imports replaced by equivalents, one helper `return` that gained the
new `attempt`/`maxAttempts` context fields, `harness/agent.ts` and `test/app/provider/stubs.ts`
(one line each), and one legitimate signature change — `credentials.test.ts`'s "invalidates the
credentials before the next attempt" became `async` and now `await`s `beforeNextAttempt()`, keeping
the same name and the same `expect(invalidations).toBe(1)`. No assertion was dropped, loosened,
skipped, or renamed out of a filter's reach; no `it.skip` / `it.only` / `describe.skip` / `.todo`
was added anywhere in the feature diff; no coverage or mutation threshold was touched
(`tdd-profile.md` still records `mutation: null`).

**Tasks are not overstated.** Only four boxes are ticked — T062–T065 in `## Phase 10` — and every
behavior they name (A6, A8, A17, A18, U51, U53, U54) is `DONE` on the list. No ticked task points at
a `PENDING` behavior. The three task-referenced test paths that did not exist in pass 1
(`credentialProxyCascade.test.ts`, `tomlWriteback.test.ts`) are still wrong inside T007/T007a and
T027/T051–T054 — those tasks remain unticked, so nothing is claimed on their behalf, but the paths
are still misleading (finding 15).

## Smell pass

No `HIGH` smell in the two files added or changed by the remediation. Specifically:

- `machineEngineRecovery.test.ts` asserts concrete values, not truthiness: `expect(applied).toEqual(['rotate:key2'])`
  and `expect(recovering.map(e => e.strategy)).toEqual([...])` (`:176-178`, `:214-218`). The array it
  reads is filled by the engine calling the stub controller's `rotate`, so it measures the
  composition's choice rather than echoing a configured return value. No snapshots, no skipped
  tests, no assertion-free bodies, no conditional assertion logic in a test body (the `if`/loop
  occurrences are inside the scripted doubles, which the profile records as the harness idiom).
- the `loop.test.ts` notice case asserts a length, three `toContain`s and three `not.toContain`s
  against the real bus event — the strongest assertion shape in the feature.
- `Redundant test` / `Framework under test` were considered and rejected: the two new files test a
  different level (composition, and the real loop) from the existing unit tests, which is double-loop
  TDD working as intended.
- `test/agent/loop/stubs.ts:233` (`Bypassed test utility`) and `loop.test.ts:2262` (`as unknown as
  TestAgentOptions`, the type escape that let cycle 28's harness defect through the compiler) are
  recorded as findings 13 and 14 rather than smells.
- Properties: the new tests are deterministic (fake timers in the composition test, the harness's
  scripted requester in the loop test), fast (both files well inside the 44 s scoped run), specific
  in their failure output (`expected [ 'fallback' ] to deeply equal [ 'rotate:key2' ]` names the
  broken behavior), and insensitive to refactoring — they assert observable outcomes only.

## Mutation results

No mutation tool is installed (`@stryker-mutator` absent from `pnpm-lock.yaml`), so the rubric's
deliberate-mutant fallback applies. **Ten deliberate mutations have been run against this feature
across the log and both audits (cycles 12, 13, 27, and pass 1); none survived.** This audit applied
two of them itself, one at a time, and restored each file byte-exactly (SHA-256 compared against a
pre-mutation hash; both files verified identical afterwards and the tracked tree is clean).

| Mutant | Behavior | Survived | Judgment |
| --- | --- | --- | --- |
| `engine.ts:336` — the caller's fallback chain consulted **before** `keyRotationRecovery` (this audit) | FR-007, U51, A6, A8 | **No** | Killed by both composition tests: `expected [ 'fallback' ] to deeply equal [ 'rotate:key2' ]` and `expected [ 'fallback', 'rotate:key2' ] to deeply equal [ 'rotate:key2', 'fallback' ]` — `Tests 2 failed (2)`. FR-007's ordering is now genuinely pinned, at the composition site, by the composition's own test |
| `loopService.ts:1562` — `code: 'api-key-rotation'` renamed (this audit) | FR-014, U53, A17 | **No** | Killed: `expected [] to have a length of 1 but got +0` — `Tests 1 failed \| 58 skipped (59)`. The notice test discriminates the warning by code, so it would catch a lost or mis-coded rotation notice |
| `keyRotationRecovery.ts:13` — rotation trigger threshold `>=` → `>` | FR-002, U4 | No | Killed by 3 tests (pass 1) |
| `keyRotationRecovery.ts:27` — `keyCount - 1` → `keyCount` | FR-008, U10 | No | Killed by exactly 1 test (pass 1) |
| `apiKeyRotation.ts:39` — dropped `% entries.length` | FR-004, A3, U23 | No | Killed by exactly 1 unit test; the turn-machine suite stayed green (finding 5) |
| `provider-service.ts:76` — `activeApiKeyId` never advanced | FR-005, A4, U25, U29 | No | Killed by 8 tests; the turn-machine suite stayed green (finding 4) |
| `credentials.ts:50` — proxy precedence inverted | FR-010, U32, A9, A12 | No | Killed by 4 tests across three levels (pass 1) |
| `engine.ts:336` — caller chain hoisted (cycle 27 mutant A) | FR-007, U51, A6, A8 | No | Killed by both composition tests; independently reproduced by this audit above |
| `engine.ts:336` — tail handoff to `options.recovery` dropped (cycle 27 mutant B) | FR-007, A8 | No | Killed by test 2 only — the tail half of FR-007 is pinned by exactly one assertion |
| `applyCredential` proxy line deleted; and the same at `model-requester-impl.ts:178` (cycle 12) | FR-010, A9–A12 | No | Killed by 2 catalog tests each |
| actor's `applyCredential` narrowed to `apiKey` only (cycle 13) | FR-010, A12 | No | Killed by 1 turn test |

The score is 100 % **on this sample of ten mutations over the feature's changed files**, not a
repository-wide mutation score and not a per-behavior guarantee: `keyRotationsRecovery`'s detail
formatting, the config transforms' unknown-field preservation, the TUI prompt's validation branches,
and the klient/node-sdk schema mirrors were never mutated. Two entries in the table above come from
the cycle log rather than from a run this audit performed; the two marked "(this audit)" were
reproduced here.

## Traceability

| Criterion | Tests | End to end |
| --- | --- | --- |
| FR-001 `rotate_keys`, default off | `apiKeyRotation.test.ts` gates; `providerService.test.ts` transform | Yes |
| FR-002 rotate after 429 budget exhausted | `keyRotationRecovery.test.ts` U4; `turn.test.ts` budget tests | Yes (real strategy; stubbed controller at turn level) |
| FR-003 403 rotates without spending budget | `keyRotationRecovery.test.ts` U1, U2 | Unit only — no acceptance-level test (A2, `NO_TEST`) |
| FR-004 definition order + wraparound | `apiKeyRotation.test.ts` U22–U24 | Unit only (finding 5) |
| FR-005 persist then retry | `apiKeyRotation.test.ts` U25; `providerService.test.ts` U29–U31 | Service level; not through the real controller (finding 4) |
| FR-006 retry inside the same turn | `turn.test.ts` `awaits an accepted proposal before the next request is built` | Yes |
| FR-007 rotation before substitute/fallback | `machineEngineRecovery.test.ts` (both tests) | **Yes — resolved in pass 2**; mutant-killed |
| FR-008 stop after a full cycle | `keyRotationRecovery.test.ts` U10, U11; `machineEngineRecovery.test.ts` handoff test | **Yes** — the handoff is now covered (was "untested" in pass 1) |
| FR-009 per-key proxy setting | `apiKeyRotation.test.ts` U15; `provider-manager.test.ts` U65 | Yes |
| FR-010 proxy cascade | `credentials.test.ts` U32–U34; `catalog.test.ts` A9–A11; `turn.test.ts` proxy tests | Yes (mutant-proved) |
| FR-011 add-key asks for the proxy | `provider.test.ts` U55–U62 | Yes |
| FR-012 per-key proxy persists | `provider.test.ts` U61 | Partial — written shape only, no restart (finding 8) |
| FR-013 fewer than two keys unaffected | `apiKeyRotation.test.ts` single-key; `turn.test.ts`; `provider.test.ts` U64 | Yes |
| FR-014 every rotation reported | `loop.test.ts` notice case; `keyRotationRecovery.test.ts` U13 | **Yes — resolved in pass 2**; mutant-killed |
| FR-015 no secret material | `provider-manager.test.ts` U66; `keyRotationRecovery.test.ts` U13; `loop.test.ts` notice case | Yes — the notice path is now asserted secret-free (was partial) |
| FR-016 concurrent switches are safe | `apiKeyRotation.test.ts` U28; `providerService.test.ts` U30 | Yes, in-process only |
| FR-017 managed/OAuth excluded | `apiKeyRotation.test.ts` U20, U21; `catalog.test.ts` U38 | Yes |
| FR-018 proxy on every request path | `catalog.test.ts` `carries the active key proxy for every model bound to the provider` | Partial — fallback tiers only; sub-agents and swarm unverified (finding 7) |
| SC-001 8 keys, run completes | `turn.test.ts` budget tests | Partial — 2–3 keys, no goal-mode run |
| SC-002 8 keys refused, notice per switch | `loop.test.ts` notice case | Partial — a single switch is asserted; the 8-key refusal run is not |
| SC-003 file names the key that served | `apiKeyRotation.test.ts` U25 | Yes |
| SC-004 rotation off changes nothing | `apiKeyRotation.test.ts` gates; `turn.test.ts` single-key | Yes |
| SC-005 egress per key | `catalog.test.ts` A9–A11 | Yes |
| SC-006 add key costs one extra question | `provider.test.ts` U59 | Yes |
| SC-007 no secret in output/logs/telemetry | `provider-manager.test.ts` U66; `loop.test.ts` notice case | Partial — no telemetry assertion |
| SC-008 one extra request per key | `keyRotationRecovery.test.ts` U10 | Partial — bound asserted, request count not measured |
| US5.3 (acceptance scenario behind A19) | **none** | **No — finding 12; not implemented either** |

**Criteria with at least one test: 19 of 26** — 15 of 18 FRs (all but partial FR-012, FR-015, FR-018,
which do have tests) plus 4 of 8 SCs. Every FR and every SC now has at least one test, FR-007 and
FR-014 included. The uncovered criteria are the partial ones above, and the single acceptance
scenario US5.3 has neither a test nor an implementation.

**Tests tracing to nothing: none.** Every test read this pass maps to a behavior id on the list.

## Baseline and regression attribution

This audit ran the feature's 12 test files itself: **12 files, 245 tests, 245 passed, 0 failed,
44.09 s** (`pnpm vitest run` over the twelve paths, with `KIMI_CODE_NO_AUTO_UPDATE` unset). Nothing
in the feature is red.

The whole-suite baseline is red and was **not** re-run by this audit (the caller barred it; the
profiled run took 819 s). The caller's attribution stands and matches pass 1: the 12 failing files
reduce to 9 that pass in isolation plus 3 that fail **identically** on the pre-feature commit
`3f2a19d8f` (41 failed | 385 passed there against 41 on this branch), so the red is not caused by
this feature. No file this feature touched is among the failing set. Treat the suite as red but
pre-existing, and do not read it as a regression.

## What was not audited

- **Git history as an ordering record.** Finding 11 is the reason: the three commits are a
  file-group split whose earliest member already contains the final cycle log and test list. No
  per-behavior ordering could be recovered, and none was inferred.
- **The full suite was not run** (budget). The counts in the second paragraph of "Baseline" are the
  recorded ones plus the scoped run above; three failing files are attributed only through the
  caller's `3f2a19d8f` comparison, which this audit did not reproduce itself.
- **Mutation was a sample of ten deliberate mutations**, of which this audit performed two. There is
  no repository-wide mutation score, and nothing under `apps/kimi-code/src/tui`, `packages/node-sdk`
  or `packages/klient` was mutated.
- **Coverage was not measured.** The profile's coverage command instruments the repository; no
  uncovered-branch data backs the traceability table.
- **The smell pass was targeted, not exhaustive.** Beyond the two remediation files, the other ten
  test files were re-checked mechanically (skips, deleted assertions, conditional assertions,
  snapshots) and by name, not by reading every body.
- **The ten pre-existing test files' bodies were not re-read line by line**; pass 1's findings on
  them are carried forward with the mechanical re-check above.
- **Performance, load, and the end-to-end CLI validation (T041, `quickstart.md`) were not run**, and
  neither were the repo gates (`pnpm lint`, the comment-free-zone check, a typecheck).
- **`apps/kimi-inspect` and `packages/pi-tui`** are outside the feature's blast radius and were not
  examined.

## Remediation

Written to `tasks.md` as `## Phase 11: TDD remediation` (T066–T076). The feature is not done until
blocking findings 12 and the `NO_TEST`/`TEST_AFTER` set are cleared. In order:

1. Resolve A19 / US5.3 — implement the exhausted-cycle notice and test it, or record the scenario as
   descoped in `spec.md` (finding 12).
2. Test U49 (per-step rotation budget) and A2 / A7 (the 403 acceptance variants).
3. Record the `TEST_AFTER` class for U51–U54, A6, A8, A9–A12, A17, A18, U57, U60, U62, U67 on the
   test list, so `DONE` is not read as test-first.
4. Drive the turn machine against the real `ApiKeyRotationController` and `ProviderService`
   (findings 4 and 5), cover the sub-agent/swarm paths (finding 7) and the restart path (finding 8).
5. Fix finding 13 (bypassed stub) and finding 14 (`as unknown as` escape), and refresh the stale
   frontmatter (finding 10).
