import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor, emit, setup } from '#human/xstate2';

import type {
  AgentLLMRequestPartHandler,
  AgentLLMRequestTask,
  IAgentLLMRequesterService,
} from '#/agent/llmRequester/llmRequester';
import {
  machineEngineAttachBundle,
  type CreateMachineEngineOptions,
} from '#/agent/loop/machine/engine';
import type { IAgentToolExecutorService } from '#/agent/toolExecutor/toolExecutor';
import { APIProviderRateLimitError } from '#/llm-adapter/contract/errors';
import type { LLMRequestTrace } from '#/llm-adapter/contract/request-trace';
import { UNKNOWN_CAPABILITY } from '#human/llm/capability';
import { memoryJournal } from '#human/eventStore/journal';
import type { LlmModel } from '#human/llm/model';
import type { LlmCredentialProvider, LlmKeyRotationController } from '#human/llm/requester/requester';
import type { LlmRecovery } from '#human/llm/requester/recovery';
import type { TurnEvent, TurnInput, TurnLlmEvent } from '#human/agent/turn';

const model: LlmModel = { provider: 'test', model: 'test-model', capability: UNKNOWN_CAPABILITY };

type FailureStep = 'rate_limit' | 'ok';

type RecoveringEvent = Extract<TurnLlmEvent, { type: 'llm.recovering' }>;

function createRequesterService(steps: readonly FailureStep[]): IAgentLLMRequesterService {
  let index = 0;
  return {
    start: (_overrides: unknown, onPart: AgentLLMRequestPartHandler): AgentLLMRequestTask => {
      const step = steps[Math.min(index, steps.length - 1)];
      index += 1;
      if (step === 'rate_limit') {
        return {
          trace: {} as LLMRequestTrace,
          result: Promise.reject(new APIProviderRateLimitError('rate limited')),
        } as unknown as AgentLLMRequestTask;
      }
      void onPart({ type: 'text', text: 'done' });
      return {
        trace: {} as LLMRequestTrace,
        result: Promise.resolve({
          usage: { inputOther: 1, output: 1, inputCacheRead: 0, inputCacheCreation: 0 },
          providerFinishReason: 'completed',
          rawFinishReason: 'stop',
        }),
      } as unknown as AgentLLMRequestTask;
    },
  } as unknown as IAgentLLMRequesterService;
}

function createToolExecutor(): IAgentToolExecutorService {
  return {
    execute: async function* () {},
  } as unknown as IAgentToolExecutorService;
}

function keyedProvider(args: {
  readonly keyCount: number;
  readonly onRotate: (keyId: string | undefined) => void;
  readonly failRotate?: boolean;
}): LlmCredentialProvider {
  const controller: LlmKeyRotationController = {
    providerName: 'kilo',
    keyCount: args.keyCount,
    plan: () => ({ keyId: 'key2', name: 'personal' }),
    rotate: (keyId) => {
      args.onRotate(keyId);
      if (args.failRotate === true) {
        return Promise.reject(new Error('config.toml is read-only'));
      }
      return Promise.resolve({ outcome: 'rotated', keyId: 'key2', name: 'personal' });
    },
  };
  return {
    resolve: () => ({ apiKey: 'sk-first' }),
    rotation: () => controller,
  };
}

function fallbackChain(applied: string[]): LlmRecovery {
  let proposed = false;
  return {
    propose: (ctx) => {
      if (proposed || ctx.attempt < ctx.maxAttempts) return undefined;
      proposed = true;
      return {
        strategy: 'substitute_model',
        action: 'substitute',
        beforeNextAttempt: () => {
          applied.push('fallback');
          return Promise.resolve();
        },
      };
    },
  };
}

function startEngineTurnActor(options: CreateMachineEngineOptions, turnInput: Partial<TurnInput>) {
  const bundle = machineEngineAttachBundle(options);
  const harness = setup({
    types: {
      input: {} as TurnInput,
      context: {} as { turnInput: TurnInput },
      events: {} as TurnEvent,
      emitted: {} as TurnLlmEvent,
    },
    actors: { turn: bundle.turnLogic },
  }).createMachine({
    id: 'engine-recovery-harness',
    initial: 'running',
    context: ({ input }) => ({ turnInput: input }),
    states: {
      running: {
        invoke: {
          src: 'turn',
          input: ({ context }) => context.turnInput,
          onDone: { target: 'completed' },
        },
        on: {
          '*': { actions: emit(({ event }) => event as TurnLlmEvent) },
        },
      },
      completed: { type: 'final' },
    },
  });
  const recovering: RecoveringEvent[] = [];
  const actor = createActor(harness, {
    input: { request: bundle.request, history: [], ...turnInput },
  });
  actor.on('llm.recovering', (event) => recovering.push(event));
  actor.start();
  return { actor, recovering };
}

async function advanceTurn(actor: { getSnapshot(): unknown }): Promise<void> {
  for (let index = 0; index < 200; index += 1) {
    if ((actor.getSnapshot() as { value?: unknown }).value === 'completed') return;
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(0);
  }
}

describe('machine engine api key rotation precedence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('takes the rotation proposal for an exhausted key even when the fallback chain proposes too', async () => {
    const applied: string[] = [];
    const { actor, recovering } = startEngineTurnActor(
      {
        model,
        llmRequester: createRequesterService(['rate_limit', 'rate_limit', 'rate_limit', 'ok']),
        toolExecutor: createToolExecutor(),
        toolInfos: () => [],
        maxAttemptsPerStep: 3,
        recovery: fallbackChain(applied),
        journal: memoryJournal(),
      },
      {
        request: {
          model,
          credentialProvider: keyedProvider({
            keyCount: 3,
            onRotate: (keyId) => applied.push(`rotate:${keyId}`),
          }),
        },
      },
    );

    await advanceTurn(actor);

    expect(applied).toEqual(['rotate:key2']);
    expect(recovering.map((event) => event.strategy)).toEqual(['api_key_rotation']);
    expect(recovering[0]?.action).toBe('key2');
  });

  it('hands control to the caller fallback chain once every key of the step has been tried', async () => {
    const applied: string[] = [];
    const { actor, recovering } = startEngineTurnActor(
      {
        model,
        llmRequester: createRequesterService([
          'rate_limit',
          'rate_limit',
          'rate_limit',
          'rate_limit',
          'rate_limit',
          'rate_limit',
          'ok',
        ]),
        toolExecutor: createToolExecutor(),
        toolInfos: () => [],
        maxAttemptsPerStep: 3,
        recovery: fallbackChain(applied),
        journal: memoryJournal(),
      },
      {
        request: {
          model,
          credentialProvider: keyedProvider({
            keyCount: 2,
            onRotate: (keyId) => applied.push(`rotate:${keyId}`),
          }),
        },
      },
    );

    await advanceTurn(actor);

    expect(applied).toEqual(['rotate:key2', 'fallback']);
    expect(recovering.map((event) => event.strategy)).toEqual([
      'api_key_rotation',
      'substitute_model',
    ]);
  });

  it('announces a rotation that failed to persist and never proposes it again for the step', async () => {
    const applied: string[] = [];
    const { actor, recovering } = startEngineTurnActor(
      {
        model,
        llmRequester: createRequesterService([
          'rate_limit',
          'rate_limit',
          'rate_limit',
          'rate_limit',
          'rate_limit',
          'rate_limit',
          'ok',
        ]),
        toolExecutor: createToolExecutor(),
        toolInfos: () => [],
        maxAttemptsPerStep: 3,
        recovery: fallbackChain(applied),
        journal: memoryJournal(),
      },
      {
        request: {
          model,
          credentialProvider: keyedProvider({
            keyCount: 2,
            failRotate: true,
            onRotate: (keyId) => applied.push(`rotate:${keyId}`),
          }),
        },
      },
    );

    await advanceTurn(actor);

    expect(applied).toEqual(['rotate:key2', 'fallback']);
    expect(recovering.map((event) => event.strategy)).toEqual([
      'api_key_rotation',
      'substitute_model',
    ]);
    expect(recovering[0]?.detail).toContain('could not be applied: config.toml is read-only');
  });
});
