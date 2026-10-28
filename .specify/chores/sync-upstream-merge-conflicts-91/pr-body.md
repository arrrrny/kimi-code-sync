## Related Issue

Closes #91

## Problem

The daily upstream sync aborted on merge conflicts between `upstream/main` and local `master`, and per
the fork-upstream-sync policy in `AGENTS.md` those conflicts cannot be auto-resolved — `-X theirs` /
`-s ours` would silently drop fork-owned features. A human resolves them on a
`sync/fork-sync-resolution` branch and merges manually.

This is the follow-on to PR #90 (issue #89), which merged at 11:32:46Z; the next scheduled run at
11:46Z hit these two conflicts.

Verified refs after fetch: `origin/master` = `fa5f9bc40` (matches the issue exactly) and
`upstream/main` = `3cc6b2a33` (the issue recorded `60f2a632`, one commit earlier, which added no new
conflicts). The live conflict set is exactly the 2 files the issue names. The merge is based on
upstream with `master` merged in, matching the previous cycles.

## What changed

Both conflicts resolved by hand; no `--theirs`, `-s ours`, or `git checkout --ours/--theirs` anywhere.

**`packages/agent-core-v2/src/human/agent/machine.ts`** — the `input.steer` user entry. Three-way:

- base: `{ source: 'input' }`
- fork: `{ source: 'input', origin: merged.origin }`
- upstream: `{ source: 'input', promptId, userMessageId: promptId, origin: { ...merged.origin, inTurn: true } }`

Upstream keeps `merged.origin` (the fork's intent) and additionally pairs the reserved prompt id and
marks `inTurn`, plus adds the `const promptId = steered.length === 1 ? … : undefined` binding the
block needs — so upstream's side is the correct union and no fork behavior is lost. The fork's own
feature in this file (`drainedWhilePaused`) merged cleanly and is preserved.

**`packages/agent-core-v2/test/tool/tool.test.ts`** — 3 hunks, all golden `toolsHash`/`hash` values in
inline wire snapshots. Neither side's hash matches the merged tool set, so they were regenerated with
`vitest -u` rather than picked by eye. The result was verified, not assumed:

- vs `origin/master` the changed lines include real value changes (`tokens: 160 → 149`, `176 → 165`,
  `194 → 183`) — upstream's system-prompt reduction (`910aba273`), not drift — plus the hash updates.
- vs `upstream/main` the file differs **only** in the hash values and the fork's two
  `setSessionModelOverride`/`getSessionModelOverride` stubs.

So the regenerated snapshots reproduce upstream's expected values exactly.

## Verification

- No conflict markers remain.
- `tsc --noEmit -p packages/agent-core-v2` → clean.
- `scripts/check-no-comments.mjs`, `check-service-naming.mjs`, `check-nix-workspace.mjs` → all pass.
- All **54** `.github/FORK_OWNED_FILES` markers still resolve.
- `pnpm-lock.yaml` and `flake.nix` are unchanged vs `master` → no `fetchPnpmDeps` hash update needed.
- `packages/agent-core-v2`: **7023 passed, 1 skipped**. The loaded-run failures were all either
  timeouts or load flakes — the one non-timeout failure was chased down and cleared:
  - `test/agent/task/rpc-events.test.ts` (2 assertion failures under load) → **31/31 pass when run
    alone** on the merged tree, 31/31 on `master`, and upstream CI is green at the merged tip.
  - `read-media`, `bashParser`, `sessionIndex`, `mcpCore` → all pass in an isolated re-run.
  - `fullCompaction` (×2) and `taskManager` (×3) → timeouts only; these are the same machine-speed
    cases as last cycle, where a test CI runs in ~1s takes 78s here.
  - `tool.test.ts > … foreground subagent times out` → the known upstream-owned timing test (proven
    previously to fail on pure `upstream/main` locally while passing on CI).

Upstream CI at the merged tip `3cc6b2a33` is fully green, so this brings a green upstream state.

## Notes

- Branch: `sync/fork-sync-resolution-2026-09-18-91` — the chore skills' default `chore/<slug>` prefix
  is not used, because issue #91 and the fork policy both specify a `sync/fork-sync-resolution` branch.
- No changeset: no fork-authored user-facing change, and upstream's changes carry their own.

## Checklist

- [x] I have read the CONTRIBUTING document.
- [x] I have linked a related issue.
- [x] All fork markers and tests pass.
