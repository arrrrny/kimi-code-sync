# Chore Implementation: sync upstream — resolve fork/upstream merge conflicts (#91)

- **Slug**: sync-upstream-merge-conflicts-91
- **Implemented**: 2026-09-18
- **Assessment**: ./assessment.md
- **Status**: applied
- **Branch**: `sync/fork-sync-resolution-2026-09-18-91`
- **Merge commit**: `ac35b463b` (parents: `3cc6b2a33` upstream/main, `fa5f9bc40` origin/master)

## Summary

Performed the fork's manual upstream sync for issue #91: branched from `upstream/main`, merged
`origin/master` in, and resolved both conflicts by hand. This is the immediate follow-on to PR #90
(issue #89), which merged at 11:32:46Z; the next scheduled run at 11:46Z hit these conflicts.

The live conflict set matched the issue exactly (2 files) — unlike the previous cycle, where the
issue's snapshot was stale (8 files listed, 18 live). Upstream had advanced only 1 commit past the
issue's recorded ref and that commit added no conflicts.

No `--theirs` / `-s ours` / `git checkout --ours|--theirs` was used, per the Fork Upstream Sync Policy.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `packages/agent-core-v2/src/human/agent/machine.ts` | modified | `input.steer` user entry: took upstream's block, which is a strict superset of the fork's change (see below) |
| `packages/agent-core-v2/test/tool/tool.test.ts` | modified | 3 golden `toolsHash`/`hash` values regenerated with `vitest -u` |

Added: `.specify/chores/sync-upstream-merge-conflicts-91/{issue,assessment,implement,pr-body,pr}.md`.

## Diff Highlights

`machine.ts` — the `input.steer` enqueue, three-way:

- base: `{ source: 'input' }`
- fork: `{ source: 'input', origin: merged.origin }`
- upstream: `{ source: 'input', promptId, userMessageId: promptId, origin: { ...merged.origin, inTurn: true } }`

Upstream keeps `merged.origin` (the fork's intent) and additionally pairs the reserved prompt id and
marks `inTurn`, and adds the `const promptId = steered.length === 1 ? … : undefined` binding the
block needs. Upstream's side is therefore the correct union — nothing fork-owned is dropped. The
fork's own feature in this file (`drainedWhilePaused`, 5 hunks) merged cleanly and is preserved;
`git diff upstream/main` for the file shows exactly those fork lines and nothing else.

## Verification

- No conflict markers remain anywhere in the tracked tree.
- `tsc --noEmit -p packages/agent-core-v2` → **clean** (also proves the `promptId` reference is in
  scope after the resolution).
- `scripts/check-no-comments.mjs`, `check-service-naming.mjs`, `check-nix-workspace.mjs` → all pass.
- **Fork-owned marker audit**: all **54** `<path> :: <marker>` entries resolve → 0 failures.
- `pnpm-lock.yaml` and `flake.nix` are **unchanged vs `origin/master`** (`git diff origin/master` empty)
  → no `fetchPnpmDeps` hash update needed.
- **Snapshot regeneration verified, not assumed**: after `vitest -u`, the changed lines in
  `tool.test.ts` were inspected. Relative to `origin/master` they include real value changes
  (`tokens: 160 → 149`, `176 → 165`, `194 → 183` — upstream's system-prompt reduction from commit
  `910aba273`, not drift) plus the hash updates. Relative to `upstream/main` the file differs only in
  the hash values and the fork's two `setSessionModelOverride`/`getSessionModelOverride` stubs. So the
  regenerated snapshots reproduce upstream's expected values exactly, and no fork behavior was masked.
- `packages/agent-core-v2` full suite: **7023 passed, 1 skipped, 10 failed**; a 7-file isolated
  re-run and a single-file re-run resolved every non-timeout failure:
  - `test/agent/task/rpc-events.test.ts` (2 assertion failures in the loaded run) → **31/31 pass when
    run alone** on the merged tree, and 31/31 on `origin/master`, and upstream's CI is green at the
    merged tip → load-induced flakes, not a regression. This was the one non-timeout failure and it
    was explicitly chased down.
  - `test/agent/media/tools/read-media.test.ts`, `test/app/bashParser/…`, `test/app/sessionIndex/…`,
    `test/mcpCore/connection-manager.test.ts` → all pass in the isolated run (loaded-run flakes).
  - `test/agent/fullCompaction/fullCompaction.test.ts` (×2) and `test/agent/task/taskManager.test.ts`
    (×3) → timeouts only. These are the same machine-speed failures seen in the previous cycle, where
    `taskManager` passes with a raised timeout but takes 78s/77s/39s for tests CI runs in ~1s.
  - `test/tool/tool.test.ts > … foreground subagent times out` → the known upstream-owned timing test
    (previously proven to fail on pure `upstream/main` locally and to pass on CI).
- Upstream CI at the merged tip `3cc6b2a33` is **fully green**, so the sync brings a green upstream
  state; any red on this PR's CI would be fork-side or a flake.

Toolchain note: all commands were run with `/usr/local/bin/node` (v26.5.1). This checkout's default
`node` is v22.22.3, below the repo's `engines: >=24.15.0`, which breaks `#/…` subpath imports.

## Deviations from Assessment

1. **Branch name.** The chore skills default to `<branch_prefix>/<slug>`; the assessment (following
   issue #91 and the fork policy) specifies a `sync/fork-sync-resolution` branch, so
   `sync/fork-sync-resolution-2026-09-18-91` was used. The `-91` suffix keeps it distinct from the
   merged branch for the previous cycle.
2. **No subagents.** With only 2 conflicts this was resolved directly rather than by delegation.
3. **No changeset**, consistent with the previous cycle: no fork-authored user-facing change, and
   upstream's changes carry their own changesets.

## Follow-ups

- Open the PR into `master` titled `chore: sync upstream 2026-09-18`, linking `Closes #91`.
- After it merges, the next scheduled sync becomes a no-op.
- Toolchain hygiene: set the shell's default `node` to 24.x for local runs and CI parity.
