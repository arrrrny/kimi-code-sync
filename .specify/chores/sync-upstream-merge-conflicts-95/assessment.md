# Chore Assessment: sync upstream — resolve fork/upstream merge conflicts (#95)

- **Slug**: sync-upstream-merge-conflicts-95
- **Created**: 2026-09-26
- **Source**: https://github.com/arrrrny/kimi-code-sync/issues/95
- **Verdict**: in scope
- **Size**: small

## Report

Issue #95 (labels: `sync`, author: `github-actions`) reports that the daily upstream sync
aborted on **2** merge conflicts and, per the Fork Upstream Sync Policy, opened this issue
for a human resolution on a `sync/fork-sync-resolution` branch.

**Verified refs (re-measured after `git fetch upstream main`; the `upstream` remote was not
configured locally and was added for this chore):**

- `origin/master` = `aafdca9be` — **matches the issue exactly**
- `upstream/main` = `be7d5f5f` — **matches the issue exactly** (no drift this cycle)
- `origin/master` is **4 commits behind** `upstream/main`
- The live conflict set is **exactly the 2 files the issue names**, both modify/delete:
  - `packages/agent-core-v2/src/app/git/hardening.ts` — deleted in HEAD (upstream), modified
    in master (fork); master's version left in tree by git
  - `packages/agent-core-v2/src/tool/realpath-access.ts` — same shape

Upstream commits being merged:

```
be7d5f5fe docs(changelog): sync 2.1.1 from apps/kimi-code/CHANGELOG.md (#4018)
f67e6398f ci: release packages (#4016)
c7dd84124 feat: turn filesystem watch back on by default (#4015)
929403b6d revert: roll back workspace trust-boundary hardening (#4013)
```

## Key finding: the conflicts are one upstream revert, not two features

`929403b6d` is upstream's own **revert** of its workspace trust-boundary hardening
(upstream #4013 rolling back upstream #3964): background git invocations no longer override
repo-local git config, agent file tools no longer re-resolve paths through symlinks, and
the `local.toml` trust gating is gone. The revert deleted `hardening.ts`,
`realpath-access.ts`, their tests, and every call site.

Both files are **not fork-owned features**: they entered the fork through upstream #3964,
and the fork's only modifications (`98e0b8dbc`, the #94 sync's review fixes) are
hardening-quality refinements *of upstream's feature* — core.worktree re-checks on cache
hits, content-hash config stamping, worktree root derived from the resolved git path,
realpath-failure leniency in the escape checks. Neither file carries a
`.github/FORK_OWNED_FILES` marker; no fork spec (squeeze-model, fallback-model,
fuck-permissions, model-favorites, fork-session, key rotation, compaction handoff) touches
them.

With upstream reverting the feature and every call site, the fork's refinements have no
host left: keeping the files would strand unused modules while upstream's auto-merged
revert removes their importers.

## Summary

Accept upstream's deletion of both files as the documented consequence of upstream's own
revert; preserve everything fork-owned (verified by the full marker sweep); open a PR into
`master` closing #95. This is not an auto-resolution in favor of upstream — it is a reasoned
resolution recorded here and in the merge commit.

## Constitution Check

Binding constraints come from `AGENTS.md` (`.specify/memory/constitution.md` remains the
unratified placeholder):

- **Fork Upstream Sync Policy**: no blind `-X theirs` / `-s ours`; the deletions are taken
  per-file with rationale, not by strategy flags.
- **`.github/FORK_OWNED_FILES`**: all **55** markers verified on the merged tree (see
  implement.md for the command).
- **Comment-free zones**: merge touches no new hand-written code; `tsc` clean.

## Verification Results

- `./node_modules/.bin/tsc --noEmit -p packages/agent-core-v2` — **clean** (the issue's
  prescribed gate)
- Fork-owned marker sweep — **55/55 resolve**
- Fork-owned test suites (the 9 test files in the guard list) — **404/405 passed**; the one
  red (`kimi-tui-message-flow.test.ts` "prints the sign-up page…") is the documented
  region-dependent baseline failure in `.specify/memory/tdd-profile.md`: the renderer emits
  `https://www.kimi.ai/code` from the developer's login region while the test hardcodes
  `https://www.kimi.com/code`. Proven not merge-caused: the merged tree's copy of the test
  is byte-identical to master (`git diff master -- <file>` is empty) and none of the 4
  upstream commits touches the test or the signup-URL logic.
