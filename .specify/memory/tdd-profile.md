---
detected_at: 1078f60dd
ecosystems: [typescript]
default: typescript
stacks:
  typescript:
    cwd: .
    runner: vitest
    single: 'pnpm exec vitest run {file} -t "{name}"'
    file: pnpm exec vitest run {file}
    suite: pnpm test
    watch: pnpm exec vitest
    coverage: pnpm exec vitest run --coverage
    mutation: null
    acceptance: null
    property: null
    approval: null
    contract: null
    test_glob: "**/*.test.ts"
    exemplar:
      unit: packages/agent-core-v2/test/app/sessionLegacy/sessionLegacy.test.ts
      acceptance: null
    helpers:
      - packages/agent-core-v2/test/setup.ts
      - packages/agent-core-v2/test/harness
verified: [single, file, suite, coverage]
suite_baseline: red
suite_seconds: 1670
---

# TDD Stack Profile

Detected against `git rev-parse --short HEAD` = `1078f60dd` on branch `828-fork-session`, clean working tree.

## Stacks

Single stack: **TypeScript** via vitest 4.1.4 (root `vitest.config.ts`; multi-project: `packages/*`, `apps/kimi-code`, `apps/vscode`). The repo also runs `@moonshot-ai/pi-tui`'s suite on `node:test` separately (`pnpm --filter @moonshot-ai/pi-tui test`); that project is not part of the root vitest workspace.

## Conventions to match

- Test files end in `.test.ts` and sit next to the source tree under each project's `test/` directory (e.g. `packages/agent-core-v2/test/...`, `packages/acp-adapter/test/...`, `apps/kimi-code/test/...`). There is no `src/**/__tests__/**` convention.
- Tests import `describe`, `it`, `expect`, `beforeEach`, `afterEach` directly from `'vitest'`. There is no chai/jest layer.
- Doubles: project uses `TestInstantiationService` and `createScopedTestHost` from `packages/agent-core-v2/test/harness` as the DI testing seam; the `harness/agent.ts` module is the agent-runtime test harness (used by tool/runtime tests). No project-wide mock library — tests construct lightweight fakes inline. For the v2 layer, `packages/agent-core-v2/test/setup.ts` clears any `KIMI_CODE_EXPERIMENTAL_*` env vars before each run and pins `KIMI_CODE_EXPERIMENTAL_PERSISTENCE_MINIDB_READMODEL=false` so test outcomes are stable across the local shell.
- Custom matchers: none registered globally — assertions are plain `expect`.
- Snapshot tool: built-in vitest snapshot (`expect(...).toMatchSnapshot()`); vitest reports 5 snapshot failures in the current baseline (see "Suite baseline" below).
- Coverage is reported via the v8 provider with `text` + `html` reporters (`vitest.config.ts` `coverage` block; coverage includes `packages/*/src/**/*.ts` and `apps/*/src/**/*.ts`, excluding `*.test.ts`, `*.spec.ts`, `dist`).
- Watch mode: `pnpm exec vitest` (no flags).
- Lint-policy tests exist as first-class test files (`packages/agent-core-v2/test/lint/*.test.ts`) — they assert repo-wide invariants (event uniqueness, vendor-name gates, import boundaries). Treat them as part of the suite, not as out-of-band checks.
- **No comments** convention applies to `packages/agent-core-v2`, `packages/kap-server`, and `packages/transcript` (enforced by `scripts/check-no-comments.mjs` running in `pnpm lint`). This includes test files in those packages.

## Exemplars

- Unit exemplar: `packages/agent-core-v2/test/app/sessionLegacy/sessionLegacy.test.ts` — v2 unit test, `describe`/`it` from vitest, no harness dependencies, exercises a small persisted-state service. The loop should imitate this style for plain unit tests.
- Acceptance exemplar: **none**. There is no separate acceptance/e2e layer wired into vitest. `packages/acp-adapter/test/*.test.ts` covers the ACP adapter end-to-end but is part of the same vitest workspace, not a distinct runner. The fork-session feature will likely need an e2e test against the harness (`packages/agent-core-v2/test/harness`); the loop should NOT invent a new runner for it.

## Helpers to reuse

- `packages/agent-core-v2/test/setup.ts` — global test setup; clears experimental env and pins the readmodel flag. The loop should treat this as off-limits to modify.
- `packages/agent-core-v2/test/harness/` — DI testing harness (`TestInstantiationService`, `createScopedTestHost`, `agent.ts` runtime harness). Reuse these for any DI/scope test rather than hand-rolling container setup.
- For non-v2 packages, follow the per-package test conventions already established in that package's `test/` directory.

## Notes and constraints

### Suite baseline: RED

`pnpm test` on a clean tree at `1078f60dd` (branch `828-fork-session`, no local changes) reports:

```
Test Files  99 failed | 1079 passed | 12 skipped (1190)
     Tests  269 failed | 19429 passed | 3 expected fail | 81 skipped | 2 todo (19784)
   Errors  6 errors
 Duration  1669.93s
```

Plus 5 failed snapshots and unhandled rejections of the form:

```
Error: InstantiationService has been disposed
  at packages/agent-core-v2/src/features/cron/cronAgentRuntime.ts:269:9
  in tickCron
  originating in packages/agent-core-v2/test/tool/tool.test.ts
```

The unhandled rejection pattern (DI disposed mid-test, cron runtime keeps a stale xstate actor) is consistent and surfaces across multiple test files. **No loop can be started on top of this baseline** — every red from a behavior test would be indistinguishable from this pre-existing noise, and every green would be unprovable until the baseline is restored.

The detection-time suite run took **1670 seconds (~28 minutes) wall time** on a single machine. CI runs it sharded across 5 machines (`pnpm run test --shard=N/5` in `.github/workflows/ci.yml`), so CI per-shard is approximately 5× faster (~6 min/shard).

### Per-cycle run viability

A 28-minute full-suite run is NOT viable inside a TDD red-green-refactor loop. A scoped file run is viable: e.g. `pnpm exec vitest run packages/agent-core-v2/test/app/sessionLegacy/sessionLegacy.test.ts` finishes in ~12s (transform + import overhead; tests themselves run in 23ms). The loop should run **per-file**, not per-suite, and reserve full-suite runs for commits/audit.

### Missing capabilities (explicit null)

- **Mutation**: not installed. `pnpm-lock.yaml` has no `@stryker/*` or equivalent. StrykerJS is the JS/TS ecosystem default and would need to be added by the user as a separate change.
- **Property-based testing**: not installed. `pnpm-lock.yaml` has no `fast-check`. Ecosystem default is `fast-check`.
- **Acceptance / e2e runner**: not distinct from vitest. The closest analog is the ACP adapter test suite, which is just more vitest tests.
- **Contract testing**: not installed. Ecosystem default is Pact.
- **Watch mode**: present (`pnpm exec vitest`).

### Areas without a runner

None observed at detection time — every package under `packages/*` and `apps/*` has vitest test files or is intentionally out-of-scope (build scripts, docs). The TUI tests (`apps/kimi-code/test/tui/*`) are part of the vitest workspace and include lint-guard tests like `chalk-named-color-guard.test.ts` and `printable-key-guard.test.ts`.

### Things this profile did not check

- The `pi-tui` package's `node:test` suite (run via `pnpm --filter @moonshot-ai/pi-tui test` per CI) is a separate runner from vitest and is NOT covered by the commands above. If fork-session work touches pi-tui, the loop needs a separate single-test command for that stack — verify by running `pnpm --filter @moonshot-ai/pi-tui test -- --help` before relying on it.
- I did not exercise `--shard=N/M`. The CI command is `pnpm run test --shard=N/5` and would need verification before being trusted as a fast subset.
- Mutation / property testing are deliberately not verified — both are `null` and need a separate install before they can be recorded.

## Recommended next action

**The loop cannot start until the suite baseline is restored to green.** Options for the user:

1. **Investigate the failing files first.** Start with `packages/agent-core-v2/test/tool/tool.test.ts` (the source of the `InstantiationService has been disposed` unhandled rejections) and the 5 snapshot failures. If those are pre-existing breakage, opening an issue / branch to fix them is a prerequisite to running TDD here.
2. **Scope TDD to a green subset.** Use vitest's `-t` / `project` flags to drive only the package(s) the fork-session feature will live in (likely `packages/agent-core-v2` and `apps/kimi-code`). This makes the loop workable, but the profile still records the full suite as red and the audit will not be able to claim "all existing tests pass".
3. **Defer the spec-whole chain** until the baseline is green.

Until one of those is resolved, this profile is honest about the situation but **no downstream TDD skill should be run** — running `tdd.plan` / `tdd.run` on top of a red baseline would either (a) be unable to prove a new red is "the right red", or (b) report a false green when a new behavior test actually passes by coincidence with broken shared state.