/**
 * Scenario: `compaction.started` must surface the model the compaction will use.
 * The started indicator shows the intended model (resolved before the
 * `full_compaction.begin` record is logged), so the TUI can render
 * "Compacting context using <model>...". The dedicated `[compaction_model]` model
 * is carried when configured; otherwise the active conversation model is.
 * Run: pnpm -C packages/agent-core-v2 exec vitest run test/agent/fullCompaction/compactionStartedModel.test.ts
 */
import { describe, expect, it, vi } from 'vitest';

import { IAgentProfileService } from '#/index';
import { MASTER_ENV } from '#/app/flag/flagService';
import { COMPACTION_MODEL_ENV } from '#/app/kosongConfig/configSection';
import { testAgent } from '../../harness';

const PROVIDER = {
  type: 'kimi',
  apiKey: 'test-key',
  baseUrl: 'https://api.example/v1',
  model: 'kimi-code',
} as const;

const MODEL_CAPABILITIES = {
  image_in: true,
  video_in: true,
  audio_in: false,
  thinking: true,
  tool_use: true,
  max_context_tokens: 256_000,
} as const;

interface StartedModelArgs {
  readonly model?: string;
  readonly model_display?: string;
}

function findStartedModel(ctx: ReturnType<typeof testAgent>): StartedModelArgs {
  const event = ctx.newEvents().find(
    (e) => e.type === '[rpc]' && e.event === 'compaction.started',
  ) as { args: StartedModelArgs } | undefined;
  return event?.args ?? {};
}

describe('FullCompaction started model', () => {
  it('carries the current model alias when no dedicated compaction model is configured', async () => {
    const ctx = testAgent();
    ctx.configure({ provider: PROVIDER, modelCapabilities: MODEL_CAPABILITIES });
    const expectedAlias = ctx.get(IAgentProfileService).resolveModelContext().modelAlias;
    ctx.appendExchange(1, 'old user one', 'old assistant one', 20);
    const completed = ctx.once('compaction.completed');
    ctx.mockNextResponse({ type: 'text', text: 'Compacted summary.' });
    await ctx.rpc.beginCompaction({ instruction: undefined });
    await completed;

    const { model, model_display } = findStartedModel(ctx);
    expect(model).toBe(expectedAlias);
    expect(model_display).toBe(expectedAlias);
  });

  it('carries the dedicated compaction model when [compaction_model] is configured', async () => {
    vi.stubEnv(MASTER_ENV, '1');
    vi.stubEnv(COMPACTION_MODEL_ENV, 'kimi-compact');
    try {
      const ctx = testAgent();
      ctx.configure({ provider: PROVIDER, modelCapabilities: MODEL_CAPABILITIES });
      ctx.appendExchange(1, 'old user one', 'old assistant one', 20);
      const completed = ctx.once('compaction.completed');
      ctx.mockNextResponse({ type: 'text', text: 'Compacted summary.' });
      await ctx.rpc.beginCompaction({ instruction: undefined });
      await completed;

      const { model, model_display } = findStartedModel(ctx);
      expect(model).toBe('kimi-compact');
      expect(model_display).toBe('kimi-compact');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
