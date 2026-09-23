import { describe, expect, it } from 'vitest';

import {
  ProvidersSectionSchema,
  providersFromToml,
  providersToToml,
} from '#/app/kosongConfig/configSection';
import { ProviderService } from '#/llm-adapter/provider/provider-service';
import { type ProviderConfig } from '#/llm-adapter/provider/provider';

describe('ProviderTypeSchema (free-form vendor identity)', () => {
  it('parses unregistered vendor names — resolve-time validation, not parse-time', () => {
    const parsed = ProvidersSectionSchema.parse({
      'my-vendor': { type: 'a-vendor-registered-elsewhere', baseUrl: 'https://example.com/v1' },
    });
    expect(parsed['my-vendor']?.type).toBe('a-vendor-registered-elsewhere');
  });
});

describe('providers TOML transforms', () => {
  it('converts snake_case entries to camelCase and back', () => {
    const from = providersFromToml({
      'my-provider': {
        type: 'kimi',
        base_url: 'https://api.moonshot.ai/v1',
        custom_headers: { 'x-a': 'b' },
        default_model: 'kimi-k2',
        oauth: { storage: 'file', key: 'k', oauth_host: 'example.com' },
      },
    }) as Record<string, Record<string, unknown>>;
    expect(from['my-provider']).toEqual({
      type: 'kimi',
      baseUrl: 'https://api.moonshot.ai/v1',
      customHeaders: { 'x-a': 'b' },
      defaultModel: 'kimi-k2',
      oauth: { storage: 'file', key: 'k', oauthHost: 'example.com' },
    });

    const back = providersToToml(from, undefined) as Record<string, Record<string, unknown>>;
    expect(back['my-provider']).toEqual({
      type: 'kimi',
      base_url: 'https://api.moonshot.ai/v1',
      custom_headers: { 'x-a': 'b' },
      default_model: 'kimi-k2',
      oauth: { storage: 'file', key: 'k', oauth_host: 'example.com' },
    });
  });

  it('round-trips api_key_env between TOML and camelCase', () => {
    const from = providersFromToml({
      acme: { type: 'openai', api_key_env: 'ACME_API_KEY' },
    }) as Record<string, Record<string, unknown>>;
    expect(from['acme']).toEqual({ type: 'openai', apiKeyEnv: 'ACME_API_KEY' });

    const parsed = ProvidersSectionSchema.parse(from);
    expect(parsed['acme']?.apiKeyEnv).toBe('ACME_API_KEY');

    const back = providersToToml(from, undefined) as Record<string, Record<string, unknown>>;
    expect(back['acme']).toEqual({ type: 'openai', api_key_env: 'ACME_API_KEY' });
  });

  it('drops a stale api_key_env and oauth when the provider is replaced with an inline api_key', () => {
    const raw = {
      acme: {
        type: 'openai',
        api_key_env: 'ACME_API_KEY',
        oauth: { storage: 'file', key: 'oauth/acme' },
      },
    };
    const next = providersToToml(
      { acme: { type: 'openai', apiKey: 'sk-new' } },
      raw,
    ) as Record<string, Record<string, unknown>>;
    expect(next['acme']).toEqual({ type: 'openai', api_key: 'sk-new' });
  });

  it('carries rotate_keys through the transform and the provider schema', () => {
    const from = providersFromToml({
      kilo: { type: 'openai', rotate_keys: true },
    }) as Record<string, unknown>;
    const parsed = ProvidersSectionSchema.parse(from);
    expect(parsed['kilo']).toEqual({ type: 'openai', rotateKeys: true });

    const back = providersToToml(parsed, {
      kilo: { type: 'openai', rotate_keys: true },
    }) as Record<string, Record<string, unknown>>;
    expect(back['kilo']).toEqual({ type: 'openai', rotate_keys: true });
  });

  it('round-trips a key entry proxy_url and preserves unknown key fields', () => {
    const raw = {
      kilo: {
        type: 'openai',
        api_keys: {
          key1: {
            key: 'sk-alpha',
            name: 'work',
            proxy_url: 'http://127.0.0.1:8081',
            quota_tier: 'gold',
          },
          key2: { key: 'sk-beta', name: 'personal' },
        },
      },
    };
    const from = providersFromToml(raw) as Record<string, unknown>;
    const parsed = ProvidersSectionSchema.parse(from);
    expect(parsed['kilo']?.apiKeys).toEqual({
      key1: { key: 'sk-alpha', name: 'work', proxyUrl: 'http://127.0.0.1:8081' },
      key2: { key: 'sk-beta', name: 'personal' },
    });

    const back = providersToToml(parsed, raw) as Record<string, Record<string, unknown>>;
    expect(back['kilo']?.['api_keys']).toEqual({
      key1: {
        key: 'sk-alpha',
        name: 'work',
        proxy_url: 'http://127.0.0.1:8081',
        quota_tier: 'gold',
      },
      key2: { key: 'sk-beta', name: 'personal' },
    });
  });

  it('treats an empty key proxy_url as absent on read and on write', () => {
    const raw = {
      kilo: {
        type: 'openai',
        api_keys: { key1: { key: 'sk-alpha', name: 'work', proxy_url: '   ' } },
      },
    };
    const parsed = ProvidersSectionSchema.parse(providersFromToml(raw));
    expect(parsed['kilo']?.apiKeys).toEqual({ key1: { key: 'sk-alpha', name: 'work' } });

    const back = providersToToml(parsed, raw) as Record<string, Record<string, unknown>>;
    expect(back['kilo']?.['api_keys']).toEqual({ key1: { key: 'sk-alpha', name: 'work' } });
  });
});

const KEYED_PROVIDER: ProviderConfig = {
  type: 'openai',
  apiKey: 'sk-legacy',
  apiKeys: {
    key1: { key: 'sk-alpha', name: 'work' },
    key2: { key: 'sk-beta', name: 'personal' },
  },
  activeApiKeyId: 'key1',
  proxyUrl: 'http://127.0.0.1:8080',
};

describe('ProviderService', () => {
  function createService(providers: Readonly<Record<string, ProviderConfig>> = {}): ProviderService {
    const service = new ProviderService();
    service.loadAll({ ...providers }, undefined);
    return service;
  }

  it('resolves ready on the first loadAll and gates mutations on it', async () => {
    const service = new ProviderService();
    let ready = false;
    void service.ready.then(() => {
      ready = true;
    });
    await Promise.resolve();
    expect(ready).toBe(false);

    service.loadAll({ moonshot: { type: 'kimi' } }, 'moonshot');
    await service.ready;
    expect(ready).toBe(true);
    expect(service.get('moonshot')).toEqual({ type: 'kimi' });
    expect(service.getDefaultProvider()).toBe('moonshot');
  });

  it('supports CRUD and diffs state changes into onDidChangeProviders', async () => {
    const service = createService();
    const events: Array<{
      added: readonly string[];
      removed: readonly string[];
      changed: readonly string[];
    }> = [];
    service.onDidChangeProviders((e) =>
      events.push({ added: e.added, removed: e.removed, changed: e.changed }),
    );

    const moonshot: ProviderConfig = { type: 'kimi', baseUrl: 'https://api.moonshot.ai/v1' };
    await service.set('moonshot', moonshot);
    expect(service.get('moonshot')).toEqual(moonshot);
    expect(service.list()).toEqual({ moonshot });
    expect(events).toEqual([{ added: ['moonshot'], removed: [], changed: [] }]);

    const updated: ProviderConfig = { ...moonshot, apiKey: 'sk-1' };
    await service.set('moonshot', updated);
    expect(events.at(-1)).toEqual({ added: [], removed: [], changed: ['moonshot'] });

    await service.set('moonshot', updated);
    expect(events).toHaveLength(2);

    await service.delete('moonshot');
    expect(service.get('moonshot')).toBeUndefined();
    expect(events.at(-1)).toEqual({ added: [], removed: ['moonshot'], changed: [] });
  });

  it('loadAll fires only for real diffs on re-sync', async () => {
    const service = createService({ moonshot: { type: 'kimi' } });
    const events: unknown[] = [];
    service.onDidChangeProviders((e) =>
      events.push({ added: e.added, removed: e.removed, changed: e.changed }),
    );

    service.loadAll({ moonshot: { type: 'kimi' } }, undefined);
    expect(events).toHaveLength(0);

    service.loadAll({ moonshot: { type: 'kimi' }, other: { baseUrl: 'https://example.com' } }, undefined);
    expect(events).toEqual([{ added: ['other'], removed: [], changed: [] }]);
  });

  it('replaceAll replaces the records and keeps the default pointer', async () => {
    const service = createService({ a: { type: 'kimi' }, b: { type: 'kimi' } });
    await service.setDefaultProvider('a');

    await service.replaceAll({ c: { type: 'kimi' } });
    expect(service.list()).toEqual({ c: { type: 'kimi' } });
    expect(service.getDefaultProvider()).toBe('a');
  });

  it('clears the defaultProvider pointer when the default provider is deleted', async () => {
    const service = createService({ moonshot: { type: 'kimi' } });
    const pointerEvents: Array<string | undefined> = [];
    service.onDidChangeDefaultProvider((e) => pointerEvents.push(e.id));

    await service.setDefaultProvider('moonshot');
    expect(service.getDefaultProvider()).toBe('moonshot');

    await service.delete('moonshot');
    expect(service.getDefaultProvider()).toBeUndefined();
    expect(pointerEvents).toEqual(['moonshot', undefined]);
  });

  it('setActiveApiKey advances the cursor only after the persist chain ran', async () => {
    const service = createService({ kilo: KEYED_PROVIDER });
    const persistedActiveKeys: Array<string | undefined> = [];
    service.onDidChangeProviders((e) => {
      e.waitUntil(
        new Promise<void>((resolve) => setTimeout(resolve, 20)).then(() => {
          persistedActiveKeys.push(service.get('kilo')?.activeApiKeyId);
        }),
      );
    });

    await service.setActiveApiKey('kilo', 'key2');
    expect(persistedActiveKeys).toEqual(['key2']);
    expect(service.get('kilo')?.activeApiKeyId).toBe('key2');
  });

  it('setActiveApiKey leaves every other field and every other provider untouched', async () => {
    const service = createService({ kilo: KEYED_PROVIDER, other: { type: 'kimi' } });

    await service.setActiveApiKey('kilo', 'key2');

    expect(service.get('kilo')).toEqual({ ...KEYED_PROVIDER, activeApiKeyId: 'key2' });
    expect(service.get('other')).toEqual({ type: 'kimi' });
  });

  it('setActiveApiKey keeps the advanced key in memory when a persist listener fails', async () => {
    const service = createService({ kilo: KEYED_PROVIDER });
    service.onDidChangeProviders((e) => {
      e.waitUntil(Promise.reject(new Error('persist failed')));
    });

    const outcome = await service.setActiveApiKey('kilo', 'key2').then(
      () => 'resolved',
      () => 'rejected',
    );
    expect(outcome).toBe('resolved');
    expect(service.get('kilo')?.activeApiKeyId).toBe('key2');
  });

  it('a mutation resolves only after the listeners’ waitUntil work completes', async () => {
    const service = createService();
    let persistDone = false;
    service.onDidChangeProviders((e) => {
      e.waitUntil(
        new Promise<void>((resolve) => setTimeout(resolve, 50)).then(() => {
          persistDone = true;
        }),
      );
    });

    await service.set('moonshot', { type: 'kimi' });
    expect(persistDone).toBe(true);
  });
});
