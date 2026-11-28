import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ManagedKimiConfigShape, ManagedKimiOAuthRef } from '../src/managed-kimi-code';
import {
  fetchOpenAIProviderModels,
  type FetchOpenAIProviderModelsOptions,
} from '../src/openai-compatible';
import { refreshProviderCatalog, refreshProviderModels, type RefreshProviderHost } from '../src/refreshProviderModels';

type FetchMock = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => Promise<Response>;

function makeRefreshHost(initial: ManagedKimiConfigShape): RefreshProviderHost {
  let persisted = structuredClone(initial) as ManagedKimiConfigShape;
  return {
    getConfig: async () => structuredClone(persisted),
    removeProvider: async (providerId: string) => {
      const providers = { ...persisted.providers };
      delete providers[providerId];
      const models = { ...persisted.models };
      for (const [alias, model] of Object.entries(models)) {
        if ((model as { provider?: string }).provider === providerId) delete models[alias];
      }
      persisted = { ...persisted, providers, models };
      return structuredClone(persisted);
    },
    setConfig: async (patch: ManagedKimiConfigShape) => {
      persisted = { ...persisted, ...patch };
      return structuredClone(persisted);
    },
    resolveOAuthToken: async (_name: string, _ref?: ManagedKimiOAuthRef) => 'token',
  };
}

function fetchInputUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

describe('fetchOpenAIProviderModels', () => {
  it('normalizes an OpenAI /models payload into model infos', async () => {
    const fetchMock = vi.fn<FetchMock>(async () =>
      new Response(
        JSON.stringify({ data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini', object: 'model' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const models = await fetchOpenAIProviderModels('https://api.example.test/v1', 'sk-test', {});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(fetchInputUrl(url)).toBe('https://api.example.test/v1/models');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer sk-test');
    expect(models.map((m) => m.id)).toEqual(['gpt-4o', 'gpt-4o-mini']);
    expect(models[0]?.contextLength).toBeGreaterThan(0);
  });

  it('throws on a non-OK response', async () => {
    const fetchMock = vi.fn<FetchMock>(async () =>
      new Response('boom', { status: 500 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchOpenAIProviderModels('https://api.example.test/v1', 'sk-test', {}),
    ).rejects.toThrow(/HTTP 500/);
  });

  it('throws on a malformed payload', async () => {
    const fetchMock = vi.fn<FetchMock>(async () =>
      new Response(JSON.stringify({ not: 'data' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchOpenAIProviderModels('https://api.example.test/v1', 'sk-test', {}),
    ).rejects.toThrow(/expected \{ data/);
  });

  it('passes a custom fetch impl through options', async () => {
    const fetchMock = vi.fn<FetchMock>(async () =>
      new Response(JSON.stringify({ data: [{ id: 'm1' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const options: FetchOpenAIProviderModelsOptions = { fetchImpl: fetchMock };
    const models = await fetchOpenAIProviderModels('https://api.example.test/v1', 'sk-test', options);
    expect(models.map((m) => m.id)).toEqual(['m1']);
  });

  it('uses the provider-supplied context_length when present', async () => {
    const fetchMock = vi.fn<FetchMock>(async () =>
      new Response(
        JSON.stringify({ data: [{ id: 'minimax/minimax-m3:free', context_length: 1048576 }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const models = await fetchOpenAIProviderModels('https://api.example.test/v1', 'sk-test', {});

    expect(models).toHaveLength(1);
    expect(models[0]?.id).toBe('minimax/minimax-m3:free');
    expect(models[0]?.contextLength).toBe(1048576);
  });

  it('falls back to the default when context_length is absent', async () => {
    const fetchMock = vi.fn<FetchMock>(async () =>
      new Response(
        JSON.stringify({ data: [{ id: 'm1' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const models = await fetchOpenAIProviderModels('https://api.example.test/v1', 'sk-test', {});

    expect(models[0]?.contextLength).toBe(262144);
  });

  it('prefers context_length over context_window', async () => {
    const fetchMock = vi.fn<FetchMock>(async () =>
      new Response(
        JSON.stringify({ data: [{ id: 'm1', context_window: 200000, context_length: 1048576 }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const models = await fetchOpenAIProviderModels('https://api.example.test/v1', 'sk-test', {});

    expect(models[0]?.contextLength).toBe(1048576);
  });

  it('falls back to the default for non-positive context lengths', async () => {
    const fetchMock = vi.fn<FetchMock>(async () =>
      new Response(
        JSON.stringify({ data: [{ id: 'm1', context_length: 0 }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const models = await fetchOpenAIProviderModels('https://api.example.test/v1', 'sk-test', {});

    expect(models[0]?.contextLength).toBe(262144);
  });

  it('derives reportedMaxOutputSize from a completion cap, ignoring a context echo', async () => {
    const fetchMock = vi.fn<FetchMock>(async () =>
      new Response(
        JSON.stringify({
          data: [
            { id: 'cap-ok', context_length: 200000, max_tokens: 8192 },
            { id: 'cap-echo', context_length: 1000000, max_tokens: 1000000 },
            {
              id: 'cap-openrouter',
              context_length: 200000,
              top_provider: { max_completion_tokens: 16384 },
            },
            { id: 'cap-no-ctx', max_tokens: 4096 },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const models = await fetchOpenAIProviderModels('https://api.example.test/v1', 'sk-test', {});
    const byId = new Map(models.map((m) => [m.id, m]));

    expect(byId.get('cap-ok')?.reportedMaxOutputSize).toBe(8192);
    expect(byId.get('cap-echo')?.reportedMaxOutputSize).toBeUndefined();
    expect(byId.get('cap-openrouter')?.reportedMaxOutputSize).toBe(16384);
    expect(byId.get('cap-no-ctx')?.reportedMaxOutputSize).toBe(4096);
  });
});

describe('refreshProviderCatalog — OpenAI-compatible on-demand', () => {
  const baseUrl = 'https://opencode.ai/zen/v1';

  it('does NOT refresh openai providers during the startup refresh', async () => {
    const config: ManagedKimiConfigShape = {
      providers: {
        opencode: { type: 'openai', baseUrl, apiKey: 'sk-test-token' },
      },
      telemetry: true,
    };
    const host = makeRefreshHost(config);
    const fetchMock = vi.fn<FetchMock>(async () => new Response('[]', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await refreshProviderModels(host, { scope: 'all' });

    expect(fetchMock).toHaveBeenCalledTimes(0);
    expect(result.changed).toEqual([]);
    expect(result.unchanged).toEqual([]);
    expect(result.failed).toEqual([]);
  });

  it('refreshes a plain openai provider from its /models endpoint', async () => {
    const config: ManagedKimiConfigShape = {
      providers: {
        opencode: {
          type: 'openai',
          baseUrl,
          apiKey: 'sk-test-token',
        },
      },
      models: {
        'opencode/old-model': {
          provider: 'opencode',
          model: 'old-model',
          maxContextSize: 131072,
          capabilities: ['tool_use'],
          displayName: 'Old',
        },
      },
      telemetry: true,
    };
    const host = makeRefreshHost(config);
    const fetchMock = vi.fn<FetchMock>(async (input, init) => {
      expect(fetchInputUrl(input)).toBe(`${baseUrl}/models`);
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer sk-test-token');
      return new Response(
        JSON.stringify({ data: [{ id: 'new-model' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await refreshProviderCatalog(host, {});

    expect(result.failed).toEqual([]);
    expect(result.unchanged).toEqual([]);
    expect(result.changed).toEqual([
      { providerId: 'opencode', providerName: 'opencode', added: 1, removed: 1 },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const models = (await host.getConfig()).models ?? {};
    expect(models['opencode/old-model']).toBeUndefined();
    expect(models['opencode/new-model']).toBeDefined();
  });

  it('preserves a curated maxContextSize when the endpoint omits context_length', async () => {
    const config: ManagedKimiConfigShape = {
      providers: {
        'zai-coding-plan': {
          type: 'openai',
          baseUrl: 'https://api.z.ai/api/v1',
          apiKey: 'sk-zai',
        },
      },
      models: {
        'zai-coding-plan/glm-5.3': {
          provider: 'zai-coding-plan',
          model: 'glm-5.3',
          maxContextSize: 1000000,
          capabilities: ['tool_use'],
        },
      },
      telemetry: true,
    };
    const host = makeRefreshHost(config);
    const fetchMock = vi.fn<FetchMock>(async () =>
      new Response(
        JSON.stringify({ data: [{ id: 'glm-5.3' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await refreshProviderCatalog(host, {});

    expect(result.failed).toEqual([]);
    const alias = (await host.getConfig()).models?.['zai-coding-plan/glm-5.3'];
    expect(alias?.maxContextSize).toBe(1000000);
  });

  it('uses the models.dev catalog context when the /models endpoint omits context_length (opencode-style)', async () => {
    const config: ManagedKimiConfigShape = {
      providers: {
        opencode: {
          type: 'openai',
          baseUrl: 'https://opencode.ai/zen/v1',
          apiKey: 'sk-oc-test',
        },
      },
      telemetry: true,
    };
    const host = makeRefreshHost(config);

    const catalog = {
      opencode: {
        models: {
          'nemotron-3-ultra-free': {
            id: 'nemotron-3-ultra-free',
            name: 'Nemotron 3 Ultra Free',
            limit: { context: 1000000 },
            tool_call: true,
            modalities: { input: ['text', 'image'], output: ['text'] },
          },
        },
      },
    };
    const catalogFetch = vi.fn<FetchMock>(async () =>
      new Response(JSON.stringify(catalog), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', catalogFetch);
    const { refreshModelsDevCatalog } = await import('../src/modelsDevCatalog');
    await refreshModelsDevCatalog();

    const endpointFetch = vi.fn<FetchMock>(async () =>
      new Response(
        JSON.stringify({ data: [{ id: 'nemotron-3-ultra-free' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', endpointFetch);

    const result = await refreshProviderCatalog(host, {});
    expect(result.failed).toEqual([]);
    const alias = (await host.getConfig()).models?.['opencode/nemotron-3-ultra-free'];
    expect(alias?.maxContextSize).toBe(1000000);
    expect(alias?.displayName).toBe('Nemotron 3 Ultra Free');
    expect(alias?.capabilities).toEqual(expect.arrayContaining(['tool_use', 'image_in']));
  });

  it('preserves curated reasoningKey and supportEfforts when the endpoint reports no reasoning metadata', async () => {
    const config: ManagedKimiConfigShape = {
      providers: {
        zstart: { type: 'openai', baseUrl: 'http://127.0.0.1:8790/v1', apiKey: 'zstart-local' },
      },
      models: {
        'zstart/glm-5.3': {
          provider: 'zstart',
          model: 'glm-5.3',
          maxContextSize: 1000000,
          capabilities: ['thinking', 'tool_use'],
          displayName: 'GLM-5.3',
          reasoningKey: 'reasoning_content',
          supportEfforts: ['low', 'high', 'max'],
        },
      },
      telemetry: true,
    };
    const host = makeRefreshHost(config);
    const fetchMock = vi.fn<FetchMock>(async () =>
      new Response(
        JSON.stringify({
          data: [{ id: 'glm-5.3', context_length: 1000000 }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await refreshProviderCatalog(host, {});

    expect(result.failed).toEqual([]);
    const alias = (await host.getConfig()).models?.['zstart/glm-5.3'];
    expect(alias?.['reasoningKey']).toBe('reasoning_content');
    expect(alias?.supportEfforts).toEqual(['low', 'high', 'max']);
  });

  it('lets the models.dev catalog override a curated reasoningKey', async () => {
    const config: ManagedKimiConfigShape = {
      providers: {
        zai: { type: 'openai', baseUrl: 'https://api.z.ai/api/v1', apiKey: 'sk-zai' },
      },
      models: {
        'zai/glm-5.3': {
          provider: 'zai',
          model: 'glm-5.3',
          maxContextSize: 1000000,
          capabilities: ['thinking', 'tool_use'],
          reasoningKey: 'stale_key',
        },
      },
      telemetry: true,
    };
    const host = makeRefreshHost(config);

    const catalogFetch = vi.fn<FetchMock>(async () =>
      new Response(
        JSON.stringify({
          zai: {
            models: {
              'glm-5.3': {
                id: 'glm-5.3',
                name: 'GLM-5.3',
                limit: { context: 1000000 },
                tool_call: true,
                reasoning: true,
                interleaved: { field: 'reasoning_content' },
                modalities: { input: ['text'], output: ['text'] },
              },
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', catalogFetch);
    const { refreshModelsDevCatalog } = await import('../src/modelsDevCatalog');
    await refreshModelsDevCatalog();

    const endpointFetch = vi.fn<FetchMock>(async () =>
      new Response(JSON.stringify({ data: [{ id: 'glm-5.3' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', endpointFetch);

    const result = await refreshProviderCatalog(host, {});

    expect(result.failed).toEqual([]);
    const alias = (await host.getConfig()).models?.['zai/glm-5.3'];
    expect(alias?.['reasoningKey']).toBe('reasoning_content');
  });

  it('overrides a stale user-curated maxContextSize with the catalog context (opencode-style endpoint)', async () => {
    const config: ManagedKimiConfigShape = {
      providers: {
        opencode: {
          type: 'openai',
          baseUrl: 'https://opencode.ai/zen/v1',
          apiKey: 'sk-oc-test',
        },
      },
      models: {
        'opencode/nemotron-3-ultra-free': {
          provider: 'opencode',
          model: 'nemotron-3-ultra-free',
          maxContextSize: 500000,
          capabilities: ['tool_use'],
        },
      },
      telemetry: true,
    };
    const host = makeRefreshHost(config);

    const catalog = {
      opencode: {
        models: {
          'nemotron-3-ultra-free': {
            id: 'nemotron-3-ultra-free',
            name: 'Nemotron 3 Ultra Free',
            limit: { context: 1000000 },
            tool_call: true,
            modalities: { input: ['text'], output: ['text'] },
          },
        },
      },
    };
    const catalogFetch = vi.fn<FetchMock>(async () =>
      new Response(JSON.stringify(catalog), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', catalogFetch);
    const { refreshModelsDevCatalog } = await import('../src/modelsDevCatalog');
    await refreshModelsDevCatalog();

    const endpointFetch = vi.fn<FetchMock>(async () =>
      new Response(
        JSON.stringify({ data: [{ id: 'nemotron-3-ultra-free' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', endpointFetch);

    const result = await refreshProviderCatalog(host, {});
    expect(result.failed).toEqual([]);
    const alias = (await host.getConfig()).models?.['opencode/nemotron-3-ultra-free'];
    expect(alias?.maxContextSize).toBe(1000000);
  });

  it('still uses the catalog context for a deprecated/alpha opencode model', async () => {
    const config: ManagedKimiConfigShape = {
      providers: {
        opencode: {
          type: 'openai',
          baseUrl: 'https://opencode.ai/zen/v1',
          apiKey: 'sk-oc-test',
        },
      },
      telemetry: true,
    };
    const host = makeRefreshHost(config);

    const catalog = {
      opencode: {
        models: {
          'nemotron-3-ultra-free': {
            id: 'nemotron-3-ultra-free',
            name: 'Nemotron 3 Ultra Free',
            limit: { context: 1000000 },
            tool_call: true,
            status: 'deprecated',
            modalities: { input: ['text'], output: ['text'] },
          },
        },
      },
    };
    const catalogFetch = vi.fn<FetchMock>(async () =>
      new Response(JSON.stringify(catalog), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', catalogFetch);
    const { refreshModelsDevCatalog } = await import('../src/modelsDevCatalog');
    await refreshModelsDevCatalog();

    const endpointFetch = vi.fn<FetchMock>(async () =>
      new Response(
        JSON.stringify({ data: [{ id: 'nemotron-3-ultra-free' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', endpointFetch);

    const result = await refreshProviderCatalog(host, {});
    expect(result.failed).toEqual([]);
    const alias = (await host.getConfig()).models?.['opencode/nemotron-3-ultra-free'];
    expect(alias?.maxContextSize).toBe(1000000);
    expect(alias?.capabilities).toBeUndefined();
  });

  it('retracts a curated capabilities set when the catalog marks the model deprecated/alpha', async () => {
    const config: ManagedKimiConfigShape = {
      providers: {
        opencode: {
          type: 'openai',
          baseUrl: 'https://opencode.ai/zen/v1',
          apiKey: 'sk-oc-test',
        },
      },
      models: {
        'opencode/nemotron-3-ultra-free': {
          provider: 'opencode',
          model: 'nemotron-3-ultra-free',
          maxContextSize: 1000000,
          capabilities: ['image_in', 'thinking', 'tool_use'],
        },
      },
      telemetry: true,
    };
    const host = makeRefreshHost(config);

    const catalog = {
      opencode: {
        models: {
          'nemotron-3-ultra-free': {
            id: 'nemotron-3-ultra-free',
            name: 'Nemotron 3 Ultra Free',
            limit: { context: 1000000 },
            tool_call: true,
            status: 'deprecated',
            modalities: { input: ['text'], output: ['text'] },
          },
        },
      },
    };
    const catalogFetch = vi.fn<FetchMock>(async () =>
      new Response(JSON.stringify(catalog), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', catalogFetch);
    const { refreshModelsDevCatalog } = await import('../src/modelsDevCatalog');
    await refreshModelsDevCatalog();

    const endpointFetch = vi.fn<FetchMock>(async () =>
      new Response(
        JSON.stringify({ data: [{ id: 'nemotron-3-ultra-free' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', endpointFetch);

    const result = await refreshProviderCatalog(host, {});
    expect(result.failed).toEqual([]);
    const alias = (await host.getConfig()).models?.['opencode/nemotron-3-ultra-free'];
    expect(alias?.maxContextSize).toBe(1000000);
    expect(alias?.capabilities).toBeUndefined();
  });


  it('carries an OpenRouter context_length through and never clobbers it', async () => {
    const config: ManagedKimiConfigShape = {
      providers: {
        openrouter: {
          type: 'openai',
          baseUrl: 'https://openrouter.ai/api/v1',
          apiKey: 'sk-or-test',
        },
      },
      telemetry: true,
    };
    const host = makeRefreshHost(config);
    const fetchMock = vi.fn<FetchMock>(async (input, init) => {
      expect(fetchInputUrl(input)).toBe('https://openrouter.ai/api/v1/models');
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer sk-or-test');
      return new Response(
        JSON.stringify({
          data: [{ id: 'minimax/minimax-m3:free', context_length: 1048576 }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await refreshProviderCatalog(host, {});

    expect(result.failed).toEqual([]);
    expect(result.changed).toEqual([
      { providerId: 'openrouter', providerName: 'openrouter', added: 1, removed: 0 },
    ]);
    const models = Object.values((await host.getConfig()).models ?? {});
    const carried = models.find((m) => m.maxContextSize === 1048576);
    expect(carried).toBeDefined();
    expect(carried?.provider).toBe('openrouter');
    expect(carried?.model).toBe('minimax/minimax-m3:free');
  });

  it('enriches display name + capabilities from models.dev, provider name wins', async () => {
    const config: ManagedKimiConfigShape = {
      providers: {
        openrouter: {
          type: 'openai',
          baseUrl: 'https://openrouter.ai/api/v1',
          apiKey: 'sk-or-test',
        },
      },
      telemetry: true,
    };
    const host = makeRefreshHost(config);

    const catalog = {
      openrouter: {
        models: {
          'minimax/minimax-m3': {
            id: 'minimax/minimax-m3',
            name: 'MiniMax M3',
            limit: { context: 1048576 },
            tool_call: true,
            reasoning: true,
            modalities: { input: ['text', 'image'], output: ['text'] },
          },
        },
      },
    };
    const catalogFetch = vi.fn<FetchMock>(async () =>
      new Response(JSON.stringify(catalog), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', catalogFetch);
    const { refreshModelsDevCatalog } = await import('../src/modelsDevCatalog');
    await refreshModelsDevCatalog();

    const endpointFetch = vi.fn<FetchMock>(async () =>
      new Response(
        JSON.stringify({
          data: [{ id: 'minimax/minimax-m3:free', name: 'MiniMax M3 (free)' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', endpointFetch);

    const result = await refreshProviderCatalog(host, {});
    expect(result.failed).toEqual([]);
    const alias = (await host.getConfig()).models?.['openrouter/minimax/minimax-m3:free'];
    expect(alias?.displayName).toBe('MiniMax M3 (free)');
    expect(alias?.capabilities).toEqual(expect.arrayContaining(['tool_use', 'thinking', 'image_in']));
  });

  it('reports a failed fetch in the failed list instead of skipping silently', async () => {
    const config: ManagedKimiConfigShape = {
      providers: {
        kilo: {
          type: 'openai',
          baseUrl: 'https://api.kilo.ai/api/gateway',
          apiKey: 'kilo-token',
        },
      },
      telemetry: true,
    };
    const host = makeRefreshHost(config);
    const fetchMock = vi.fn<FetchMock>(async () => new Response('nope', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await refreshProviderCatalog(host, {});

    expect(result.changed).toEqual([]);
    expect(result.unchanged).toEqual([]);
    expect(result.failed).toEqual([
      { provider: 'kilo', reason: expect.stringContaining('HTTP 500') },
    ]);
  });

  it('scoped refresh only touches the targeted openai provider', async () => {
    const config: ManagedKimiConfigShape = {
      providers: {
        opencode: { type: 'openai', baseUrl: 'https://opencode.ai/zen/v1', apiKey: 'sk-oc' },
        kilo: { type: 'openai', baseUrl: 'https://api.kilo.ai/api/gateway', apiKey: 'sk-kilo' },
      },
      telemetry: true,
    };
    const host = makeRefreshHost(config);
    let calls = 0;
    const fetchMock = vi.fn<FetchMock>(async (input) => {
      calls += 1;
      expect(fetchInputUrl(input)).toContain('opencode.ai');
      return new Response(JSON.stringify({ data: [{ id: 'm' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await refreshProviderCatalog(host, { providerId: 'opencode' });

    expect(calls).toBe(1);
    expect(result.changed.map((c) => c.providerId)).toEqual(['opencode']);
  });
});

describe('refreshProviderCatalog — free_models_only filter', () => {
  const baseUrl = 'https://openrouter.ai/api/v1';

  it('keeps a model id containing :free (case-insensitive) when free_models_only is true', async () => {
    const config: ManagedKimiConfigShape = {
      providers: {
        openrouter: { type: 'openai', baseUrl, apiKey: 'sk-or', freeModelsOnly: true },
      },
      telemetry: true,
    };
    const host = makeRefreshHost(config);
    const fetchMock = vi.fn<FetchMock>(async () =>
      new Response(
        JSON.stringify({ data: [{ id: 'anthropic/claude-3.5-sonnet:free' }, { id: 'gpt-4o' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await refreshProviderCatalog(host, {});

    expect(result.failed).toEqual([]);
    const models = (await host.getConfig()).models ?? {};
    expect(Object.keys(models)).toEqual(['openrouter/anthropic/claude-3.5-sonnet:free']);
  });

  it('drops a model id without free when free_models_only is true', async () => {
    const config: ManagedKimiConfigShape = {
      providers: {
        openrouter: { type: 'openai', baseUrl, apiKey: 'sk-or', freeModelsOnly: true },
      },
      telemetry: true,
    };
    const host = makeRefreshHost(config);
    const fetchMock = vi.fn<FetchMock>(async () =>
      new Response(
        JSON.stringify({ data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await refreshProviderCatalog(host, {});

    expect(result.changed).toEqual([]);
    expect(result.unchanged).toEqual([]);
    expect(Object.keys((await host.getConfig()).models ?? {})).toEqual([]);
  });

  it('keeps every fetched model when free_models_only is unset', async () => {
    const config: ManagedKimiConfigShape = {
      providers: {
        openrouter: { type: 'openai', baseUrl, apiKey: 'sk-or' },
      },
      telemetry: true,
    };
    const host = makeRefreshHost(config);
    const fetchMock = vi.fn<FetchMock>(async () =>
      new Response(
        JSON.stringify({ data: [{ id: 'gpt-4o' }, { id: 'anthropic/claude-3.5-sonnet:free' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await refreshProviderCatalog(host, {});

    expect(result.failed).toEqual([]);
    const ids = Object.keys((await host.getConfig()).models ?? {});
    expect(ids).toEqual([
      'openrouter/gpt-4o',
      'openrouter/anthropic/claude-3.5-sonnet:free',
    ]);
  });

  it('keeps every fetched model when free_models_only is false', async () => {
    const config: ManagedKimiConfigShape = {
      providers: {
        openrouter: { type: 'openai', baseUrl, apiKey: 'sk-or', freeModelsOnly: false },
      },
      telemetry: true,
    };
    const host = makeRefreshHost(config);
    const fetchMock = vi.fn<FetchMock>(async () =>
      new Response(
        JSON.stringify({ data: [{ id: 'gpt-4o' }, { id: 'anthropic/claude-3.5-sonnet:free' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await refreshProviderCatalog(host, {});

    expect(result.failed).toEqual([]);
    const ids = Object.keys((await host.getConfig()).models ?? {});
    expect(ids).toEqual([
      'openrouter/gpt-4o',
      'openrouter/anthropic/claude-3.5-sonnet:free',
    ]);
  });

  it('filters only the provider with the flag; a sibling without it keeps its full catalog', async () => {
    const config: ManagedKimiConfigShape = {
      providers: {
        openrouter: { type: 'openai', baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'sk-or', freeModelsOnly: true },
        kilo: { type: 'openai', baseUrl: 'https://api.kilo.ai/api/gateway', apiKey: 'sk-kilo' },
      },
      telemetry: true,
    };
    const host = makeRefreshHost(config);
    const fetchMock = vi.fn<FetchMock>(async (input) => {
      const url = fetchInputUrl(input);
      if (url.includes('openrouter.ai')) {
        return new Response(
          JSON.stringify({ data: [{ id: 'anthropic/claude-3.5-sonnet:free' }, { id: 'gpt-4o' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({ data: [{ id: 'kilo-model' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await refreshProviderCatalog(host, {});

    expect(result.failed).toEqual([]);
    const orModels = Object.keys((await host.getConfig()).models ?? {}).filter((k) => k.startsWith('openrouter/'));
    const kiloModels = Object.keys((await host.getConfig()).models ?? {}).filter((k) => k.startsWith('kilo/'));
    expect(orModels).toEqual(['openrouter/anthropic/claude-3.5-sonnet:free']);
    expect(kiloModels).toEqual(['kilo/kilo-model']);
  });

  it('scoped refresh honors free_models_only identically', async () => {
    const config: ManagedKimiConfigShape = {
      providers: {
        openrouter: { type: 'openai', baseUrl, apiKey: 'sk-or', freeModelsOnly: true },
      },
      telemetry: true,
    };
    const host = makeRefreshHost(config);
    const fetchMock = vi.fn<FetchMock>(async () =>
      new Response(
        JSON.stringify({ data: [{ id: 'anthropic/claude-3.5-sonnet:free' }, { id: 'gpt-4o' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await refreshProviderCatalog(host, { providerId: 'openrouter' });

    expect(result.failed).toEqual([]);
    const ids = Object.keys((await host.getConfig()).models ?? {});
    expect(ids).toEqual(['openrouter/anthropic/claude-3.5-sonnet:free']);
  });

  it('enriches only the retained free models (no enrichment attempted on dropped ones)', async () => {
    const config: ManagedKimiConfigShape = {
      providers: {
        openrouter: { type: 'openai', baseUrl, apiKey: 'sk-or', freeModelsOnly: true },
      },
      telemetry: true,
    };
    const host = makeRefreshHost(config);

    const catalog = {
      openrouter: {
        models: {
          'anthropic/claude-3.5-sonnet': {
            id: 'anthropic/claude-3.5-sonnet',
            name: 'Claude 3.5 Sonnet',
            limit: { context: 200000 },
            tool_call: true,
            reasoning: false,
            modalities: { input: ['text'], output: ['text'] },
          },
        },
      },
    };
    const catalogFetch = vi.fn<FetchMock>(async () =>
      new Response(JSON.stringify(catalog), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', catalogFetch);
    const { refreshModelsDevCatalog } = await import('../src/modelsDevCatalog');
    await refreshModelsDevCatalog();

    const endpointFetch = vi.fn<FetchMock>(async () =>
      new Response(
        JSON.stringify({
          data: [
            { id: 'anthropic/claude-3.5-sonnet:free' },
            { id: 'gpt-4o' },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', endpointFetch);

    const result = await refreshProviderCatalog(host, {});
    expect(result.failed).toEqual([]);

    const models = (await host.getConfig()).models ?? {};
    const retained = models['openrouter/anthropic/claude-3.5-sonnet:free'];
    expect(retained).toBeDefined();
    expect(retained?.displayName).toBe('Claude 3.5 Sonnet');
    expect(models['openrouter/gpt-4o']).toBeUndefined();
  });

  it('keeps a free model absent from models.dev (fallback to base id, else provider name/id)', async () => {
    const config: ManagedKimiConfigShape = {
      providers: {
        openrouter: { type: 'openai', baseUrl, apiKey: 'sk-or', freeModelsOnly: true },
      },
      telemetry: true,
    };
    const host = makeRefreshHost(config);
    const catalogFetch = vi.fn<FetchMock>(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', catalogFetch);
    const { refreshModelsDevCatalog } = await import('../src/modelsDevCatalog');
    await refreshModelsDevCatalog();

    const endpointFetch = vi.fn<FetchMock>(async () =>
      new Response(
        JSON.stringify({ data: [{ id: 'tencent/hy3:free', name: 'Tencent HY3 Free' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', endpointFetch);

    const result = await refreshProviderCatalog(host, {});
    expect(result.failed).toEqual([]);

    const models = (await host.getConfig()).models ?? {};
    const kept = models['openrouter/tencent/hy3:free'];
    expect(kept).toBeDefined();
    expect(kept?.displayName).toBe('Tencent HY3 Free');
  });

  it('free model with -free suffix (opencode style) is kept when flag is true', async () => {
    const config: ManagedKimiConfigShape = {
      providers: {
        opencode: { type: 'openai', baseUrl: 'https://opencode.ai/zen/v1', apiKey: 'sk-oc', freeModelsOnly: true },
      },
      telemetry: true,
    };
    const host = makeRefreshHost(config);
    const fetchMock = vi.fn<FetchMock>(async () =>
      new Response(
        JSON.stringify({ data: [{ id: 'anthropic/claude-3.5-sonnet-free' }, { id: 'gpt-4o' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await refreshProviderCatalog(host, {});
    expect(result.failed).toEqual([]);
    const ids = Object.keys((await host.getConfig()).models ?? {});
    expect(ids).toEqual(['opencode/anthropic/claude-3.5-sonnet-free']);
  });
});

describe('lookupModelsDevModel — provider/model cascade', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function warmCatalog(catalog: Record<string, unknown>): Promise<void> {
    vi.stubGlobal(
      'fetch',
      vi.fn<FetchMock>(async () =>
        new Response(JSON.stringify(catalog), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const { refreshModelsDevCatalog } = await import('../src/modelsDevCatalog');
    await refreshModelsDevCatalog();
  }

  it('prefers the requested provider over every other provider', async () => {
    await warmCatalog({
      'opencode-go': { models: { glm: { name: 'Go GLM', limit: { context: 111 } } } },
      opencode: { models: { glm: { name: 'OpenCode GLM', limit: { context: 222 } } } },
    });
    const { lookupModelsDevModel } = await import('../src/modelsDevCatalog');
    expect(lookupModelsDevModel('opencode-go', 'glm')?.context).toBe(111);
  });

  it('falls back to opencode when the requested provider does not carry the model', async () => {
    await warmCatalog({
      'opencode-go': { models: {} },
      opencode: { models: { 'glm-5-free': { name: 'GLM-5 Free', limit: { context: 204800 } } } },
    });
    const { lookupModelsDevModel } = await import('../src/modelsDevCatalog');
    const info = lookupModelsDevModel('opencode-go', 'glm-5-free');
    expect(info?.context).toBe(204800);
    expect(info?.displayName).toBe('GLM-5 Free');
  });

  it('falls back to any provider when neither the requested provider nor opencode carries it', async () => {
    await warmCatalog({
      'opencode-go': { models: {} },
      opencode: { models: {} },
      zhipuai: { models: { 'glm-5': { name: 'GLM-5', limit: { context: 204800 } } } },
    });
    const { lookupModelsDevModel } = await import('../src/modelsDevCatalog');
    expect(lookupModelsDevModel('opencode-go', 'glm-5')?.context).toBe(204800);
  });

  it('surfaces the reasoning key from the any-provider step', async () => {
    await warmCatalog({
      'opencode-go': { models: {} },
      opencode: { models: {} },
      zhipuai: {
        models: {
          'glm-5': {
            name: 'GLM-5',
            limit: { context: 204800 },
            interleaved: { field: 'reasoning_content' },
          },
        },
      },
    });
    const { lookupModelsDevModel } = await import('../src/modelsDevCatalog');
    expect(lookupModelsDevModel('opencode-go', 'glm-5')?.reasoningKey).toBe('reasoning_content');
  });

  it('drops a contested context window at the any-provider step but keeps the display name', async () => {
    await warmCatalog({
      'opencode-go': { models: {} },
      opencode: { models: {} },
      'nano-gpt': {
        models: {
          'claude-sonnet-4-20250514': { name: 'Claude 4 Sonnet', limit: { context: 200000 } },
        },
      },
      anthropic: {
        models: {
          'claude-sonnet-4-20250514': { name: 'Claude Sonnet 4', limit: { context: 500000 } },
        },
      },
    });
    const { lookupModelsDevModel } = await import('../src/modelsDevCatalog');
    const info = lookupModelsDevModel('opencode-go', 'claude-sonnet-4-20250514');
    expect(['Claude 4 Sonnet', 'Claude Sonnet 4']).toContain(info?.displayName);
    expect(info?.context).toBeUndefined();
  });

  it('keeps the context when no other provider carrying the model contradicts it', async () => {
    await warmCatalog({
      'opencode-go': { models: {} },
      opencode: { models: {} },
      'nano-gpt': { models: { 'claude-sonnet-4-20250514': { name: 'Claude 4 Sonnet' } } },
      anthropic: {
        models: {
          'claude-sonnet-4-20250514': { name: 'Claude Sonnet 4', limit: { context: 200000 } },
        },
      },
    });
    const { lookupModelsDevModel } = await import('../src/modelsDevCatalog');
    expect(lookupModelsDevModel('opencode-go', 'claude-sonnet-4-20250514')?.context).toBe(200000);
  });

  it('strips :free and -free suffixes at the fallback steps too', async () => {
    await warmCatalog({
      'opencode-go': { models: {} },
      opencode: { models: { 'glm-5': { name: 'GLM-5', limit: { context: 204800 } } } },
    });
    const { lookupModelsDevModel } = await import('../src/modelsDevCatalog');
    expect(lookupModelsDevModel('opencode-go', 'glm-5-free')?.context).toBe(204800);
    expect(lookupModelsDevModel('opencode-go', 'glm-5:free')?.context).toBe(204800);
  });

  it('returns undefined when no provider carries the model', async () => {
    await warmCatalog({
      'opencode-go': { models: {} },
      opencode: { models: {} },
    });
    const { lookupModelsDevModel } = await import('../src/modelsDevCatalog');
    expect(lookupModelsDevModel('opencode-go', 'does-not-exist')).toBeUndefined();
  });
});
