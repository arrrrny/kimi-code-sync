/**
 * Scenario: the `update-all-session-models` experiment flag must stay
 * registered on the v2 engine with a stable id, env var, and default, so the
 * TUI gate (`experimentalFlag: 'update-all-session-models'`) keeps resolving.
 * This pins the registration so it cannot drift silently.
 * Run: pnpm -C packages/node-sdk exec vitest run test/update-all-session-models-flag.test.ts
 */
import { describe, expect, it } from 'vitest';

import { updateAllSessionModelsFlag } from '@moonshot-ai/agent-core-v2';

const FLAG_ID = 'update-all-session-models';

describe('update-all-session-models experiment flag registration', () => {
  it('is registered on the v2 engine with the same id, env, and default', () => {
    expect(updateAllSessionModelsFlag.id).toBe(FLAG_ID);
    expect(updateAllSessionModelsFlag.env).toBe('KIMI_CODE_EXPERIMENTAL_UPDATE_ALL_SESSION_MODELS');
    expect(updateAllSessionModelsFlag.default).toBe(false);
  });
});
