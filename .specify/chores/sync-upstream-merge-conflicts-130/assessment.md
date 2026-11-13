# Chore Assessment: sync upstream — resolve the 2026-11 restructure conflicts (#130)

- **Slug**: sync-upstream-merge-conflicts-130
- **Created**: 2026-11-13
- **Source**: https://github.com/arrrrny/kimi-code-sync/issues/130 (loaded via `speckit.chore.fetch`-style ingest: `gh issue view 130`)
- **Verdict**: needs scoping
- **Size**: large

## Report (verbatim or summarized)

Issue #130 (labels: `sync`, author: `github-actions`, opened 2026-11-03T03:03:28Z, state OPEN) reports that
the daily upstream sync aborted on **7** merge conflicts and, per the Fork Upstream Sync Policy in
`AGENTS.md`, opened this issue for human resolution. Auto-resolving toward upstream is forbidden.

Issue-listed conflicted files:

- `packages/agent-core-v2/docs/state-manifest.d.ts`
- `packages/agent-core-v2/src/agent/loop/requester.ts`
- `packages/agent-core-v2/src/workspace/sessionLifecycle/internal/forkTurnSlice.ts`
- `packages/agent-core-v2/test/agent/loop/loop.test.ts`
- `packages/agent-core-v2/test/app/config/config.test.ts`
- `packages/agent-core-v2/test/features/plan/plan.test.ts`
- `packages/agent-core-v2/test/tool/tool.test.ts`

Commit refs carried by the issue:

- local master: `3706480fd0967ce2cf636824603e70fdd4e83f26`
- upstream/main: `fc3b521b8b68468268bb4cfe7f45008ce08b2b99`

### Verified drift from the issue snapshot (re-measured 2026-11-13 after `git fetch upstream main`)

The issue's snapshot is badly stale. Both sides moved substantially after it was filed:

| Ref | Issue says | Live now |
|-----|-----------|----------|
| `origin/master` | `3706480fd` | `8a4a5f0f5` (2 commits past — Zuraffa promo docs) |
| `upstream/main` | `fc3b521b` (2026-11-02) | `638c6ffe0` (2026-11-13) |
| merge-base | — | `a2afdbc7d` (2026-10-30) |
| fork commits ahead of merge-base | — | **301** |
| upstream commits ahead of merge-base | — | **118** |

The live conflict set is therefore **not 7 files but 111 conflicted paths** (measured with
`git merge-tree --write-tree origin/master upstream/main`, exit 1):

- 50 `CONFLICT (content)`
- 41 `CONFLICT (file location)` — of which **39 are `*.d.ts` build artifacts**
- 20 `CONFLICT (modify/delete)`

Merged-tree diff: `2468 files changed, 109814 insertions(+), 213756 deletions(-)`.

### The dominant cause: upstream's 2026-11 restructure

Two upstream commits reshape the tree the fork's features live in:

- `aced52f21` — **`refactor(core): extract loop, llm, and tool into a DI-free package (#4820)`** (2026-11-12),
  501 files, +12,548/−13,205. Creates a new `packages/core` (`@moonshot-ai/core`, "Loop, llm, and tool
  runtime without DI or adapters") and deletes `packages/agent-core-v2/src/human/llm/**`,
  `human/llm-requester/**`, `human/agent/**`, `human/compaction/**`, `agent/loop/machine/**`,
  `agent/contextMemory/{contextMemory,contextMemoryService}.ts`, plus the kap-server transcript services.
- `2c52fc1e2` — **`refactor: remove standalone kosong package (#4599)`** (2026-11-02), 91 files deleted.
- `1dd557864` — **`feat(kap-server): stream agent conversations as turns and items (#4663)`**, removes the
  `packages/transcript` package (32 files).

### Key finding: a plain merge silently deletes two fork-consumed packages

`git merge-tree` on `origin/master` + `upstream/main` produces a tree whose `packages/` contains **no
`kosong` and no `transcript`** — the merge resolves both as clean upstream deletions:

- fork `origin/master` still has `packages/kosong` (91 files) and `packages/transcript` (33 files)
- fork `packages/node-sdk` imports `@moonshot-ai/kosong` from **9 source files**
  (`catalog.ts`, `config/model.ts`, `context.ts`, `errors.ts`, `interaction.ts`,
  `kimi-code-model-provider.ts`, `model-provider.ts`, `replay.ts`, `types.ts`)
- fork `packages/kap-server/src/services/transcript/{coreEventMap,wireCache}.ts` are **modified on the fork
  side** (46 insertions/32 deletions since the merge-base) and **deleted upstream** — the only two entries
  that would be reported as `modify/delete` conflicts, i.e. the *visible* part of the problem.

Because git reports these as clean deletions rather than conflicts, the merge would land with the fork's
`node-sdk` importing a package that no longer exists. The `AGENTS.md` secondary guardrail
(`.github/FORK_OWNED_FILES`) would **not** catch it: `packages/kosong` and `packages/transcript` have
**zero entries** in that list. This is the highest-severity risk of the whole chore.

### Fork-owned surface stranded by the restructure

Of the 70 fork-owned paths in `.github/FORK_OWNED_FILES`:

- **3 were deleted by upstream at the merge-base** (genuine upstream removals the fork must answer for):
  - `packages/agent-core-v2/src/agent/loop/machine/engine.ts`
  - `packages/agent-core-v2/src/human/agent/turn.ts`
  - `scripts/check-no-comments.mjs` — the comment-free-zone enforcer, still wired into `pnpm lint`;
    upstream deleted it in `1ab19190e`→ later never had it. **The fork must keep this file.**
- **31 are fork-only files upstream never had** (expected; they simply stay).
- **6 fork-owned files in `human/llm/**` have no path in the new `packages/core` tree** — verified
  `MISSING` at the mechanical rename target:
  - `src/human/llm/model.ts` :: `proxyUrl`
  - `src/human/llm/protocol/session-headers.ts` :: `x-opencode-session`
  - `src/human/llm/requester/bases/openai/requester.ts` :: `buildProxyDispatcher`
  - `src/human/llm/requester/bases/openai-responses/requester.ts` :: `buildProxyDispatcher`
  - `src/human/llm/requester/bases/anthropic/requester.ts` :: `buildProxyDispatcher`
  - `test/human/llm/requester/bases/x-opencode-session.test.ts` :: `x-opencode-session`

  These are **ports, not merges**: the fork's per-key proxy / session-affinity features must be re-applied
  onto upstream's new `packages/core/src/llm/{endpoint,requester,protocol}.ts`. PR #129 already performed
  exactly this kind of port once (it consolidated the three `requester/bases/*` dispatchers into a single
  `buildProxyFetch` seam in `human/llm/endpoint.ts`); the new sync must repeat it against `packages/core`.

### The 32 `.d.ts` files are accidentally committed build artifacts

39 of the 41 `file location` conflicts are `*.d.ts` files under
`packages/agent-core-v2/src/human/{llm,llm-requester}/`. They are **not source** — they are TypeScript
declaration output committed by the PR #129 sync merge `dd18eb820`:

- `0` such files exist at the merge-base; `32` exist at `3706480fd` (post-PR #129)
- none are gitignored (`git check-ignore` misses), none are tracked in the current `HEAD` tree
- they reference dead v1 paths (`#/llm/policy/policy`, `#/llm/response`) and are **referenced by nothing**

They inflate the conflict count and would otherwise be mechanically "moved" into `packages/core`, carrying
garbage across the restructure.

### What PR #129 did, and what this sync must repeat

PR #129 (`chore: sync upstream 2026-11-01`) is the template: it resolved 40 conflicts against upstream's
2026-10 llm-core restructure by **union-resolving every file** — adopting upstream restructures, re-applying
fork-owned lines on top, never resolving wholesale toward either side — and re-pointed
`.github/FORK_OWNED_FILES` to the post-restructure paths so the next sync fails loudly on a silent drop.
This sync is the same shape, one restructure larger.

## Summary

Bring `origin/master` up to `upstream/main` (`638c6ffe0`) by hand, preserving every fork-owned feature.
It is a chore (recurring maintenance integration), not a bug (nothing in shipped code is broken) and not a
feature (no new user-facing capability). What makes it **need scoping** rather than being a straight
`in scope` chore: upstream's restructure is not a set of independent text conflicts — it moves the packages
the fork's features live in, and a plain merge silently deletes `packages/kosong` and `packages/transcript`
that the fork's `node-sdk` still imports. The work is a *port* of six fork-owned features onto
`packages/core`, plus a decision about the two removed packages, and neither is expressible as a single
mechanical conflict resolution.

## Constitution Check

`.specify/memory/constitution.md` is still the **unratified placeholder template**
(`[PRINCIPLE_*]` placeholders, `Version: [CONSTITUTION_VERSION]`), so it imposes no binding principles.
The governing constraints are therefore:

- **`AGENTS.md` → Fork Upstream Sync Policy (MANDATORY)**: never auto-resolve in favor of upstream; no blind
  `git merge -X theirs` / `-s ours` in any script, CI, or manual step; conflicts are data the fork must keep
  and are resolved by hand.
- **`.github/FORK_OWNED_FILES`**: the secondary guardrail — every listed file must still exist and still
  contain its survival marker after the merge; any new or changed fork-owned file **must** be appended.
- **Comment-free zones** (`scripts/check-no-comments.mjs`): `agent-core-v2`, `kap-server`, `transcript`
  must contain no comments; `oxlint-disable` / `eslint-disable` are the only exception. **This script is
  itself deleted upstream** and must be retained.
- **Bilingual docs** (`docs/AGENTS.md`): `docs/en` and `docs/zh` must stay in sync — both
  `docs/{en,zh}/reference/server-api.md` conflict here.
- **Monorepo workspace maintenance**: `pnpm-workspace.yaml` **and** `flake.nix` must agree on workspace
  membership for every add/remove. Upstream's `packages/core` addition and `kosong`/`transcript` removal
  both touch this; `flake.nix` is a conflicted file.

No principle is violated by the chore itself. A `major` bump / changeset decision is deferred to the user.

## Affected Paths

### Upstream deletions the merge will take silently (highest risk)

- `packages/kosong/**` (91 files) — deleted upstream in `2c52fc1e2`; fork `node-sdk` imports it from 9 files
- `packages/transcript/**` (33 files) — deleted upstream in `1dd557864`; fork added only `AGENTS.md` (56 lines)
- `packages/kap-server/src/services/transcript/coreEventMap.ts` — `modify/delete`: fork-modified, upstream-deleted
- `packages/kap-server/src/services/transcript/wireCache.ts` — `modify/delete`: fork-modified (46 ins/32 del), upstream-deleted
- `packages/kap-server/test/services/transcript.test.ts` — `modify/delete`

### Fork-owned files with no upstream destination (must be ported)

- `packages/agent-core-v2/src/human/llm/model.ts` (`proxyUrl`)
- `packages/agent-core-v2/src/human/llm/protocol/session-headers.ts` (`x-opencode-session`)
- `packages/agent-core-v2/src/human/llm/requester/bases/{openai,openai-responses,anthropic}/requester.ts` (`buildProxyDispatcher`)
- `packages/agent-core-v2/test/human/llm/requester/bases/x-opencode-session.test.ts`
- `packages/agent-core-v2/src/agent/llmRequester/llmRequesterService.ts` (`substituteModelActiveKey`, `activateFallback`)
- `packages/agent-core-v2/src/agent/fullCompaction/{squeezeForkOps,squeezeCascade,handoffDocument,handoffInstruction,flag}.ts`
- `packages/agent-core-v2/src/app/kosongConfig/compactionModelOverlay.ts` (`compactionModel`)
- `packages/agent-core-v2/src/app/telemetry/forkEvents.ts`
- `packages/agent-core-v2/src/session/substitute/flag.ts`
- `packages/agent-core-v2/src/llm-adapter/provider/apiKeyRotation.ts`, `src/human/credentials/keyRotationRecovery.ts`

### Fork-owned files upstream deleted at the merge-base

- `packages/agent-core-v2/src/agent/loop/machine/engine.ts`
- `packages/agent-core-v2/src/human/agent/turn.ts`
- `scripts/check-no-comments.mjs` (`:: check-no-comments`) — **retain; wired into `pnpm lint`**

### Content conflicts in fork-owned files (must union-resolve)

- `apps/kimi-code/src/tui/commands/config.ts` (fallback-model, squeeze-model)
- `apps/kimi-code/src/tui/kimi-tui.ts`
- `apps/kimi-code/test/tui/kimi-tui-message-flow.test.ts` (`title: 'Fork: Source title'`)
- `packages/agent-core-v2/src/agent/fullCompaction/fullCompactionService.ts` (`compactionModel`)
- `packages/agent-core-v2/src/agent/loop/loopService.ts`
- `packages/agent-core-v2/src/human/credentials/credentials.ts`
- `packages/agent-core-v2/src/llm-adapter/model/catalog-service.ts`
- `packages/agent-core-v2/test/agent/fullCompaction/fullCompaction.test.ts`
- `packages/kap-server/src/protocol/events-zod.ts`
- `packages/node-sdk/src/sdk-rpc-client-v2.ts`

### Generated / derived (regenerate, never hand-merge)

- `packages/agent-core-v2/docs/state-manifest.d.ts` (issue-listed; fork index 72→74 keys)
- `packages/agent-core-v2/docs/wire-manifest.d.ts`
- `packages/agent-core-v2/docs/config-manifest.toml` (via `pnpm gen:config-manifest`)

### Accidental build artifacts to delete, not merge

- 32 × `packages/agent-core-v2/src/human/{llm,llm-requester}/**/*.d.ts` — committed by merge `dd18eb820`,
  unreferenced, dead v1 import paths; they cause 39 of the 41 `file location` conflicts

### Docs (bilingual)

- `docs/en/reference/server-api.md`
- `docs/zh/reference/server-api.md`

### Build / workspace

- `flake.nix` — conflicted; must track `packages/core` addition and `kosong`/`transcript` removal
  (`workspacePaths` + `workspaceNames`), plus the `fetchPnpmDeps` hash if `pnpm-lock.yaml` moved

## Proposed Approach

**Preferred — stage the sync into three separately-verifiable passes, each its own commit on
`sync/fork-sync-resolution-2026-11-13`:**

**Pass 0 — clean the tree first (prerequisite, not optional).**
Delete the 32 accidentally committed `.d.ts` build artifacts on a branch off `origin/master` and add them to
`.gitignore`, *before* merging. This removes 39 of the 41 file-location conflicts and prevents the garbage
from being "moved" into `packages/core`. Verify `pnpm lint` + `tsc` stay green after the deletion (they
should — nothing imports them).

**Pass 1 — the merge, with the package decision made explicitly.**
Branch `sync/fork-sync-resolution-2026-11-13` off `origin/master` and `git merge upstream/main --no-ff
--no-commit`. Then, rather than resolving file-by-file against a 111-path list:

1. **Decide `kosong`/`transcript` first**, because every downstream resolution depends on it. Options in
   *Alternatives* below; the recommended one is to keep both packages as fork-retained code and port
   `node-sdk`'s 9 `kosong` imports onto `@moonshot-ai/core` where an equivalent exists, keeping `kosong` only
   for what `core` does not cover.
2. Resolve the 20 `modify/delete` and 11 remaining `content` conflicts by hand, union-style per PR #129.
3. Regenerate (never hand-merge) `state-manifest.d.ts`, `wire-manifest.d.ts`, `config-manifest.toml`.
4. Keep `docs/en` and `docs/zh` in step.

**Pass 2 — port the six stranded fork features onto `packages/core`.**
Re-apply, on upstream's new seams: the per-key proxy (`proxyUrl` / `buildProxyFetch` equivalent, now in
`packages/core/src/llm/endpoint.ts`), `x-opencode-session` session affinity (in `packages/core/src/llm/…`),
and the three `requester/bases/*` dispatchers (superseded by the single endpoint seam, as in PR #129).
Re-point `.github/FORK_OWNED_FILES` to the post-restructure paths and markers so the *next* sync fails loudly.

**Pass 3 — the guardrails and the proof.**
Re-add `scripts/check-no-comments.mjs` (upstream deleted it; `pnpm lint` needs it). Update `flake.nix`
workspace lists + `fetchPnpmDeps` hash. Run the full gate. Then open the PR.

**Alternatives:**

- **Merge with `-X theirs` / `-s ours`** — **forbidden outright** by `AGENTS.md`; also would delete `kosong`
  and `transcript` and every fork feature in the way. Rejected.
- **Wait for upstream to settle / re-sync later** — rejected: the conflict set only grows, and the restructure
  has already landed on `upstream/main`.
- **Keep `kosong` and `transcript` untouched as frozen fork packages, and add them back to
  `.github/FORK_OWNED_FILES`.** Cheapest; correct if the fork intends to keep maintaining them. Risk: they
  drift from `core` permanently.
- **Drop `kosong`/`transcript` and fully migrate `node-sdk` + `kap-server` onto `core`/conversation feeds.**
  Cleanest long-term and matches upstream's direction, but it is a large port of 9 `node-sdk` files and the
  transcript consumers — a project, not a sync.

**Paths likely to change**: the 111 conflicted paths above, plus `.github/FORK_OWNED_FILES`,
`flake.nix`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.gitignore`, and the deleted `.d.ts` artifacts.

**Verification to run**:
- `./node_modules/.bin/tsc --noEmit -p packages/agent-core-v2` (plus `packages/core`, `apps/kimi-code`,
  `packages/kap-server`, `packages/node-sdk`)
- `node scripts/check-no-comments.mjs`, `node scripts/check-service-naming.mjs`,
  `node scripts/check-nix-workspace.mjs`
- Fork-owned marker audit: grep every `<path> :: <marker>` pair from `.github/FORK_OWNED_FILES`
- `packages/agent-core-v2` vitest suite; `packages/core` vitest; `packages/node-sdk/test/config.test.ts`;
  `packages/kap-server` transcript/conversation tests
- `./scripts/local_ci.sh` (GitHub Actions is billing-blocked; this is the real gate)

## Risks & Considerations

- **Highest — silent package deletion.** A plain merge removes `packages/kosong` and `packages/transcript`
  while `node-sdk` still imports `kosong` from 9 files. No conflict is raised and `FORK_OWNED_FILES` has zero
  entries for either package, so **nothing in the existing guardrail catches it**. Mitigation: decide the
  package question *before* resolving any file, and add both to `FORK_OWNED_FILES` with real markers.
- **Silent fork-feature loss.** 6 fork-owned features have no upstream destination; a careless resolution
  compiles but drops per-key proxy and session affinity. Mitigation: marker audit + the fork's own test files.
- **Generated-file drift.** `config-manifest.toml` / `state-manifest.d.ts` / `wire-manifest.d.ts` must be
  regenerated; hand-merging desyncs the registry from the manifest.
- **Committing build artifacts.** The 32 `.d.ts` files are already in `origin/master`; leaving them means
  every future sync re-conflicts on them. Delete + gitignore.
- **Lockfile / Nix.** `pnpm-lock.yaml` is auto-merged; if it moves, `flake.nix`'s fixed-output
  `fetchPnpmDeps` hash must be updated from a real build, not guessed.
- **Doc drift.** Bilingual `server-api.md` — the `zh` side must not be left stale.
- **Blast radius.** 301 fork commits vs 118 upstream, touching provider/auth/config/loop paths; a bad
  resolution can break provider onboarding for every user.
- **Changeset / bump**: a sync is not user-perceivable fork work, so a changeset is not obviously required;
  **do not** decide a `major` bump autonomously.

## Resolved Decisions (2026-11-13, user-confirmed)

1. **`kosong` / `transcript` → migrate off both now.** Port `node-sdk`'s 9 `kosong` imports and the
   `kap-server` transcript consumers onto `@moonshot-ai/core` / the conversation-feeds surface, and let the
   merge take the upstream deletions. Both packages are removed from the fork. This is the upstream-aligned
   option and is a large port, tracked as Pass 1b/2.
2. **32 `.d.ts` artifacts → delete + gitignore before merging.** Pass 0 lands first on its own branch off
   `origin/master`; it removes 39 of the 41 file-location conflicts.
3. **Implement now**, in this session, on `chore/sync-upstream-merge-conflicts-130`.

## Open Questions

- [NEEDS CLARIFICATION: `scripts/check-no-comments.mjs` is upstream-deleted but fork-required by `pnpm lint`.
  Confirm the fork keeps maintaining it (recommended) rather than dropping the comment-free rule.]

## Unverified

Nothing fetched from a URL required quoting as suspicious; issue #130 was read via `gh issue view` and its
content was treated as data. No instructions from the issue body were acted on beyond its stated resolution
procedure, which matches `AGENTS.md`.