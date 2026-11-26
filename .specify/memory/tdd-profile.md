---
detected_at: 3f2a19d8f
ecosystems: [typescript]
default: typescript
stacks:
  typescript:
    cwd: .
    runner: vitest 4.1.4
    single: 'pnpm vitest run {file} -t "{name}"'
    file: pnpm vitest run {file}
    suite: pnpm test
    watch: 'script -q /dev/null pnpm vitest {file}'
    coverage: 'pnpm test:coverage {files}'
    mutation: null
    acceptance: pnpm vitest run {file}
    property: null
    approval: vitest snapshots
    contract: null
    test_glob: "packages/*/test/**/*.test.ts, apps/kimi-code/test/**/*.test.ts(x), **/*.{e2e,integration}.test.ts"
    exemplar:
      unit: packages/agent-core-v2/test/llm-adapter/model/credential-recovery.test.ts
      unit_pure_config: packages/agent-core-v2/test/llm-adapter/model/modelAuth.test.ts
      unit_service: packages/agent-core-v2/test/llm-adapter/provider/providerService.test.ts
      integration: packages/agent-core-v2/test/session/sessionTitle/titleExcerpt.integration.test.ts
      acceptance: packages/kap-server/test/authWiring.e2e.test.ts
      tui: apps/kimi-code/test/tui/components/dialogs/provider-manager.test.ts
      sdk_rpc: packages/node-sdk/test/config.test.ts
    helpers:
      - packages/agent-core-v2/test/setup.ts
      - packages/agent-core-v2/test/stubs.ts
      - packages/agent-core-v2/test/harness/index.ts
      - packages/agent-core-v2/test/harness/agent.ts
      - packages/agent-core-v2/test/harness/scripted-generate.ts
      - packages/agent-core-v2/test/harness/snapshots.ts
      - packages/agent-core-v2/src/_base/di/test.ts
      - packages/agent-core-v2/src/_base/di/testInstantiationService.ts
      - packages/kap-server/test/setup.ts
      - packages/kap-server/test/globalSetup.ts
      - packages/kap-server/test/helpers/sharedServer.ts
      - packages/kap-server/test/helpers/fixedAuth.ts
      - packages/kap-server/test/helpers/fakeModelCatalog.ts
      - apps/kimi-code/test/helpers/process.ts
      - packages/klient/test/helpers/conformance.ts
      - packages/klient/test/helpers/engine.ts
      - apps/vscode/test/webview/setup.ts
  node-test:
    cwd: packages/pi-tui
    runner: node --test (built-in, TypeScript run natively by Node 24)
    single: null
    file: null
    suite: pnpm --filter @moonshot-ai/pi-tui test
    watch: null
    coverage: null
    mutation: null
    acceptance: null
    property: null
    approval: null
    contract: null
    test_glob: "packages/pi-tui/test/*.test.ts"
    exemplar: null
    helpers: null
verified: [single, file, suite, coverage, acceptance, watch]
suite_baseline: red
suite_seconds: 819
---

# TDD Stack Profile

Monorepo, one language (TypeScript), two runners. Everything except `packages/pi-tui`
runs on vitest from the repo root: the root `vitest.config.ts` declares projects for
`packages/*` (minus `packages/minidb`, which has its own `test` script),
`apps/kimi-code`, `apps/vis/server`, `apps/vis/web`, plus the two `apps/vscode`
projects (`extension` on node, `webview` on jsdom). `packages/pi-tui` is deliberately
not in that list — its suite is `node:test` and vitest is pointed at no files for it.

The profile was detected against a **dirty working tree**: HEAD is `3f2a19d8f`, but the
branch carried uncommitted feature work, and the tree was being edited *while* this
profile was being measured (new files under `packages/agent-core-v2/src/...` appeared
mid-run, and one CI-shard failure below was a transient artifact of that). Re-run
`/speckit.tdd.setup refresh` once the branch is stable.

## Conventions to match

- Tests live in a package-level `test/` tree mirroring `src/`
  (`packages/agent-core-v2/test/llm-adapter/model/modelAuth.test.ts` covers
  `packages/agent-core-v2/src/llm-adapter/model/model-auth.ts`). TUI tests live under
  `apps/kimi-code/test/tui/`. Extend the test file that already owns the component;
  do not add a new file for the same module.
- Assertions use vitest `expect`, imported as `{ describe, it, expect, vi } from 'vitest'`.
  Doubles are `vi.fn()` / `vi.spyOn()`. There is no separate mocking library — `sinon`
  appears only inside the DI test helpers (`src/_base/di/testInstantiationService.ts`).
- On a source change, update the test file in the same change: `apps/kimi-code` uses
  `afterEach`-free inline setup, `packages/node-sdk` uses a `makeTempDir()` +
  `afterEach` cleanup pattern, and both are small enough to imitate directly.
- `packages/agent-core-v2` runs with `setupFiles: ['test/setup.ts']`, which deletes
  **every** `KIMI_CODE_*` environment variable and sets
  `KIMI_CODE_PERSISTENCE_MINIDB_READMODEL=false`. Tests in that package must not depend
  on inherited `KIMI_CODE_*` state — it is stripped before they run.
- `packages/kap-server` also clears `KIMI_CODE_*` and sets
  `KIMI_CODE_SEARCH_WORKER=false` (`test/setup.ts`), and its `globalSetup.ts` boots one
  real server on `127.0.0.1:0` in a temp home dir with a fake model catalog, exporting it
  through `project.provide('sharedServer', …)`. Acceptance tests read it via
  `sharedServer()` / `sharedAuthedFetch()` from `test/helpers/sharedServer.ts`.
- `apps/kimi-code` and `packages/node-sdk` set only `KIMI_LOG_LEVEL=off`. Anything else
  in the ambient environment **reaches those tests**. See the notes below.
- Engine tests build units through `packages/agent-core-v2/test/harness/`
  (`createTestAgent()`, `agentService`, `configServices`, `appServices`, …) and pin model
  output with `test/harness/scripted-generate.ts` instead of a live provider. Do not
  hand-build containers; use `createScopedTestHost` / `TestInstantiationService` from
  `src/_base/di/test.ts` when a raw scope is what the test needs.
- The clock and other ambient inputs are injected ports; do not call `Date.now()` in code
  under test.
- `packages/agent-core-v2`, `packages/kap-server`, and `packages/transcript` are
  comment-free zones — no comments or JSDoc of any kind, including in test files.
  Enforced by `scripts/check-no-comments.mjs` inside `pnpm lint`.
- Exemplars to imitate: `packages/agent-core-v2/test/llm-adapter/model/credential-recovery.test.ts`
  for a pure unit test, `.../test/llm-adapter/provider/providerService.test.ts` for a
  stateful service with events, `.../test/session/sessionTitle/titleExcerpt.integration.test.ts`
  for a harness-driven integration test, `packages/kap-server/test/authWiring.e2e.test.ts`
  for a real-server acceptance test, and
  `apps/kimi-code/test/tui/components/dialogs/provider-manager.test.ts` for a TUI component
  test (it strips SGR with a local helper and asserts on `component.render(width)` lines).

## Notes and constraints

- **`pnpm` is not on the default non-interactive `PATH`.** Prepend the corepack shims:
  `export PATH="/usr/local/lib/node_modules/corepack/shims:$PATH"` (pnpm 10.33.0, already
  in corepack's cache; Node v24.21.0 satisfies `engines.node >= 24.15.0`). Without this
  every command below fails with `pnpm: command not found`.
- **`suite_baseline: red`, and part of the red is not the repository's fault.**
  `pnpm test` took **819 s** and reported **55 failed | 16729 passed | 60 skipped (16844
  tests)** across **7 failed | 910 passed | 10 skipped (927 files)**, plus 2 unhandled
  `EnvironmentTeardownError`s from `agent-core-v2/test/agent/task/taskManager.test.ts`.
  Broken down by re-running each failing file alone on a quiet machine:
  - Environmental, 39 of the 55: `apps/kimi-code/test/cli/update/preflight.test.ts` fails
    whenever `KIMI_CODE_NO_AUTO_UPDATE=1` is inherited from the caller's shell (the
    `cli` project does not clear `KIMI_CODE_*`). With that variable removed the file is
    **48/48 green**. Unset it (or run with `env -u KIMI_CODE_NO_AUTO_UPDATE`) before
    trusting any suite result.
  - Load-induced flakes, green when run alone: `editor-keyboard-image-paste.test.ts`
    (16/16), `tree-sitter-bash/test/parse.test.ts` (62/62),
    `kap-server/test/instanceRegistry.test.ts` (18/18), plus one watchdog test in
    `kap-server/test/search/searchService.test.ts` when run alone.
  - Genuinely red in isolation, and must be fixed or explicitly excluded before any loop
    starts: `apps/kimi-code/test/tui/kimi-tui-message-flow.test.ts` →
    "prints the sign-up page and GitHub Issues links when not signed in" (the renderer
    emits `https://www.kimi.ai/code` via `kimiCodeSignupUrl()`, which derives from the
    developer's own login region, while the test hardcodes `https://www.kimi.com/code`);
    `packages/tree-sitter-bash/test/performance.test.ts` → "a 500KB heredoc body parses
    within the default budget (few nodes)"; `packages/kap-server/test/search/searchService.test.ts`
    → "keeps a query valid when readonly refresh replaces its handle during source validation".
  - `packages/agent-core-v2/test/app/config/configManifest.test.ts` ("docs/config-manifest.toml
    is up to date") failed in a CI-shard run but not in the unsharded run; it was a
    transient artifact of the concurrent edit described above, not a baseline failure.
- **A per-cycle full run is not viable.** 819 s for the suite; the CI gate is sharded into
  five jobs (`pnpm run test --shard=<n>/5`; a single shard measured **232 s** for 3353
  tests). For the inner loop use the file or single-test command (a directory-scoped run
  is cheap: `pnpm vitest run packages/agent-core-v2/test/llm-adapter` = 216 tests in 5 s),
  and before committing run the package you touched, e.g.
  `pnpm vitest run packages/agent-core-v2`.
- **The single-test command exits 0 when the name matches nothing.** Verified both ways:
  with a real name (`-t "prefers the model inline credentials over everything else"`) it
  reports `1 passed | 25 skipped`; with a name that matches nothing it reports
  `Test Files 1 skipped (1)` / `Tests 26 skipped (26)`, exit code **0**. It is not silent —
  but a loop that gates on `$?` reads that as success. **Always assert on the
  `Tests  N passed` line, never on the exit code.** When a hard gate is needed, use the
  JSON reporter and check the count, which does fail loudly (`numPassedTests` is 1 for a
  real name, 0 for a no-match, even though `numTotalTests` stays 26):
  `pnpm vitest run {file} -t "{name}" --reporter=json --outputFile=.tmp/vitest-single.json`
  then require `numPassedTests === 1`. A file path that matches nothing *does* fail
  (`No test files found, exiting with code 1`), so only the test name needs the guard.
- **Coverage** uses the v8 provider with `reporter: ['text', 'html']`; the html report is
  written to `coverage/`. The root config's `include` is repo-wide
  (`packages/*/src/**`, `apps/*/src/**`, `apps/vis/*/src/**`), so a scoped run still
  reports repo-wide percentages — read the per-file rows, not the `All files` line.
  Verified: `pnpm test:coverage packages/agent-core-v2/test/llm-adapter` = 14 files /
  216 tests, 47 s, report produced. Pass `--` to `pnpm test:coverage` at your peril: it is
  swallowed and the filter is ignored, which starts a coverage-instrumented run of the
  whole suite (abandoned after 17 minutes). The unfiltered full-suite coverage run is not
  a loop step.
- **Watch mode needs a TTY.** `pnpm vitest` piped to a file runs once and exits. Verified
  under a pseudo-TTY: `script -q /dev/null pnpm vitest {file}` prints
  `PASS  Waiting for file changes…`. (On Linux, `script` takes the command differently:
  `script -qec '<cmd>' /dev/null`.)
- **No mutation tool and no property-based library.** `@stryker-mutator` and `fast-check`
  are absent from `pnpm-lock.yaml`. The audit falls back to deliberate mutants on the
  highest-risk behaviors, and invariants become boundary examples rather than properties.
  Adding either is a separate, user-approved change.
- **Snapshots exist but are rare.** `packages/kap-server/test/__snapshots__/apiSurface.snapshot.test.ts.snap`
  and `packages/migration-legacy/test/sessions/__snapshots__/fixtures.snapshot.test.ts.snap`;
  14 test files use `toMatchSnapshot`/`toMatchInlineSnapshot`. There are no custom
  `expect.extend` matchers anywhere — if a test needs one, it is new surface.
- **Do not run the live suites.** `apps/kimi-code/test/e2e/real-llm-smoke.e2e.test.ts`
  self-skips unless `KIMI_E2E_REAL=1`; `packages/klient/test/e2e/legacy/*` self-skip unless
  a server answers at `KIMI_SERVER_URL` (default `http://127.0.0.1:58627`). `klient`'s
  `smoke:boundary` and `smoke:select-tools` scripts drive **real** models from the
  developer's own `~/.kimi-code/config.toml` — they are manual probes, never part of a
  TDD cycle. The suite itself is offline-safe: no test file references live provider
  endpoints or API-key variables, and `kap-server` starts its own server on loopback.
- **Areas the root gate does not run.** `apps/kimi-inspect` has 10 test files and a
  `test: vitest run` script but no `vitest.config.ts` and no entry in the root project
  list — its tests are not part of `pnpm test` and need characterization coverage before
  anyone changes that app. `packages/pi-tui` is covered by its own `node:test` stack
  (below). `apps/vis/server`, `apps/vis/web`, and the `apps/vscode` projects are in the
  root list and were not profiled individually.

## pi-tui (node:test) conventions

`packages/pi-tui` is the second runner: `test: "node --test test/*.test.ts"`, executed as
`pnpm --filter @moonshot-ai/pi-tui test`. Verified: 1037 tests, 1036 passed, 1 skipped,
9.5 s. Its `vitest.config.ts` sets `include: []` with `passWithNoTests: true` so the root
run skips it silently, and CI gives it a dedicated `test-pi-tui` job. No single-test
command, coverage setting, or shared helper here was verified — resolve them with
`node --test --test-name-pattern "<name>"` at the moment you need them, and do not assume
the vitest commands above apply. This stack is unrelated to the agent-core-v2 feature
work; it is recorded so the loop does not mistake the root suite for complete coverage.
