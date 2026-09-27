# Chore Assessment: sync upstream — resolve fork/upstream merge conflicts (#91)

- **Slug**: sync-upstream-merge-conflicts-91
- **Created**: 2026-09-18
- **Source**: https://github.com/arrrrny/kimi-code-sync/issues/91 (loaded via `speckit.chore.fetch`)
- **Verdict**: in scope
- **Size**: small

## Report (verbatim or summarized)

Issue #91 (labels: `sync`, author: `github-actions`, opened 2026-09-18T11:46:12Z) reports that the daily
upstream sync aborted on merge conflicts. Auto-resolving in favor of upstream is forbidden by the Fork
Upstream Sync Policy in `AGENTS.md`; a human resolves on a `sync/fork-sync-resolution` branch.

This is the immediate follow-on to the previous sync: PR #90 (resolving issue #89) merged into
`master` at 11:32:46Z, and the next scheduled run at 11:46Z hit fresh conflicts.

**Verified refs (re-measured after `git fetch`):**

- `origin/master` = `fa5f9bc40` — **matches the issue exactly**
- `upstream/main` = `3cc6b2a33` — the issue recorded `60f2a632`, which is an ancestor; upstream
  advanced **1** commit past the snapshot and that commit added no new conflicts
- `origin/master` is **7 commits behind** `upstream/main`

Unlike the previous cycle (where the issue listed 8 files and 18 were live), the **live conflict set
is exactly the 2 files the issue names**:

- `packages/agent-core-v2/src/human/agent/machine.ts`
- `packages/agent-core-v2/test/tool/tool.test.ts`

Upstream commits being merged:

```
3cc6b2a33 feat(kimi-code): carry turn trace id and copilot stats in rating surveys (#3907)
60f2a6327 fix(agent-core-v2): reuse the queued prompt id for a single steer (#3906)
b0d0a80c3 feat: add usage telemetry for swarm, tower, external hooks, and remote control (#3897)
73ebe9ab2 fix(transcript): attach promptIds to cold-folded steer frames (#3896)
5acc863ae feat(agent-core-v2): make select_tools failures actionable (#3885)
910aba273 fix(agent-core-v2): drop literal decision clauses from system prompt and auto reminder (#3894)
53e5e3fca fix(agent-core-v2): pair steered follow-ups by reserved message id (#3891)
```

## Summary

Perform the fork's manual upstream sync for the 2 conflicting files and open a PR into `master` that
closes #91. A chore (recurring maintenance integration), not a bug or a feature.

## Constitution Check

`.specify/memory/constitution.md` is still the unratified placeholder template, so the binding
constraints are `AGENTS.md`:

- **Fork Upstream Sync Policy**: never auto-resolve in favor of upstream; no blind `-X theirs` /
  `-s ours`; resolve by hand.
- **`.github/FORK_OWNED_FILES`**: all 54 survival markers must still resolve after the merge; append an
  entry if a fork-owned file is added or changed.
- **Comment-free zones** (`scripts/check-no-comments.mjs`): `agent-core-v2` carries no comments.

## Affected Paths

- `packages/agent-core-v2/src/human/agent/machine.ts` — the `input.steer` enqueue builds a user entry
  from the merged steer messages. Both sides changed the same lines (see Approach).
- `packages/agent-core-v2/test/tool/tool.test.ts` — 3 hunks, all golden `toolsHash` / `hash` values
  inside inline wire snapshots.

## Proposed Approach

**Preferred:**

1. Branch off `upstream/main` and merge `origin/master` in (the shape the issue prescribes and prior
   cycles used): `sync/fork-sync-resolution-2026-09-18-91`.
2. `machine.ts` — **take upstream's side**, after confirming it is a superset:
   - base: `{ source: 'input' }`
   - fork: `{ source: 'input', origin: merged.origin }`
   - upstream: `{ source: 'input', promptId, userMessageId: promptId, origin: { ...merged.origin, inTurn: true } }`

   Upstream preserves `merged.origin` (the fork's intent) and additionally pairs the reserved prompt
   id and marks `inTurn`. Nothing fork-owned is dropped, so upstream's version is the correct union.
   Upstream also adds the `const promptId = steered.length === 1 ? … : undefined` binding that the
   block depends on.
3. `tool.test.ts` — the hash values cannot be decided by reading, because the merged tool set is
   neither side's. Keep one side, then regenerate the inline snapshots with `vitest -u`, and verify
   the resulting diff changes **only** the hash values.
4. Verify: `tsc --noEmit -p packages/agent-core-v2`, the three guardrail scripts, the 54-marker
   fork-owned audit, and the `tool.test.ts` + `machine.ts`-adjacent suites.
5. Open the PR into `master` titled `chore: sync upstream 2026-09-18`, body linking `Closes #91`.

**Paths likely to change**: the 2 conflicted files (plus nothing else expected — no manifests or
lockfiles are involved this time).

**Verification to run**: as in step 4, plus a `git diff` review of the regenerated snapshot to
confirm hash-only changes.

## Risks & Considerations

- **Small blast radius.** Only 2 files conflict and neither is in `FORK_OWNED_FILES`; the risk is
  concentrated in `machine.ts`, which is on the steer/queue path for user prompts.
- **`machine.ts` is behavioral.** Taking upstream's side changes the enqueued user entry (adds
  `promptId`/`userMessageId`/`inTurn`). Verified as a superset of the fork's `origin` change, but it
  is the one place a fork behavior could hide; the marker audit and the agent-core-v2 suite cover it.
- **Golden-hash snapshots.** Regenerating with `-u` can mask a real behavioral change if the diff is
  not reviewed — the diff must be hash-only.

## Open Questions

- None blocking. Completion criterion is the issue's own: a merged PR into `master` closing #91, after
  which the next scheduled sync is a no-op.
- `.specify/extensions/chore/chore-config.yml` sets `auto_create_issue: true`, but issue #91 already
  exists and was loaded via `speckit.chore.fetch`, so the report phase is intentionally skipped (a new
  issue would duplicate it).
