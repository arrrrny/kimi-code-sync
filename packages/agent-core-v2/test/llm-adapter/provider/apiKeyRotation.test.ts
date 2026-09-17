import { describe, expect, it } from 'vitest';

import { createKeyedCredentialProvider } from '#/llm-adapter/provider/apiKeyRotation';
import type { ProviderConfig } from '#/llm-adapter/provider/provider';
import { ProviderService } from '#/llm-adapter/provider/provider-service';

function service(providers: Record<string, ProviderConfig>): ProviderService {
  const providers_ = new ProviderService();
  providers_.loadAll({ ...providers }, undefined);
  return providers_;
}

const THREE_KEYS: ProviderConfig = {
  type: 'openai',
  apiKeys: {
    key1: { key: 'sk-alpha', name: 'work' },
    key2: { key: 'sk-beta', name: 'personal', proxyUrl: 'http://127.0.0.1:8081' },
    key3: { key: 'sk-gamma', name: 'backup' },
  },
  activeApiKeyId: 'key1',
  rotateKeys: true,
};

function keyed(providers: ProviderService, providerName = 'kilo') {
  return createKeyedCredentialProvider({ providers, providerName });
}

describe('keyed credential provider resolution', () => {
  it('re-reads the provider config on every resolve', async () => {
    const providers = service({ kilo: THREE_KEYS });
    const provider = keyed(providers);

    expect(await provider.resolve()).toEqual({ apiKey: 'sk-alpha' });

    await providers.setActiveApiKey('kilo', 'key2');
    expect(await provider.resolve()).toEqual({
      apiKey: 'sk-beta',
      proxyUrl: 'http://127.0.0.1:8081',
    });
  });

  it('returns the active key proxyUrl and nothing when the key declares none', async () => {
    const providers = service({ kilo: { ...THREE_KEYS, activeApiKeyId: 'key2' } });
    expect(await keyed(providers).resolve()).toEqual({
      apiKey: 'sk-beta',
      proxyUrl: 'http://127.0.0.1:8081',
    });

    await providers.setActiveApiKey('kilo', 'key3');
    expect(await keyed(providers).resolve()).toEqual({ apiKey: 'sk-gamma' });
  });

  it('falls back to the legacy apiKey when no key set is configured', async () => {
    const providers = service({ kilo: { type: 'openai', apiKey: 'sk-legacy' } });
    expect(await keyed(providers).resolve()).toEqual({ apiKey: 'sk-legacy' });
  });
});

describe('keyed credential provider rotation surface', () => {
  it('exposes no controller when rotateKeys is absent', () => {
    const providers = service({ kilo: { ...THREE_KEYS, rotateKeys: undefined } });
    expect(keyed(providers).rotation?.()).toBeUndefined();
  });

  it('exposes no controller when rotateKeys is false', () => {
    const providers = service({ kilo: { ...THREE_KEYS, rotateKeys: false } });
    expect(keyed(providers).rotation?.()).toBeUndefined();
  });

  it('exposes a controller for two or more keys with rotateKeys on', () => {
    const providers = service({ kilo: THREE_KEYS });
    expect(keyed(providers).rotation?.()?.keyCount).toBe(3);
  });

  it('exposes no controller for an oauth-backed provider', () => {
    const providers = service({
      kilo: { ...THREE_KEYS, oauth: { storage: 'file', key: 'k' } },
    });
    expect(keyed(providers).rotation?.()).toBeUndefined();
  });

  it('exposes no controller for a managed provider id', () => {
    const providers = service({ 'managed:kimi-code': THREE_KEYS });
    expect(keyed(providers, 'managed:kimi-code').rotation?.()).toBeUndefined();
  });

  it('exposes a single-key provider no controller', () => {
    const providers = service({
      kilo: {
        type: 'openai',
        apiKeys: { key1: { key: 'sk-alpha', name: 'work' } },
        activeApiKeyId: 'key1',
        rotateKeys: true,
      },
    });
    expect(keyed(providers).rotation?.()).toBeUndefined();
  });
});

describe('keyed credential provider rotation plan', () => {
  it('plans the key after the active one in definition order', () => {
    const providers = service({ kilo: { ...THREE_KEYS, activeApiKeyId: 'key2' } });
    expect(keyed(providers).rotation?.()?.plan()).toEqual({ keyId: 'key3', name: 'backup' });
  });

  it('wraps to the first key when the active key is the last one', () => {
    const providers = service({ kilo: { ...THREE_KEYS, activeApiKeyId: 'key3' } });
    expect(keyed(providers).rotation?.()?.plan()).toEqual({ keyId: 'key1', name: 'work' });
  });

  it('plans the first key when the cursor names no entry', () => {
    const providers = service({ kilo: { ...THREE_KEYS, activeApiKeyId: 'gone' } });
    expect(keyed(providers).rotation?.()?.plan()).toEqual({ keyId: 'key1', name: 'work' });
  });
});

describe('keyed credential provider rotation apply', () => {
  it('advances the active key after the persist chain ran and reports the new key', async () => {
    const providers = service({ kilo: THREE_KEYS });
    const observed: Array<string | undefined> = [];
    providers.onDidChangeProviders((e) => {
      e.waitUntil(
        new Promise<void>((resolve) => setTimeout(resolve, 10)).then(() => {
          observed.push(providers.get('kilo')?.activeApiKeyId);
        }),
      );
    });

    const outcome = await keyed(providers).rotation?.()?.rotate('key2');

    expect(outcome).toEqual({ outcome: 'rotated', keyId: 'key2', name: 'personal' });
    expect(observed).toEqual(['key2']);
    expect(providers.get('kilo')?.activeApiKeyId).toBe('key2');
  });

  it('reports already-advanced without advancing twice', async () => {
    const providers = service({ kilo: THREE_KEYS });
    await providers.setActiveApiKey('kilo', 'key2');

    const outcome = await keyed(providers).rotation?.()?.rotate('key2');

    expect(outcome).toEqual({ outcome: 'already-advanced', keyId: 'key2', name: 'personal' });
    expect(providers.get('kilo')?.activeApiKeyId).toBe('key2');
  });

  it('reports unavailable when the provider disappeared before the apply', async () => {
    const providers = service({ kilo: THREE_KEYS });
    const controller = keyed(providers).rotation?.();
    await providers.delete('kilo');

    expect(await controller?.rotate('key2')).toEqual({ outcome: 'unavailable' });
  });

  it('serializes concurrent rotations so the cursor advances exactly once', async () => {
    const providers = service({ kilo: THREE_KEYS });
    const controller = keyed(providers).rotation?.();

    const outcomes = await Promise.all([
      controller?.rotate('key2'),
      controller?.rotate('key2'),
    ]);

    expect(outcomes.map((outcome) => outcome?.outcome)).toEqual([
      'rotated',
      'already-advanced',
    ]);
    expect(providers.get('kilo')?.activeApiKeyId).toBe('key2');
  });
});
