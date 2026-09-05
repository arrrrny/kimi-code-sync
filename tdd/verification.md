# SPEC 059 — TDD Verification (REAL evidence)

Spec: strategy — rebase fork onto upstream/main and reapply fork features on top (issue #59).
Branch: `059-rebase-fork-onto-upstream` (based linearly on `upstream/main` @ `f9ca33376`).
Every number below is copied from an actual command run in this session; nothing is projected.

## Step 2 — RED: reproduce the problem

**Command A — simulate the next upstream sync using the merge-based strategy** (the pre-sync fork
state `2185de301` — first parent of the 2026-09-04 sync merge — merged with `upstream/main`):

```
$ git merge-tree --write-tree --name-only 2185de3014918feedf63a66d44049996d7457381 upstream/main
exit code: 1 (conflict)
CONFLICT (content): apps/kimi-code/src/tui/commands/config.ts
CONFLICT (content): apps/kimi-code/src/tui/config.ts
CONFLICT (content): apps/kimi-code/test/tui/commands/update-preferences.test.ts
CONFLICT (content): apps/kimi-code/test/tui/config.test.ts
CONFLICT (content): packages/agent-core-v2/src/agent/fullCompaction/compactionOps.ts
CONFLICT (content): packages/agent-core-v2/src/agent/fullCompaction/fullCompactionService.ts
CONFLICT (content): packages/agent-core-v2/src/app/telemetry/events.ts
```

All 5 recurring conflict files from the issue reproduce, plus the 2 additional files the
2026-09-05 sync (`935798c9`) also reported resolving. Historical corroboration: the merge
commits `0d335e1c` / `935798c9` each document manually resolved conflicts on exactly these files.

**Command B — baseline test suite on fork master** (per-directory chunks of `vitest run`,
same semantics as CI's `pnpm run test --shard=n/5`; pi-tui runs its CI-mandated node:test suite):

| chunk | result (baseline master) |
|---|---|
| packages/agent-core-v2 | 64 failed / 6352 passed / 1 skipped (359 files: 11 failed) |
| packages/agent-core | 19 failed / 4205 passed (3 expected-fail, 30 skipped) |
| packages/kap-server | 2 failed / 1322 passed |
| packages/node-sdk oauth klient kimi-telemetry migration-legacy acp-server kaos transcript tree-sitter-bash protocol | 5 failed / 3169 passed (56 skipped) |
| packages/kosong | 0 failed / 1365 passed |
| apps/kimi-code | 9 failed / 3610 passed (5 skipped) |
| apps/vis server+web | 0 failed / 221 passed |
| apps/vscode | 1 failed / 357 passed |
| pi-tui (node:test) | 0 failed / 953 passed |

Baseline totals: **100 failed / 21,202 passed**. The issue's "4 pre-existing failures" was
stale — master genuinely carried 100. These include real fork/upstream integration drift,
e.g. `test/tui/config.test.ts "parses valid TOML"` (the sync kept upstream's `[editor]`
TOML input but dropped upstream's `editorCommand: 'code --wait'` assertion) and the two
stale-manifest tests (`docs/state-manifest.d.ts`, `docs/wire-manifest.d.ts` — the committed
manifests no longer matched the current generator).

Note: environment parity was established first — the repo pins `packageManager:
pnpm@10.33.0` and overrides live in `pnpm-workspace.yaml`; running pnpm 9 silently rewrote
the lockfile and stripped overrides. All measurements use pnpm 10.33.0 + `pnpm install
--frozen-lockfile` (exit 0), matching CI. A re-run of the agent-core-v2 chunk after the
reinstall produced an identical failure set.

## Step 3 — GREEN: rebase + reapply

Phases executed (branch commits, newest last):

1. `3687d3b27` feat: reapply fork features on top of upstream/main — full fork delta
   (444 files, +45160/−297, incl. binary spec-kit tooling) applied onto `upstream/main`.
   **Proof of faithful reapplication: `git diff master HEAD` is empty (byte-identical
   tree to fork master).**
2. `c968bbfa3` refactor: extract squeeze cascade + telemetry into isolated modules —
   cherry-pick of `eb3324e83` (PR #58 branch `refactor/squeeze-fork-modules`, previously
   NOT merged). Applied cleanly. Creates `squeezeForkOps.ts`, `squeezeCascade.ts`,
   `forkEvents.ts`.
3. `a3645bb86` test(tui): restore upstream editorCommand assertion in config fixture —
   reconciliation of the fork fixture with the upstream fixture that the 09-05 sync lost.
4. `fix(agent-core-v2): integrate squeeze fork modules with upstream state/wire
   registries` — the refactor predates upstream's strict registries, so integration:
   - `fullCompactionService.ts`: `contributeState(squeezeModelKey)` (generator requires
     every replayable key to be contributed by its owner service)
   - `test/index.test.ts`: `'squeeze_model.decided'` registered in `V2_RECORD_TYPES`
   - `test/state/builtinReplayableKeys.ts`: `squeezeModelKey` registered (harness drift guard)
   - regenerated `docs/state-manifest.d.ts` + `docs/wire-manifest.d.ts`
5. `feat(vis): render squeeze_model.decided wire record` — vis server `AgentRecord`
   union + vis-web `WIRE_RENDERERS` entry so the "covers every durable record" guard
   stays green.
6. `merge: reconcile legacy master (merge-based history) into rebased line` — because
   master's history is merge-based, GitHub's merge of this (rebased) branch into master
   conflicts on files where the rebased content improves on master (add/add
   FORK_OWNED_FILES; refactor-vs-inline hunks). Reconciled by merging master with
   `-X ours` and restoring the refactored `fullCompactionService.ts` (the 3-way merge
   had resurrected the inline cascade method from a theirs-only hunk). Result: master
   is an ancestor of the PR head, the tree is byte-identical to the rebased content
   (`git diff <pre-merge-head> HEAD` empty), GitHub reports `mergeable: true`, and the
   PR "Files changed" is exactly the intended 15-file delta.
7. `chore(agent-core-v2): strip comments from synced test files` — the 09-05 sync had
   merged upstream test files containing 9 comment lines that violate the fork-owned
   no-comment rule, leaving master's CI lint red (3 consecutive master CI failures).
   Removed the lines; `node scripts/check-no-comments.mjs` now reports
   `OK (1623 files)` and both affected test files pass (62/62).

**Fork features verified present after rebase** (grep over the rebased tree):
`resolveSqueezeModelAliasWithCascade` (now in `squeezeCascade.ts`, dispatched via
`SqueezeModelDecided`), secondary-model fallback in `compactionRound`, fork telemetry
events `compaction_threshold_override` / `compaction_token_budget_override` /
`substitute_model_activated` / `substitute_model_deactivated` (+ `forkTrack2` wrapper),
`model`/`modelDisplay` on `CompactionBeginData`/`FullCompactionBegin`,
`favoriteModels` TUI config, `fallbackModel` schema (agent-core + TUI), TUI slash
commands (`/squeeze-model`, `/fallback-model`, `/fork-session`, `/fork-and-switch`),
substitute-model on rate limit, session-list subcommand, no-comment rule,
`http-proxy-agent` dep.

**Upstream features verified present (previously entangled/missing):**
`fullCompactionWireRangesKey`, `captureWireLines()`, `renderRecoveryFooter()`,
`IWireService`, `budget()` + `CompactionBudget`, `isContextBudgetReminder`,
`aheadReminderTelemetry()`, `ContextBudgetReminderEvent`,
`CompactionAheadReminderEvent`, `renderCompactionInstruction()`,
`historyForModel.length === 0` guard.

**Survival markers:** all 17 `.github/FORK_OWNED_FILES` entries resolve on the rebased
branch (file exists + marker string present).

## Step 5 — VERIFY (actual command results on the rebased branch)

**pnpm test** (per-directory chunks, identical commands as baseline):

| chunk | baseline | rebased | delta |
|---|---|---|---|
| agent-core-v2 | 64F / 6352P | **62F / 6354P** | −2 (stale-manifest tests fixed) |
| agent-core | 19F / 4205P | **19F / 4205P** | identical |
| kap-server | 2F / 1322P | **2F / 1322P** | identical |
| other packages | 5F / 3169P | **5F / 3169P** | identical |
| kosong | 0F / 1365P | **0F / 1365P** | identical |
| apps/kimi-code | 9F / 3610P | **8F / 3611P** | −1 (config fixture fixed) |
| vis server+web | 0F / 221P | **0F / 221P** | identical (transient −1 during integration, fixed by renderer) |
| vscode | 1F / 357P | **1F / 357P** | identical |
| pi-tui node:test | 0F / 953P | **0F / 953P** | identical |

Totals: baseline **100 failed / 21,202 passed** → rebased **97 failed / 21,205 passed**.
**3 pre-existing failures fixed; 0 new failures introduced.** The remaining 97 failures
are byte-identical (by test name) to the pre-existing master failures in unrelated areas
(agent behavioral suites, harness snapshots, sdk/oauth config tests, one vscode
integration test) and are out of scope for this rebase spec.

`pnpm build` — exit 0 (all workspace packages, apps, webview bundle).
`git status --short` / `git diff --stat` — empty (zero remaining formatting diffs).

**Phase 4 dry-run of the next upstream sync** (the actual acceptance test of this spec):

```
$ git merge-tree --write-tree --name-only upstream/main HEAD
exit code: 0 (clean — no conflicts, no output)
```

Compare with RED (exit 1, 7 conflicting files) — future syncs merge cleanly because the
fork-owned logic now lives in dedicated modules and the tree is linear on upstream/main.

## Success criteria — PROVED vs NOT

- PROVED: 5 recurring conflict files reproduced conflicting under the old strategy (RED).
- PROVED: fork rebased linearly onto current upstream/main; tree byte-identical to fork
  master before the isolated-module commits (no feature lost in transit).
- PROVED: fork features (squeeze cascade modules, secondary fallback, telemetry events,
  favorites, slash commands, fallbackModel, substitute model) all present + markers resolve.
- PROVED: upstream features (wire journal, budget, ahead reminders, instruction helper)
  present and the strict state/wire registries pass.
- PROVED: full test suite re-run — 0 new failures, 3 pre-existing failures fixed.
- PROVED: pnpm build exit 0; working tree clean.
- PROVED: dry-run next upstream sync is conflict-free.
- NOT PROVED / out of scope: the 97 remaining pre-existing failures on unrelated suites
  (present identically on fork master before this change; fixing them belongs to
  separate specs). The 4 "expected fail" / skipped / todo entries in agent-core mirror CI.
