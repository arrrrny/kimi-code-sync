# Bug Fix PR: propagate model and fallback settings to swarm subagents on resume

- **Slug**: swarm-model-change-propagation
- **Opened**: 2026-09-11
- **PR**: 74
- **URL**: https://github.com/arrrrny/kimi-code-sync/pull/74
- **Branch**: fix/swarm-model-change-propagation
- **Issue**: 14

Fixes #14: a resumed swarm subagent that inherited its model now adopts the caller's current model, and every spawned subagent inherits the caller's fallback / fallbackSecondary / substitute model overrides so it follows the same fallback mechanism as its parent. Includes 4 new tests (61/61 focused pass) and a patch changeset; full-suite A/B shows no new failures and repairs 8 pre-existing `spawn.test.ts` failures.
