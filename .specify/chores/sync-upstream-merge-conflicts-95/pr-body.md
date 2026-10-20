## Requirement or Bug

Requirement: resolve the daily upstream sync's 2 merge conflicts by hand per the Fork Upstream Sync Policy and restore the sync to a clean state. Closes #95.

## Bug Reproduction Steps

N/A (chore PR).

## Root Cause

N/A (chore PR). Context: upstream `929403b6d` (#4013) reverted its workspace trust-boundary hardening (upstream #3964), deleting `packages/agent-core-v2/src/app/git/hardening.ts` and `packages/agent-core-v2/src/tool/realpath-access.ts` along with all call sites and tests. The fork had local refinements to both files (from the #94 sync's review fixes), producing two modify/delete conflicts that the sync workflow correctly refuses to auto-resolve.

## Code Changes

This PR is a merge of `master` (`aafdca9be`) into a branch off `upstream/main` (`be7d5f5f`, 4 commits: the trust-hardening revert, filesystem-watch back on by default, a CI release-workflow change, and a changelog sync). The only hand-made resolution:

- **Both conflicted files: take upstream's deletion.** The fork's modifications (`98e0b8dbc`) were refinements *of upstream's now-reverted feature* (core.worktree re-checks on cache hits, content-hash config stamping, worktree root from the resolved git path, realpath-failure leniency) — not fork-owned features. With the feature and every call site reverted, keeping the files would strand unused modules. Neither file carries a `FORK_OWNED_FILES` marker; no fork spec touches them. The rationale is recorded in the merge commit and `.specify/chores/sync-upstream-merge-conflicts-95/`.
- No fork-owned behavior changed: squeeze-model + secondary cascade, substitute-model, compaction-model display + new compaction handoff flag, `/refresh-catalog`, model favorites, key rotation with per-key proxy, fork-session — all untouched.

## Impact Scope

- Upstream changes absorbed: trust-hardening revert (files, call sites, and their tests removed), `[watch]` filesystem watching back on by default (fork's `[watch]`-adjacent config surface unaffected — marker-verified), CI release workflow, changelog.
- Verification on the merged tree: `tsc --noEmit -p packages/agent-core-v2` clean; **all 55** `.github/FORK_OWNED_FILES` survival markers resolve; fork-owned test suites pass 404/405 — the single red is the documented region-dependent signup-URL baseline failure (`tdd-profile`), byte-identical on both sides of the merge and therefore not merge-caused.
- After this merges, the next scheduled sync run is a no-op (issue #95's step 6).

## Checklist

- [x] I have read the [CONTRIBUTING](https://github.com/MoonshotAI/kimi-code/blob/main/CONTRIBUTING.md) document.
- [x] I have linked a related issue (external PRs: issue must have a maintainer's `/approve`). *(Closes #95)*
- [x] I have added tests that prove my feature works. *(N/A — merge chore; verification documented above and in the chore artifacts)*
- [x] Ran `gen-changesets` skill, or this PR needs no changeset. *(no changeset: internal integration, nothing user-perceivable — matches sync PRs #90/#94)*
- [x] Ran `gen-docs` skill, or this PR needs no doc update. *(upstream's own changelog/config docs ride the merge; nothing fork-authored to document)*
