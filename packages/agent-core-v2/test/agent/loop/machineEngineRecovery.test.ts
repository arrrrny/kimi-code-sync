import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor, emit, setup } from '#human/xstate2';

import type {
  AgentLLMRequestOverrides,
  AgentLLMRequestPartHandler,
  AgentLLMRequestTask,
  LoopRequester,
} from '#/agent/loop/requesterContract';
import {
  machineEngineAttachBundle,
  type CreateMachineEngineOptions,
  type MachineEngineEvent,
} from '#/agent/loop/machine/engine';
import type { IAgentToolExecutorService } from '#/agent/toolExecutor/toolExecutor';
import { APIProviderRateLimitError, APIStatusError } from '#/llm-adapter/contract/errors';
import type { LLMRequestTrace } from '#/llm-adapter/contract/request-trace';
import { UNKNOWN_CAPABILITY } from '#human/llm-requester/capability';
import { memoryJournal } from '#human/eventStore/journal';
import type { LlmModel } from '#human/llm-requester/model';
import type { LlmCredentialProvider } from '#human/llm-requester/requester';
import type { LlmKeyRotationController, LlmKeyRotationOutcome } from '#human/llm/request';
import type { LlmRecovery } from '#human/llm-requester/recovery';
import type { TurnEvent, TurnInput, TurnLlmEvent } from '#human/agent/turn';

const model: LlmModel = { provider: 'test', model: 'test-model', capability: UNKNOWN_CAPABILITY };

type FailureStep = 'rate_limit' | 'unauthorized' | 'forbidden' | 'ok';

type RecoveringEvent = Extract<TurnLlmEvent, { type: 'llm.recovering' }>;

function createRequesterService(steps: readonly FailureStep[]): LoopRequester {
  let index = 0;
  return {
    start: (_overrides: unknown, onPart?: AgentLLMRequestPartHandler): AgentLLMRequestTask => {
      const step = steps[Math.min(index, steps.length - 1)];
      index += 1;
      if (step === 'rate_limit') {
        return {
          trace: {} as LLMRequestTrace,
          result: Promise.reject(new APIProviderRateLimitError('rate limited')),
        } as unknown as AgentLLMRequestTask;
      }
      if (step === 'unauthorized') {
        return {
          trace: {} as LLMRequestTrace,
          result: Promise.reject(
            new APIStatusError(401, 'Your authentication token is invalid. Please sign in again.'),
          ),
        } as unknown as AgentLLMRequestTask;
      }
      if (step === 'forbidden') {
        return {
          trace: {} as LLMRequestTrace,
          result: Promise.reject(new APIStatusError(403, 'forbidden')),
        } as unknown as AgentLLMRequestTask;
      }
      void onPart?.({ type: 'text', text: 'done' });
      return {
        trace: {} as LLMRequestTrace,
        result: Promise.resolve({
          usage: { inputOther: 1, output: 1, inputCacheRead: 0, inputCacheCreation: 0 },
          providerFinishReason: 'completed',
          rawFinishReason: 'stop',
        }),
      } as unknown as AgentLLMRequestTask;
    },
  } as unknown as LoopRequester;
}

function createCountingRequester(
  steps: readonly FailureStep[],
  requests: string[],
): LoopRequester {
  const inner = createRequesterService(steps);
  return {
    start: (
      overrides?: AgentLLMRequestOverrides,
      onPart?: AgentLLMRequestPartHandler,
    ): AgentLLMRequestTask => {
      requests.push(`request:${String(requests.length + 1)}`);
      return inner.start(overrides, onPart);
    },
  } as unknown as LoopRequester;
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
    rotate: (keyId: string | undefined): Promise<LlmKeyRotationOutcome> => {
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
  const events: MachineEngineEvent[] = [];
  const bundle = machineEngineAttachBundle({
    ...options,
    onEvent: (event) => {
      events.push(event);
      options.onEvent?.(event);
    },
  });
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
  return { actor, recovering, events };
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

  it('stops rotating and fails once every key of the step was rejected', async () => {
    const applied: string[] = [];
    const requests: string[] = [];
    const { actor, recovering } = startEngineTurnActor(
      {
        model,
        llmRequester: createCountingRequester(['unauthorized'], requests),
        toolExecutor: createToolExecutor(),
        toolInfos: () => [],
        maxAttemptsPerStep: 10,
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

    expect(applied).toEqual(['rotate:key2']);
    expect(requests).toHaveLength(2);
    expect(recovering.map((event) => event.strategy)).toEqual(['api_key_rotation']);
  });

  it('announces a rotation that failed to apply without reporting the cycle as exhausted', async () => {
    const applied: string[] = [];
    const { actor, recovering, events } = startEngineTurnActor(
      {
        model,
        llmRequester: createRequesterService(['unauthorized']),
        toolExecutor: createToolExecutor(),
        toolInfos: () => [],
        maxAttemptsPerStep: 10,
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

    expect(recovering.map((event) => event.action)).toEqual(['key2']);
    expect(recovering[0]?.detail).toContain('could not be applied: config.toml is read-only');
    expect(events.filter((event) => event.type === 'recovering' && event.action === 'exhausted')).toEqual([]);
  });

  it('rotates to the next key when the provider reports the token is invalid', async () => {
    const applied: string[] = [];
    const { actor, recovering } = startEngineTurnActor(
      {
        model,
        llmRequester: createRequesterService(['unauthorized', 'ok']),
        toolExecutor: createToolExecutor(),
        toolInfos: () => [],
        maxAttemptsPerStep: 10,
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
    expect(recovering[0]?.detail).toBe('kilo → personal (key2)');
  });

  it('rotates on the first forbidden attempt without spending the rejected key retry budget', async () => {
    const applied: string[] = [];
    const { actor, recovering } = startEngineTurnActor(
      {
        model,
        llmRequester: createRequesterService(['forbidden', 'ok']),
        toolExecutor: createToolExecutor(),
        toolInfos: () => [],
        maxAttemptsPerStep: 10,
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

  it('does not rotate a rejected credential when the provider has rotation turned off', async () => {
    const applied: string[] = [];
    const { actor, recovering } = startEngineTurnActor(
      {
        model,
        llmRequester: createRequesterService(['unauthorized']),
        toolExecutor: createToolExecutor(),
        toolInfos: () => [],
        maxAttemptsPerStep: 10,
        journal: memoryJournal(),
      },
      {
        request: {
          model,
          credentialProvider: {
            resolve: () => ({ apiKey: 'sk-first' }),
            rotation: () => undefined,
          },
        },
      },
    );

    await advanceTurn(actor);

    expect(applied).toEqual([]);
    expect(recovering).toEqual([]);
  });

  it('does not rotate a rejected credential for a provider with a single key', async () => {
    const applied: string[] = [];
    const { actor, recovering } = startEngineTurnActor(
      {
        model,
        llmRequester: createRequesterService(['unauthorized']),
        toolExecutor: createToolExecutor(),
        toolInfos: () => [],
        maxAttemptsPerStep: 10,
        journal: memoryJournal(),
      },
      {
        request: {
          model,
          credentialProvider: {
            resolve: () => ({ apiKey: 'sk-first' }),
            rotation: () => ({
              providerName: 'kilo',
              keyCount: 1,
              plan: () => undefined,
              rotate: (keyId: string | undefined) => {
                applied.push(`rotate:${String(keyId)}`);
                return Promise.resolve({ outcome: 'unavailable' as const });
              },
            }),
          },
        },
      },
    );

    await advanceTurn(actor);

    expect(applied).toEqual([]);
    expect(recovering).toEqual([]);
  });
});
