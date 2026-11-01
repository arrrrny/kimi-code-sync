# ⚠️ LANGUAGE RULE — MANDATORY

<!-- misfire-rule:begin -->
## ZURAFFA MISFIRE RULE (HARD, NON-NEGOTIABLE — HARDCODED TOP RULE)

**On ANY misfire (test failure, compilation error, runtime crash, unexpected output) related to zuraffa:**

1. **STOP IMMEDIATELY** on the first misfire.
2. **Report the issue** to zuraffa GitHub (`arrrrny/zuraffa`) with: the command that failed, expected vs actual output, and root cause.
3. **Continue with a workaround** to make the task pass (e.g., skip the failing test, use an alternative approach, or mock the failing component).
4. **Add a comment** in the code explaining the workaround applied and linking to the zuraffa GitHub issue.

**On ANY misfire related to the repo itself (not zuraffa):**

1. **STOP IMMEDIATELY** on the first misfire.
2. **Report the issue** to the repo's GitHub with full details.
3. **Continue with a workaround** to make the task pass.
4. **Add a comment** in the code explaining the workaround applied.

This rule takes precedence over all other rules. Never skip a misfire or rationalize it away.
<!-- misfire-rule:end -->

<!-- pool-pr:begin -->
## The forklift pool owns the PR — never merge a pull request yourself

Every pull request in these repos is reviewed by the **forklift pool**
(`arrrrny/forklift` — the local PR-review pipeline). It mints three tasks, in
this order, and that chain is the only sanctioned way from "PR opened" to "PR
merged":

1. `PR review <repo>#<n>` — the automated review; it posts its actionable
   findings on the PR.
2. `Apply review fixes <repo>#<n>` — one fixes round, pushed onto the PR's
   branch.
3. `Merge PR <repo>#<n>` — the merge itself; the task refuses while reviewer
   findings are still unaddressed.

**Never merge or close a PR by hand, and never merge one because it "looks
finished".** A hand merge lands the code while findings are still open: the
pool's fixes task is then killed by its closed-PR guard — the dispatcher log
says `…#<n> is closed — cancelled, no agent started` — and every finding the
review posted is dropped with nobody to own it. That is not a review, it is a
race the pipeline cannot win.

**Wait for the pool, and read the pool for the state.** The three task rows are
the truth; the PR page is not:

```bash
# the pool's board — loopback, IPv4-only (never `localhost`)
curl -s http://127.0.0.1:8888/tasks \
  | jq -r '.[] | select(.title | test("PR review|Apply review fixes|Merge PR")) \
          | [.title, .status, .id] | @tsv'
```

One row per stage. `status` is one of `queued`, `running`, `done`, `failed`,
`needsInput`, `cancelled`, `paused`. The PR is done when the
`Merge PR <repo>#<n>` row reads `done`. A fixes row that reads `failed` or
`cancelled` means the PR was **not** reviewed-and-fixed: read the row's
`errorMessage`, fix the cause, and let the pipeline requeue it (relabelling a
failed task requeues it in the same call — `POST /tasks/<id>/label`).

**An agent can simply wait for the whole process** — poll the board above until
the `Merge PR` row is terminal. Everything else is the pool's job: it drives
the review, the fixes round and the merge.
<!-- pool-pr:end -->

<!-- tmp-clone:begin -->
## Work in a `/tmp` clone — never in `~/Developer`

Every piece of work on a PR or an issue happens in its own clone under `/tmp`,
and that clone dies with the task:

```bash
git clone https://github.com/<owner>/<repo>.git /tmp/<repo>-<pr-or-issue>
```

Never clone into `~/Developer`, and never clone into the forklift checkout —
a bare repo slug as the clone target is how a stray checkout ends up inside the
repo root, and a clone left behind in `~/Developer` is indistinguishable from
the primary checkout. The pool's lanes already mint their clones this way
(`/tmp/fix-pr-<n>`, `/tmp/review-pr-<n>`, `/tmp/issue-<n>`, …) and remove them
when the task settles.
<!-- tmp-clone:end -->

**ALL responses MUST be in English ONLY. Never respond in Turkish, Chinese, or any other language, regardless of the user's locale or the presence of non-English content in the codebase. This is a hard rule with no exceptions.**

---


# Repository-level Agent Guide

Reply in the same language as the user.

This is a TypeScript monorepo built for agent-assisted development. Keep the root `AGENTS.md` limited to hot-path rules: the project map, hard constraints, and workflow requirements — things every task needs to know.

## 🔍 Code Search — MANDATORY FIRST STEP

**STOP. Before using `grep`, `find`, `rg`, `ripgrep`, or ANY shell-based search, you MUST use semantic search first.**

```bash
# THIS is how you search code — ALWAYS FIRST:
mcp__claude_context__search_code(query="what you're looking for", path="/absolute/path/to/repo")
```

**Why?** Semantic search understands code relationships, finds implementations by meaning (not just text), and catches things grep misses entirely.

**Rules:**
1. **ALWAYS** start with `mcp__claude_context__search_code` for code discovery
2. **ONLY** fall back to `grep`/`find`/`rg` when:
   - You need an EXACT literal string match (e.g., a specific error message)
   - The semantic search index is unavailable/broken
   - You're searching for file names, not code content
3. **NEVER** use grep as your first code search tool — it's slower and less accurate

**Indexing:** If search fails with "not indexed", run `mcp__claude_context__index_codebase(path="/absolute/path")` first, then retry.

## 📚 Zread Wiki — Check First

**Before diving into source code, check if a zread wiki exists for this project:**

```bash
# Check if wiki exists:
cat .zread/wiki/current 2>/dev/null && echo "Wiki exists" || echo "No wiki"

# If wiki exists, read the pages directly:
ls .zread/wiki/versions/$(cat .zread/wiki/current)/

# To regenerate wiki (if stale):
zread generate --stdio
```

**Why?** Zread generates comprehensive documentation from code. Reading the wiki is faster than crawling source files manually.

**Rules:**
1. **ALWAYS** check `.zread/wiki/current` before reading source files
2. If wiki exists, read the markdown pages directly — they're already indexed
3. If wiki is missing or stale, run `zread generate --stdio` to create it
4. Wiki pages live in `.zread/wiki/versions/<id>/` — read `wiki.json` for the TOC

## Working Principles

- Think from first principles. Start from real requirements, code facts, and verification results; if the goal is unclear, discuss it with the user first.
- Treat code, not documentation, as the source of truth. Unless the user explicitly says otherwise, do not read ordinary Markdown just to understand the implementation.
- Before making code changes, read the relevant code and the most recent constraints, and follow the nearest `AGENTS.md` in the directory tree.
- Keep changes focused. Do not slip in unrelated refactors along the way.
- When committing, do not add any co-author attribution, and do not reveal the identity of the agent in commit messages, PR descriptions, or any explanatory text.

## Project Map

- `apps/kimi-code`: the CLI / TUI application. It consumes core capabilities through `@moonshot-ai/kimi-code-sdk` and must not depend directly on engine packages. When writing or modifying its terminal UI, use the `write-tui` skill (`.agents/skills/write-tui/SKILL.md`).
- the browser web UI: **its source no longer lives in this repo.** It is developed in the code-app repo (`apps/web`) and shipped as the committed, prebuilt bundle `apps/kimi-code/dist-web` (gitignored, force-added), synced from code-app with `KIMI_CODE_REPO=<this checkout> pnpm run sync:web` — sync and commit the bundle in the same change whenever the web UI should ship differently. `apps/kimi-code/scripts/check-web-assets.mjs` guards packaging against a missing bundle. To hack on the web UI against this repo's server, run `pnpm dev:server` here and point code-app's `pnpm dev:web` at it via `KIMI_SERVER_URL`.
- `apps/vis`, `apps/vis/server`, `apps/vis/web`: visual debugging tools for sessions and replays.
- `packages/agent-core-v2`: the DI × Scope agent engine (the v2 port behind kap-server). Four `LifecycleScope` tiers — `App` / `Workspace` / `Session` / `Agent` (`app/scopes.ts`) — plus the L3 unit layer (`Service`/`Fiber` units, collection contribution points, the Feature seam in `src/features/`); there is no App-level session lifecycle facade — callers compose `ISessionIndex` → `IWorkspaceLifecycleService.handlerFor` → the handler.
- `packages/node-sdk`: the public TypeScript SDK and harness.
- `packages/kosong`: the LLM / provider abstraction layer.
- `packages/oauth`: Kimi OAuth and managed auth utilities.
- `packages/telemetry`: shared client-side telemetry infrastructure.
- `packages/transcript`: the isomorphic transcript rendering data layer — L1 agent-granular store, L2 idempotent operations, L3 `off/turn/block/delta` subscription granularity, L4 framework-free view registry, plus turn-cursor pagination. Pure TypeScript (browser-safe, no engine imports); the sole owner of the transcript contract types (`src/contract/`) and the op-batch sequencing contract.
- `packages/session-import`: standalone Node.js conversion of external sessions into a single user message that carries the conversation, full effective-history attachments, and image references. It has no engine or UI dependency; callers provide the destination session attachment directory and context budget.
- `packages/kap-server`: the Kimi Code server, backed by `@moonshot-ai/agent-core-v2`; exposes sessions over REST + WebSocket (`/api/v1` + `/api/v1/ws`), plus the `/api/v1/debug/*` reflection RPC surface (`--debug-endpoints`, loopback bind + bearer auth).
- `packages/remote-control`: the Kimi Remote Control tunnel client — registers this machine with the relay and forwards HTTP/WebSocket traffic to the local server, with a machine-wide single-instance lock; consumed by kap-server (the `/api/v1/remote-control` toggle) and by the CLI (`kimi web --remote-control`).
- `packages/agent-core-v2/src/remote`: the remote execution stack inside the engine — self-contained NDJSON line-framed RPC (codex exec-server dialect) between the local `ExecBridge` (ssh/docker/`command` launchers) and the light `kimi exec-server` executor, plus the provider that registers declared targets as `Environment`s (the fs/process RPC stubs are an OS backend under `src/os/backends/remote`, sibling of `node-local`); exported as `@moonshot-ai/agent-core-v2/remote` and `/remote/server`. The executor stays light — `src/remote/server` may import only node builtins, relative modules, `#/remote/protocol`, `#/os/interface`, `#/_base/execEnv` and the DI-free node-local fs/process backends it adapts (enforced by the package's `lint:imports`); the CLI reaches it only through the SDK's light `@moonshot-ai/kimi-code-sdk/exec-server` subpath, loaded dynamically in `src/cli/exec-server.ts`.
- `packages/klient`: the client SDK — a contract-driven facade over agent-core-v2 (`global.*` / `session(id).*` / `agent(id).*`, zod-validated); transport via subpath entry (`@moonshot-ai/klient/ipc|memory`, both return the same `Klient`); also hosts the e2e suites. See `packages/klient/AGENTS.md`.
- `packages/tree-sitter-bash`: a pure-TypeScript bash parser (no runtime deps, no wasm); `parse(source, { timeoutMs, maxNodes })` runs under a deterministic budget and returns a discriminated `ParseResult` — callers must treat aborted/hasError trees as "cannot analyze" and degrade. Parser only, no safety judgments; see the package README's "Known differences" section.
- `packages/minidb`: the embedded JSON document store (`MiniDb`) behind kap-server's search index — snapshot + WAL persistence with an exclusive write lock, a larger-than-RAM full-text layer, and persistent index generations. See `packages/minidb/AGENTS.md`.

## Environment Requirements

- **Node.js**: `>=24.15.0` (from the root `package.json` `engines`; `.nvmrc` is `24.15.0`, used by nvm / fnm / mise to pick the minimum recommended version).
- **pnpm**: `10.33.0` (from the root `package.json` `packageManager`).
- `pnpm install` will fail when the Node version is not satisfied, because `.npmrc` sets `engine-strict=true`.

## Monorepo Workspace Maintenance

- `pnpm-workspace.yaml` is the source of truth for workspace membership, but `flake.nix` also contains **hardcoded** `workspacePaths` and `workspaceNames` lists.
- **Whenever you add or remove a workspace package, you MUST update both `pnpm-workspace.yaml` and `flake.nix` — for every package, including leaf / test / e2e packages that nothing depends on.**
  - `pnpm-workspace.yaml` uses globs (`packages/*`, `apps/*`), so most packages land there automatically; `flake.nix` is fully manual and is where omissions happen.
  - Missing a path in `flake.nix`'s `workspacePaths` will silently drop files from the Nix build's `src` fileset.
  - Missing a name in `flake.nix`'s `workspaceNames` will break `pnpmConfigHook` because dependencies for that workspace will not be fetched.
- The automated "Check flake.nix workspace sync" (`scripts/check-nix-workspace.mjs`) only validates the transitive dependency **closure of `@moonshot-ai/kimi-code`**. A leaf package outside that closure (e.g. an e2e package nobody imports) slips through even when it is missing from `flake.nix`. A green check is therefore NOT proof that `flake.nix` is fully in sync — keep it updated by hand on every add/remove, do not rely on the check to catch omissions.

## General Coding Rules

- `packages/agent-core-v2`, `packages/kap-server`, and `packages/transcript` are comment-free zones: no comments of any kind — no line/block comments, no JSDoc (not even on exported symbols); the only exception is load-bearing lint-suppression directives (`oxlint-disable` / `eslint-disable`), while other tooling directives (`@ts-expect-error`, …) stay banned. Enforced by `scripts/check-no-comments.mjs` over `.ts`/`.tsx`/`.mts`/`.mjs` under `src/`/`test/`/`scripts/`, which runs as part of `pnpm lint`.
- For optional object properties, pass `undefined` directly instead of using conditional spread.
  - YES: `{ user }`
  - NO: `{ ...(user ? { user } : undefined) }`
- Optional object properties do not need to additionally allow `undefined` in the type.
  - YES: `interface Options { user?: User }`
  - NO: `interface Options { user?: User | undefined }`
- Internal methods with only a single parameter should not be turned into options objects just for stylistic uniformity.
- Split functions only along abstraction levels: each function reads as one level of narrative (Step-down Rule), and a wrapper that adds no new abstraction level — especially one with a single call site — is inlined instead of extracted.
- Except for a package's `index.ts`, other `index.ts` files should prefer `export * from './module';`.
- Do not add too many new test files. Prefer adding tests to the existing test file of the corresponding component or module.
- When a test fails because of a user modification, default to fixing the test first; do not change the implementation to satisfy an old test unless the implementation truly has a bug.
- Do not sacrifice code quality for external compatibility unless the user explicitly asks for it. Breaking changes go through changesets and a `major` bump, gated by the rule below.

## Experimental Features

- Gate a not-yet-public feature behind an experimental flag. Flags are env-driven and default off: `KIMI_CODE_EXPERIMENTAL_<NAME>` toggles one, `KIMI_CODE_EXPERIMENTAL_FLAG` enables all. Precedence is per-flag env > `[experimental]` config > master env > the flag's `default`. Release by flipping the entry's `default` to `true`.
  - `packages/agent-core-v2` and kap-server modules: there is no central catalog — declare the flag in the owning domain via `registerFlagDefinition` at import time, then check it with `IFlagService.enabled(id)`.

## Where to Update Instructions

- Hard rules that affect almost every task: update the root `AGENTS.md`.
- Rules that only affect a specific directory: update the nearest sub-directory `AGENTS.md`.
- Project-map entries stay at 1–2 sentences; deep package docs live in the package's own `AGENTS.md`.
- Keep instruction updates focused and supported by code facts.

## Release Workflow

- `master` accumulates changesets; `release/*` maintains `ci: release packages` PRs. Merging the matching version PR authorizes publication after its merge-commit CI succeeds. Ordinary pushes do not publish.
- npm publishing and native artifacts retain the existing Changesets flow. CDN upload and routing remain separately approved operations. See `.changeset/README.md` for migration and main synchronization.

## Workflow Requirements

- Prefer `rg` / `rg --files` when reading code.
- When designing changes, follow existing boundaries and local patterns first.
- In public text and test data, replace real internal identifiers with neutral placeholders such as `example.com`, `example.test`, and `YOUR_API_KEY`. Before opening a PR, ask a read-only agent to audit the diff for context-specific internal identifiers.
- When creating a PR, use the `write-pr` skill (`.agents/skills/write-pr/SKILL.md`) to write the PR description. The PR title must follow Conventional Commit style, e.g. `chore: remove legacy format commands`.
- When an AI agent opens or updates a PR, fill in `.github/pull_request_template.md` — link the related issue or explain the problem, then describe what changed. Do not leave placeholder text or submit a generic summary of the diff.
- Do not submit vague AI-generated PR text. The human author must understand the change well enough to explain the code, edge cases, and why the approach fits this repository.
- After finishing a task and before submitting a PR, you must run the `gen-changesets` skill (see `.agents/skills/gen-changesets/SKILL.md`) and generate a changeset under `.changeset/` according to its rules.
- Changesets must strictly follow the rules in `.agents/skills/gen-changesets/SKILL.md`: write one short user-facing sentence that states only what changed, and skip any change users cannot perceive.
- When generating a changeset, **never** decide on a `major` bump on your own — stop, explain, and get explicit user confirmation first; default to `minor`, fall back to `patch`. See `.agents/skills/gen-changesets/SKILL.md`.
- Prefer importing via `import ... from '#/...'`, which serves the same purpose as `import ... from '@/...'`.
- Do not commit throwaway scratch or exploratory files. Never stage:
  - Agent working notes or handoff/summary documents (e.g. `HANDOVER-*.md`, `HANDOFF-*.md`, `handoff.md`).
  - Throwaway UI/UX prototypes or design mockups (e.g. `*-designs.html`, `*-mockup.html`, `*-demo(s).html`) at the repo root or under a `design/` folder. The only tracked `.html` files should be Vite `index.html` entrypoints.
  Before committing or opening a PR, run `git status` and `git diff --staged --stat` and remove anything matching these patterns. Put scratch work under `.tmp/` (gitignored) instead of the repo root or the source tree.

## Code Review Rules

These rules apply to every pull request review, automated or human. The user populations and contract files they refer to are listed in `.agents/skills/review-pr/surfaces.md`.

### Review scope: the PR's diff, not the repo

- Review only the PR's diff against its base. A problem in code the PR does not touch (pre-existing on base) is reported as a non-blocking note, never as a blocking finding — the sole exception is pre-existing code that the PR's behavior directly triggers or amplifies.
- Report a class of issues in one pass: when a finding generalizes to several locations in the diff, list all of them at once instead of raising them across successive rounds.
- No pure style or personal-preference findings. Every finding carries a severity: P0 blocking / P1 should-fix / P2 suggestion.
- Re-reviews are incremental: review only what changed since the previous review; do not restate findings on unchanged code or re-raise resolved threads. Before treating a resolved thread as settled, verify the current code: suppress a finding only when the problem is actually fixed or the finding no longer holds.
- Domain-specific rules keep their own canonical homes — changesets (`.agents/skills/gen-changesets/SKILL.md`), comment-free zones (General Coding Rules), PR text (`write-pr` skill); review against those, not ad-hoc taste.

### Enumerate changed behavior, not just bugs

Any input that worked before the change — a config key, env var, CLI flag, provider response shape, session written by an older version, client request, or hook payload — must behave the same after it unless the PR declares the change. For every deleted or narrowed branch, condition, default, or prompt sentence, ask who reached it before and where they go now; for every new condition, ask which existing inputs now match it first. Flag a PR that calls a path "unchanged" when its branch condition moved.

### A flipped default or removed behavior needs a named loss and an escape hatch

Everyone on the old default is affected. Require the changeset to name the behavior users lose, not only the new default; a config, env, or flag escape hatch or a maintainer's explicit sign-off in the PR; and a test that pins the old behavior for the population that keeps it.

### Prompt text is behavior

Editing or deleting sentences under `packages/agent-core-v2/src/**/*.md` (system prompt, tool descriptions, reminders, overlays, built-in skills) changes agent behavior for every user who receives that prompt. "No test references the sentence" is not evidence of no impact. Require the PR to name the population that receives the text (every session, plan mode, a flag-gated feature such as Tower), what the sentence enforced, who relied on it, and what enforces it now.

### Contract files are tripwires

The manifests under `packages/agent-core-v2/docs/` (`config-manifest.toml`, `wire-manifest.d.ts`, `state-manifest.d.ts`), `packages/kap-server/test/__snapshots__/apiSurface.snapshot.test.ts.snap`, `packages/node-sdk/src/index.ts`, `packages/agent-core-v2/src/features/externalHooks/`, `packages/acp-server/`, and `apps/kimi-code/src/cli/` are consumed outside this repository: desktop and web in code-app, the VS Code extension, ACP clients such as Zed, SDK users, hook scripts, and headless-output parsers. When they change, require the PR to name the consumers and how data and clients from the previous release keep working.

### Ports and refactors carry the old path's feature inventory

When a change replaces or bypasses an existing path, require a list of what the old path did — env vars honored, fallbacks, accepted inputs — and where each item lives in the new path. A silently dropped item is a regression, not a cleanup.

### Silent failure outranks a crash

A change that makes the product silently ignore configuration, silently approve or skip an action, or silently drop data is the most severe finding: users get no signal to report.

## Fork Upstream Sync Policy (MANDATORY)

This repo (`arrrrny/kimi-code-sync`) is a **fork** of `MoonshotAI/kimi-code`. `master` carries fork-owned features that upstream will never accept (squeeze-model + secondary cascade, substitute-model on rate limit, compaction-model display, OpenAI-compatible context preservation, `/refresh-catalog`, model favorites, subscription-disable, free-models-only, etc.). The daily upstream sync (`.github/workflows/sync-upstream.yml`) MUST preserve them.

- **Never auto-resolve conflicts in favor of upstream.** The sync workflow aborts the merge on any conflict, opens a `sync`-labeled GitHub issue listing the conflicted files, and FAILS. A human resolves conflicts on a `sync/fork-sync-resolution` branch and merges manually. (An earlier version used `git checkout --theirs` on every conflict and silently dropped the compaction-model indicator — that must not return.)
- **Secondary guardrail:** after a clean merge, `sync-upstream.yml` checks a `FORK_OWNED_FILES` marker list. If a clean merge silently dropped a fork marker from an owned file, the sync fails and opens an issue. **When you add or change a fork-owned file, append it (with its survival marker) to that guard list** so future syncs cannot overwrite it unnoticed.
- **Do not run blind `git merge -X theirs` or `-s ours` against upstream** in any script, CI, or manual step. Conflicts are data the fork must keep — resolve them by hand.
- The `feat/daily-sync-ci` branch's `sync-and-release.yml` (uses `-X theirs` + a hardcoded owned-file list) is **deprecated and must not be enabled**; `sync-upstream.yml` on `master` is the source of truth.

<!-- local-ci:begin -->
## Running CI locally — `scripts/local_ci.sh`

GitHub Actions is billing-blocked on our private repos: every workflow run ends in
~3s with **zero steps executed**, so a red check here means nothing. Run the same
gate locally instead:

```bash
./scripts/local_ci.sh              # every job of the pull_request workflow
./scripts/local_ci.sh --plan       # print every step that would run, run nothing
./scripts/local_ci.sh --list       # workflows, triggers and jobs in this repo
./scripts/local_ci.sh --job <id>   # one job only
./scripts/local_ci.sh --event push # simulate the push-triggered workflow
./scripts/local_ci.sh --keep-going # do not stop at the first failure
./scripts/local_ci.sh -v           # echo each command before running it
```

It reads `.github/workflows/*` at run time and executes that workflow's jobs and
steps in order, so it cannot drift from CI — it is not a second copy of the gate.
Edit the workflow and the local run changes with it. Exit 0 means every executed
step passed.

What it cannot reproduce, and prints on startup instead of guessing:

- **Linux.** CI runs `ubuntu-latest`; this runs on macOS. The step set is the
  same, the platform is not. `sudo apt-get install` steps are mapped to a local
  presence probe rather than silently passed.
- **GitHub context.** A step needing `${{ secrets.* }}`, `${{ inputs.* }}`,
  `${{ vars.* }}`, `${{ steps.* }}` or `${{ github.event.* }}` is SKIPPED with the
  reason printed, never run with a guessed value.
- **`uses:` actions** are not executed. Toolchain setups (`setup-dart`,
  `setup-node`, `flutter-action`, `rust-toolchain`, …) become a version assertion
  against the local tool; checkout/cache/artifact are noted as no-ops; anything
  else is skipped by name. A Windows-runner job is skipped outright.
- **Cargo cross targets.** A step that builds for a rust cross target (e.g.
  `cargo build --target wasm32-wasip2`) is answered against this host's
  toolchain: a rustup toolchain carrying EVERY target the step asks for is used
  for that step — selected through the rustup proxy (`RUSTUP_TOOLCHAIN`), so
  `cargo +<toolchain>` keeps working — and when no local toolchain carries them
  the step is SKIPPED with the reason printed (`rustup target add <target>`) —
  never a red step that says nothing about the repo. The toolchain the workflow
  pins wins over another one that merely happens to carry the target. A host
  with no rust toolchain at all is a MISSING TOOLCHAIN, not a missing target:
  the step FAILS, as this script's convention says.
- **`container:`** jobs run on the host toolchain, not in the declared image.
- **`continue-on-error: true`** steps are advisory locally, exactly as in CI.
- **Local-only checkout state.** CI checks out the committed tree; this checkout
  also has gitignored and untracked paths, which whole-tree commands (e.g.
  `dart analyze .`) see. A step that fails naming only such paths is reported as
  a LOCAL-ONLY failure, not as a CI failure — pass `--strict` to count it anyway.
  A step that would `git clone` over a sibling checkout that already exists here
  is skipped; `--allow-outside-clone` forces it.

Canonical copy: `arrrrny/forklift` → `scripts/local_ci.sh` (reference:
`docs/forklift-scripts.md`).
<!-- local-ci:end -->

<!-- test-concurrency:begin -->
## Test concurrency (fleet guard)

Cap test concurrency at **2** — one un-capped `flutter test` fan starved the
shared host's services once (load 260; arrrrny/forklift#176).

There is **no config-file knob for `flutter test`**: it ignores
`dart_test.yaml` entirely (its only test-config file is
`flutter_test_config.dart`, an execution hook), so the flag is the only
lever — and it must be passed every time:

```sh
flutter test --concurrency=2
dart test -j 2
```

A repo whose `dart_test.yaml` carries `concurrency: 2` already defaults to it
for `dart test`; pass the flag anyway when you override it, and never raise
the number on a host that also runs the forklift pool. CI carries the same
flags in `.github/workflows`.
<!-- test-concurrency:end -->
