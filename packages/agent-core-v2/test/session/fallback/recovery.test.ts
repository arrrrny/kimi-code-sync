import { describe, expect, it } from 'vitest';

import type {
  LlmRecoveryContext,
  LlmRecoveryRecord,
} from '@moonshot-ai/core/llm/policy/recovery';
import type { LlmErrorMessage } from '@moonshot-ai/core/llm/response';
import type {
  LlmEndpoint,
  LlmKeyRotationController,
  LlmRequest,
} from '@moonshot-ai/core/llm/request';

import type { IConfigService } from '#/app/config/config';
import type { IFlagService } from '#/app/flag/flag';
import { FALLBACK_MODEL_SECTION } from '#/app/kosongConfig/configSection';
import { createFallbackModelRecovery, type FallbackModelSwap } from '#/session/fallback/recovery';

function makeRequest(name: string): LlmRequest {
  return {
    protocol: { base: {} as never },
    model: { spec: { provider: 'test', name } },
    content: { messages: [] },
  };
}

function errorOf(kind: LlmErrorMessage['kind'], statusCode?: number): LlmErrorMessage {
  return statusCode === undefined
    ? ({ kind, message: kind } as LlmErrorMessage)
    : ({ kind, message: kind, statusCode } as LlmErrorMessage);
}

function ctx(args: {
  error: LlmErrorMessage;
  request: LlmRequest;
  appliedRecoveries?: readonly LlmRecoveryRecord[];
  endpoint?: LlmEndpoint;
}): LlmRecoveryContext {
  return {
    error: args.error,
    request: args.request,
    appliedRecoveries: args.appliedRecoveries ?? [],
    endpoint: args.endpoint,
    attempt: 1,
    maxAttempts: 10,
  };
}

function deps(options: {
  readonly fallback?: { model?: string; secondaryModel?: string };
  readonly enabled?: boolean;
  readonly resolve?: (request: LlmRequest, alias: string, thinking?: string) => FallbackModelSwap;
}): {
  readonly config: IConfigService;
  readonly flags: IFlagService;
  readonly resolveSwap: (request: LlmRequest, alias: string, thinking?: string) => FallbackModelSwap;
} {
  const resolveSwap =
    options.resolve ??
    ((_request: LlmRequest, alias: string, thinking?: string): FallbackModelSwap => ({
      model: {
        spec: { provider: 'test', name: alias },
        thinking: thinking === undefined ? undefined : { effort: thinking as never },
      },
    }));
  const config = {
    get: (domain: string) =>
      domain === FALLBACK_MODEL_SECTION ? options.fallback : undefined,
  } as unknown as IConfigService;
  const flags = { enabled: () => options.enabled ?? true } as unknown as IFlagService;
  return { config, flags, resolveSwap };
}

function rotationController(keyCount: number): LlmKeyRotationController {
  return {
    providerName: 'test',
    keyCount,
    plan: () => undefined,
    rotate: async () => ({ outcome: 'unavailable' }),
  };
}

function endpointWithRotation(controller: LlmKeyRotationController | undefined): LlmEndpoint {
  return { credentials: { resolve: () => undefined, rotation: () => controller } };
}

function rotationRecord(action: string, failed = false): LlmRecoveryRecord {
  return { strategy: 'api_key_rotation', action, failed };
}

describe('createFallbackModelRecovery', () => {
  it('U1: proposes a model-switch rewrite on a provider error', () => {
    const d = deps({ fallback: { model: 'fb1' } });
    const recovery = createFallbackModelRecovery(d);
    const request = makeRequest('primary');
    const entry = recovery.propose(ctx({ error: errorOf('provider'), request }));
    expect(entry?.strategy).toBe('fallback_model');
    expect(entry?.action).toBe('fb1');
    const rewritten = entry?.rewrite ? entry.rewrite(request) : request;
    expect(rewritten.model.spec.name).toBe('fb1');
  });

  it('U2: proposes for timeout, network, and quota_exhausted', () => {
    for (const kind of ['timeout', 'connection', 'quota_exhausted'] as const) {
      const d = deps({ fallback: { model: 'fb1' } });
      const recovery = createFallbackModelRecovery(d);
      const entry = recovery.propose(ctx({ error: errorOf(kind), request: makeRequest('primary') }));
      expect(entry?.action).toBe('fb1');
    }
  });

  it('U3: returns undefined when no fallback model is configured', () => {
    const d = deps({ fallback: undefined });
    const recovery = createFallbackModelRecovery(d);
    expect(
      recovery.propose(ctx({ error: errorOf('provider'), request: makeRequest('primary') })),
    ).toBeUndefined();
  });

  it('U3b: returns undefined when the flag is disabled', () => {
    const d = deps({ fallback: { model: 'fb1' }, enabled: false });
    const recovery = createFallbackModelRecovery(d);
    expect(
      recovery.propose(ctx({ error: errorOf('provider'), request: makeRequest('primary') })),
    ).toBeUndefined();
  });

  it('U4: yields to key rotation on rate_limit/auth while keys remain', () => {
    for (const error of [errorOf('rate_limit', 429), errorOf('auth', 401)]) {
      const d = deps({ fallback: { model: 'fb1' } });
      const recovery = createFallbackModelRecovery(d);
      const entry = recovery.propose(
        ctx({
          error,
          request: makeRequest('primary'),
          endpoint: endpointWithRotation(rotationController(3)),
        }),
      );
      expect(entry).toBeUndefined();
    }
  });

  it('U5: claims the turn on rate_limit once rotation is exhausted', () => {
    const d = deps({ fallback: { model: 'fb1' } });
    const recovery = createFallbackModelRecovery(d);
    const entry = recovery.propose(
      ctx({
        error: errorOf('rate_limit', 429),
        request: makeRequest('primary'),
        appliedRecoveries: [rotationRecord('k1'), rotationRecord('k2')],
        endpoint: endpointWithRotation(rotationController(3)),
      }),
    );
    expect(entry?.action).toBe('fb1');
  });

  it('U5b: claims the turn after a failed key rotation, including auth rejections', () => {
    for (const error of [errorOf('rate_limit', 429), errorOf('auth', 401)]) {
      const d = deps({ fallback: { model: 'fb1' } });
      const recovery = createFallbackModelRecovery(d);
      const entry = recovery.propose(
        ctx({
          error,
          request: makeRequest('primary'),
          appliedRecoveries: [rotationRecord('k1', true)],
          endpoint: endpointWithRotation(rotationController(3)),
        }),
      );
      expect(entry?.action).toBe('fb1');
    }
  });

  it('U6: skips a tier equal to the current model', () => {
    const d = deps({ fallback: { model: 'fb1', secondaryModel: 'fb2' } });
    const recovery = createFallbackModelRecovery(d);
    const entry = recovery.propose(
      ctx({ error: errorOf('timeout'), request: makeRequest('fb1') }),
    );
    expect(entry?.action).toBe('fb2');
  });

  it('U7: skips a tier whose alias cannot be resolved', () => {
    const d = deps({
      fallback: { model: 'ghost', secondaryModel: 'fb2' },
      resolve: (_request, alias) => {
        if (alias === 'ghost') throw new Error('unknown alias');
        return { model: { spec: { provider: 'test', name: alias } } };
      },
    });
    const recovery = createFallbackModelRecovery(d);
    const entry = recovery.propose(
      ctx({ error: errorOf('provider'), request: makeRequest('primary') }),
    );
    expect(entry?.action).toBe('fb2');
  });

  it('U8: returns undefined once every tier has been tried', () => {
    const d = deps({ fallback: { model: 'fb1', secondaryModel: 'fb2' } });
    const recovery = createFallbackModelRecovery(d);
    const applied: LlmRecoveryRecord[] = [
      { strategy: 'fallback_model', action: 'fb1' },
    ];
    const entry = recovery.propose(
      ctx({
        error: errorOf('timeout'),
        request: makeRequest('fb2'),
        appliedRecoveries: applied,
      }),
    );
    expect(entry).toBeUndefined();
  });

  it('ignores non-retryable client errors', () => {
    const d = deps({ fallback: { model: 'fb1' } });
    const recovery = createFallbackModelRecovery(d);
    expect(
      recovery.propose(ctx({ error: errorOf('unknown', 400), request: makeRequest('primary') })),
    ).toBeUndefined();
  });
});