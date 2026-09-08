# Bug Assessment: YOLO/Auto rebrand broke the auto-approve-everything behavior

- **Slug**: yolo-auto-rebrand-behavior
- **Created**: 2026-09-03
- **Source**: pasted text
- **Verdict**: valid
- **Severity**: high

## Report (verbatim or summarized)

> there is a recent change from the upstream that rebranded YOLO to Ask When needed, and auto to something else, THIS MADE IT EXTREMELY annoying, previously it was only asking contextual questions on yolo, now it asks for every "dangerous" commands. find those commits, if they are targeted, revert commits, otherwise reimplement yolo and auto just as it was before

## Symptom

In YOLO mode (now displayed as "Ask When Needed"), every Bash command flagged as "dangerous" or "unanalyzable" by the parser triggers an approval prompt instead of being auto-approved. Previously, YOLO mode auto-approved all tool actions with no interruptions. The agent now asks the user to approve or deny these commands, breaking the expectation that YOLO means "approve everything."

## Reproduction

1. Start a session with `/yolo` or `/ask-when-needed` (permission mode = `'yolo'`).
2. Ask the agent to run a command that the parser flags as dangerous (e.g., `rm -rf /some/path`, `sudo reboot`, or any unanalyzable command with shell constructs).
3. Instead of auto-approving, the agent now presents an approval dialog asking whether to approve the dangerous command.

## Suspected Code Paths

- `packages/agent-core-v2/src/agent/permissionPolicy/policies/dangerous-command-ask.ts:120-151` — The `DangerousCommandAskPermissionPolicyService.evaluate()` method. When `mode === 'yolo'` (not `'auto'`), it returns `{ kind: 'ask' }` for dangerous/unanalyzable commands instead of returning `undefined` (which would let the subsequent `AutoModeApprovePermissionPolicyService` handle it).
- `packages/agent-core-v2/src/agent/permissionPolicy/permissionPolicyService.ts:35-39` — The `AgentPermissionPolicyService` constructor that inserts `DangerousCommandAskPermissionPolicyService` into the policy chain BEFORE the `AutoModeApprovePermissionPolicyService`.
- `packages/agent-core-v2/src/agent/permissionPolicy/policies/auto-mode-approve.ts:15` — The auto-approve policy only fires when `mode === 'auto'`; it does NOT cover `'yolo'`.
- `packages/agent-core-v2/src/agent/permissionRules/configSection.ts:119-123` — The `isDangerousCommandGuardEnabled()` config toggle (defaults to `true`).

## Root Cause Hypothesis

Two upstream commits from 2026-08-31 together cause the regression:

**Commit 1: `4b9888b73` — "feat(agent-core-v2): require approval for dangerous bash commands in all permission modes (#3290)"**
This is the core behavioral change. It introduced `DangerousCommandAskPermissionPolicyService` — a new policy inserted *before* the auto-approve policy in the chain. For YOLO mode (`mode === 'yolo'`), it returns `{ kind: 'ask' }`, which stops the chain and forces an approval prompt. Previously, no such policy existed, so YOLO mode would fall through to `AutoModeApprovePermissionPolicyService` (which only checked for `mode === 'auto'`, meaning YOLO was not covered — but since no earlier policy intercepted it, the tool ran). Now, the new policy intercepts YOLO mode and forces an approval request. The commit title says "all permission modes" but the implementation only intercepts YOLO (as ask) and Auto (as deny); manual mode is unaffected.

**Commit 2: `08a2fb003` — "feat(cli): rename permission modes to Always Ask, Ask When Needed, and Never Ask (#3403)"**
Pure UI rename: YOLO → "Ask When Needed", Auto → "Never Ask". Old slash command names (`/yolo`, `/auto`) kept as aliases. This is cosmetic and not the source of the behavioral change, though the new "Ask When Needed" name now more accurately reflects the actual (broken) behavior.

**Confidence**: high. The code is unambiguous — the `dangerous-command-ask` policy returns `{ kind: 'ask' }` for YOLO mode, which is a new behavior not present before commit `4b9888b73`.

## Proposed Remediation

**Preferred: Disable the dangerous-command guard by default in the fork's config.**

The guard already has a config toggle: `dangerousCommandGuard = false` under the `[permission]` section in `config.toml`, or `KIMI_CODE_DANGEROUS_COMMAND_GUARD=false` as an environment variable. This is the simplest fix — override the fork's default config to set this to `false`, so YOLO mode auto-approves everything as before.

**Files likely to change**:
- `packages/agent-core-v2/src/agent/permissionRules/configSection.ts` — Change the default from `true` to `false` (fork-owned override)
- OR `apps/kimi-code/src/cli/v2/run-v2-print.ts` — Pass the env var or config override at startup

**Alternatives**:

1. **Remove the `DangerousCommandAskPermissionPolicyService` from the policy chain entirely** — Edit `permissionPolicyService.ts` to remove the import and instantiation of `DangerousCommandAskPermissionPolicyService`. This is a fork-only change and needs to be re-applied after each upstream sync. Downside: loses the guard for `/never-ask` (auto) mode too, unless the guard is selectively disabled only for YOLO.

2. **Implement the existing `specs/830-fuck-permissions/spec.md`** — Add a new `'fuck'` permission mode that auto-approves everything (like the old YOLO). This is more work but is a clean, additive feature that doesn't conflict with upstream. However, it still requires the user to switch to `/fuck-permissions` instead of `/yolo`.

3. **Modify `DangerousCommandAskPermissionPolicyService.evaluate()` to return `undefined` for YOLO mode** — This would let the chain fall through to auto-approve for YOLO while keeping the guard for auto mode. This is the most surgical fix but requires re-applying after upstream syncs.

**Tests to add or update**:
- `packages/agent-core-v2/test/agent/permissionPolicy/dangerous-command-ask.test.ts` — Add test that verifies YOLO mode does NOT trigger dangerous-command-ask (returns `undefined`)
- `packages/agent-core-v2/test/agent/permissionPolicy/permissionPolicyService.test.ts` — Add test that verifies the policy chain outcome for YOLO mode with a dangerous command is `approve`

## Risks & Considerations

- **Upstream sync friction**: Any fork-owned change to `dangerous-command-ask.ts` or `permissionPolicyService.ts` will conflict with future upstream merges. The config-toggle approach is more resilient to syncs.
- **Security**: Disabling the dangerous command guard removes a safety net. The user explicitly wants this, but it means commands like `rm -rf`, `mkfs`, `sudo reboot` will auto-execute without confirmation in YOLO mode.
- **Existing spec**: `specs/830-fuck-permissions/` already defines a fork-owned `/fuck-permissions` mode for this exact scenario. Implementing that spec would be a cleaner long-term solution, but the user wants the YOLO mode itself to behave like before.
- **The rename (commit `08a2fb003`) is a separate concern**: Reverting the rename is cosmetic and optional. The user's complaint is about behavior, not labels.

## Open Questions

- Does the user want to keep the dangerous command guard for `/never-ask` (auto) mode, or disable it globally? The config toggle is global — it affects both YOLO and Auto.
- Should the fork keep the upstream display names ("Ask When Needed" / "Never Ask") or revert to the original ("YOLO" / "Auto")? This is cosmetic and can be decided separately.
