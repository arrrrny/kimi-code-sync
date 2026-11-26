import { describe, expect, it, vi } from 'vitest';

import type { LlmRecoveryContext, LlmRecoveryRecord } from '@moonshot-ai/core/llm/policy/recovery';
import type { LlmCredentialProvider, LlmKeyRotationController } from '@moonshot-ai/core/llm/request';
import type { LlmRemoteErrorMessage } from '@moonshot-ai/core/llm/response';
import { keyRotationRecovery } from '#/credentials/keyRotationRecovery';

const NEXT_KEY = { keyId: 'key2', name: 'personal' };

function controller(overrides: Partial<LlmKeyRotationController> = {}): LlmKeyRotationController {
  return {
    providerName: 'kilo',
    keyCount: 3,
    plan: () => ({ ...NEXT_KEY }),
    rotate: () => Promise.resolve({ outcome: 'rotated', ...NEXT_KEY }),
    ...overrides,
  };
}

function rotationProvider(rotation: LlmKeyRotationController | undefined): LlmCredentialProvider {
  return { resolve: () => undefined, rotation: () => rotation };
}

function context(args: {
  error: LlmRemoteErrorMessage;
  attempt?: number;
  maxAttempts?: number;
  appliedRecoveries?: readonly LlmRecoveryRecord[];
  rotation?: LlmKeyRotationController;
}): LlmRecoveryContext {
  return {
    error: args.error,
    request: {} as LlmRecoveryContext['request'],
    appliedRecoveries: args.appliedRecoveries ?? [],
    attempt: args.attempt ?? 1,
    maxAttempts: args.maxAttempts ?? 10,
    endpoint: { credentials: rotationProvider(args.rotation ?? controller()) },
  };
}

function statusError(statusCode: number, kind: 'status' | 'rate_limit' = 'status'): LlmRemoteErrorMessage {
  return {
    kind,
    message: `status ${statusCode}`,
    statusCode,
    requestId: null,
    retryAfterMs: null,
    headers: null,
  };
}

function authKindError(statusCode: number): LlmRemoteErrorMessage {
  return { ...statusFields(), kind: 'auth', message: `auth ${statusCode}`, statusCode };
}

const refused = statusError(403);
const rateLimited = statusError(429, 'rate_limit');

describe('keyRotationRecovery qualification', () => {
  it('proposes on a 403 at the first attempt', () => {
    expect(keyRotationRecovery.propose(context({ error: refused }))).toMatchObject({
      strategy: 'api_key_rotation',
      action: NEXT_KEY.keyId,
    });
  });

  it('proposes on a 403 at the last allowed attempt', () => {
    expect(
      keyRotationRecovery.propose(context({ error: refused, attempt: 10, maxAttempts: 10 })),
    ).toMatchObject({ strategy: 'api_key_rotation' });
  });

  it('declines a 429 while one attempt of budget is left', () => {
    expect(
      keyRotationRecovery.propose(context({ error: rateLimited, attempt: 9, maxAttempts: 10 })),
    ).toBeUndefined();
  });

  it('proposes on a 429 once the attempt budget is exhausted', () => {
    expect(
      keyRotationRecovery.propose(context({ error: rateLimited, attempt: 10, maxAttempts: 10 })),
    ).toMatchObject({ strategy: 'api_key_rotation' });
  });

  it('proposes on a 401 at the last allowed attempt', () => {
    expect(
      keyRotationRecovery.propose(
        context({ error: statusError(401), attempt: 10, maxAttempts: 10 }),
      ),
    ).toMatchObject({ strategy: 'api_key_rotation' });
  });

  it('proposes on a 401 at the first attempt', () => {
    expect(keyRotationRecovery.propose(context({ error: statusError(401) }))).toMatchObject({
      strategy: 'api_key_rotation',
      action: NEXT_KEY.keyId,
    });
  });

  it('proposes on an auth-kind 401', () => {
    expect(keyRotationRecovery.propose(context({ error: authKindError(401) }))).toMatchObject({
      strategy: 'api_key_rotation',
      action: NEXT_KEY.keyId,
    });
  });

  it('proposes on an auth-kind 403', () => {
    expect(keyRotationRecovery.propose(context({ error: authKindError(403) }))).toMatchObject({
      strategy: 'api_key_rotation',
    });
  });

  it('declines for a non-auth 4xx status', () => {
    expect(keyRotationRecovery.propose(context({ error: statusError(402) }))).toBeUndefined();
  });

  it('keeps the rate-limit rotation while a 401 rotates on the first attempt', () => {
    expect(
      keyRotationRecovery.propose(context({ error: rateLimited, attempt: 9, maxAttempts: 10 })),
    ).toBeUndefined();
    expect(
      keyRotationRecovery.propose(context({ error: rateLimited, attempt: 10, maxAttempts: 10 })),
    ).toMatchObject({ strategy: 'api_key_rotation' });
    expect(keyRotationRecovery.propose(context({ error: statusError(401) }))).toMatchObject({
      strategy: 'api_key_rotation',
    });
  });

  it('declines for a quota-exhausted failure', () => {
    expect(
      keyRotationRecovery.propose(
        context({ error: { kind: 'quota_exhausted', message: 'quota', ...statusFields() } }),
      ),
    ).toBeUndefined();
  });

  it('declines for a context-overflow failure', () => {
    expect(
      keyRotationRecovery.propose(
        context({ error: { kind: 'context_overflow', message: 'too long', ...statusFields() } }),
      ),
    ).toBeUndefined();
  });

  it('declines for a transport failure', () => {
    expect(
      keyRotationRecovery.propose(
        context({ error: { kind: 'connection', message: 'socket closed' } }),
      ),
    ).toBeUndefined();
  });

  it('declines a 401 once keyCount - 1 rotations were applied to this step', () => {
    expect(
      keyRotationRecovery.propose(
        context({ error: statusError(401), appliedRecoveries: rotationRecords(2) }),
      ),
    ).toBeUndefined();
  });

  it('still proposes a 401 while only keyCount - 2 rotations were applied to this step', () => {
    expect(
      keyRotationRecovery.propose(
        context({ error: statusError(401), appliedRecoveries: rotationRecords(1) }),
      ),
    ).toMatchObject({ strategy: 'api_key_rotation' });
  });
});

function statusFields(): {
  statusCode: number;
  requestId: null;
  retryAfterMs: null;
  headers: null;
} {
  return { statusCode: 500, requestId: null, retryAfterMs: null, headers: null };
}

describe('keyRotationRecovery cycle bound', () => {
  it('declines when the credential provider exposes no rotation controller', () => {
    const ctx = context({ error: refused });
    expect(
      keyRotationRecovery.propose({ ...ctx, endpoint: { credentials: { resolve: () => undefined } } }),
    ).toBeUndefined();
  });

  it('declines once keyCount - 1 rotations were applied to this step', () => {
    expect(
      keyRotationRecovery.propose(
        context({ error: refused, appliedRecoveries: rotationRecords(2) }),
      ),
    ).toBeUndefined();
  });

  it('still proposes while only keyCount - 2 rotations were applied to this step', () => {
    expect(
      keyRotationRecovery.propose(
        context({ error: refused, appliedRecoveries: rotationRecords(1) }),
      ),
    ).toMatchObject({ strategy: 'api_key_rotation' });
  });

  it('declines once a rotation of this step failed to apply', () => {
    expect(
      keyRotationRecovery.propose(
        context({
          error: refused,
          appliedRecoveries: [
            { strategy: 'api_key_rotation', action: 'key2', detail: 'failed', failed: true },
          ],
        }),
      ),
    ).toBeUndefined();
  });
});

describe('keyRotationRecovery exhaustion', () => {
  it('reports the provider and the key count once every key was tried on a 401', () => {
    expect(
      keyRotationRecovery.exhausted?.(
        context({ error: statusError(401), appliedRecoveries: rotationRecords(2) }),
      ),
    ).toEqual({
      strategy: 'api_key_rotation',
      action: 'exhausted',
      detail: 'kilo: all 3 configured keys were tried',
    });
  });

  it('stays silent while a key is still untried in this step', () => {
    expect(
      keyRotationRecovery.exhausted?.(
        context({ error: statusError(401), appliedRecoveries: rotationRecords(1) }),
      ),
    ).toBeUndefined();
  });

  it('stays silent when no rotation was applied to this step', () => {
    expect(
      keyRotationRecovery.exhausted?.(context({ error: statusError(401) })),
    ).toBeUndefined();
  });

  it('stays silent for a failure that never qualified for rotation', () => {
    expect(
      keyRotationRecovery.exhausted?.(
        context({ error: statusError(402), appliedRecoveries: rotationRecords(2) }),
      ),
    ).toBeUndefined();
  });

  it('stays silent when the step only holds a rotation that failed to apply', () => {
    expect(
      keyRotationRecovery.exhausted?.(
        context({
          error: refused,
          rotation: controller({ keyCount: 2 }),
          appliedRecoveries: [{ strategy: 'api_key_rotation', action: 'key2', failed: true }],
        }),
      ),
    ).toBeUndefined();
  });

  it('stays silent when the credential provider exposes no rotation controller', () => {
    const ctx = context({ error: refused, appliedRecoveries: rotationRecords(2) });
    expect(
      keyRotationRecovery.exhausted?.({ ...ctx, endpoint: { credentials: { resolve: () => undefined } } }),
    ).toBeUndefined();
  });

  it('reports no key value', () => {
    const record = keyRotationRecovery.exhausted?.(
      context({ error: refused, appliedRecoveries: rotationRecords(2) }),
    );
    expect(record?.detail).not.toContain('sk-');
  });
});

function rotationRecords(count: number): LlmRecoveryRecord[] {
  return Array.from({ length: count }, () => ({
    strategy: 'api_key_rotation',
    action: 'key1',
  }));
}

describe('keyRotationRecovery proposal', () => {
  it('awaits the controller rotate call for the planned key before the next attempt', async () => {
    const rotate = vi.fn(() => Promise.resolve({ outcome: 'rotated' as const, ...NEXT_KEY }));
    const proposal = keyRotationRecovery.propose(
      context({ error: refused, rotation: controller({ rotate }) }),
    );

    const pending = proposal?.beforeNextAttempt?.();
    expect(rotate).toHaveBeenCalledWith(NEXT_KEY.keyId);
    await pending;
  });

  it('names the provider and the target key without the key value', () => {
    const proposal = keyRotationRecovery.propose(context({ error: refused }));
    expect(proposal?.detail).toBe('kilo → personal (key2)');
    expect(proposal?.detail).not.toContain('sk-');
  });

  it('names the provider and the target key without the key value for a 401', () => {
    const proposal = keyRotationRecovery.propose(context({ error: statusError(401) }));
    expect(proposal?.detail).toBe('kilo → personal (key2)');
    expect(proposal?.detail).not.toContain('sk-');
  });

  it('rejects when the controller reports the planned key is no longer available', async () => {
    const proposal = keyRotationRecovery.propose(
      context({
        error: refused,
        rotation: controller({ rotate: () => Promise.resolve({ outcome: 'unavailable' }) }),
      }),
    );

    await expect(proposal?.beforeNextAttempt?.()).rejects.toThrow(
      'key rotation for kilo is no longer available',
    );
  });
});
