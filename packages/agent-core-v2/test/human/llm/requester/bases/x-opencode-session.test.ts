import { describe, expect, it } from 'vitest';

import type { LlmModel } from '#human/llm/model';

import { prepareOpenAIRequest } from '#human/llm/requester/bases/openai/requester';
import { prepareOpenAIResponsesRequest } from '#human/llm/requester/bases/openai-responses/requester';
import { prepareAnthropicRequest } from '#human/llm/requester/bases/anthropic/requester';

const OPENCODE_BASE_URL = 'https://opencode.ai/zen/v1';
const OPENCODE_GO_BASE_URL = 'https://opencode.ai/zen/go/v1';
const OPENCODE_USER_AGENT = 'opencode/1.17.0';
const KIMI_SESSION_ID = 'session_0923e81c-92bb-4bf0-80d8-4d0dbfdbd067';
const OPENCODE_SESSION_ID = 'ses_15e24457e565a45ada428b6a72';
const OPENCODE_SESSION_ID_WITHOUT_KEY = 'ses_15e24457e565a45ada426cb6e5';

function makeModel(provider = 'openai', baseUrl = 'https://api.example.com/v1'): LlmModel {
  return {
    provider,
    model: 'probe-model',
    capability: { image_in: false, video_in: false, audio_in: false, thinking: false, tool_use: true },
    baseUrl,
    apiKey: 'sk-probe',
  };
}

function sessionHeaderFor(cacheKey: string, apiKey?: string): string | undefined {
  const model: LlmModel = apiKey === undefined ? makeModel() : { ...makeModel(), apiKey };
  return prepareOpenAIRequest({
    model,
    messages: [],
    tools: [],
    cacheKey,
  }).headers?.['x-opencode-session'];
}

describe('x-opencode-session header', () => {
  describe('openai (chat completions)', () => {
    it('sets x-opencode-session derived from the cache key', () => {
      const model = makeModel();
      const request = prepareOpenAIRequest({
        model,
        messages: [],
        tools: [],
        cacheKey: KIMI_SESSION_ID,
      });
      expect(request.headers?.['x-opencode-session']).toBe(OPENCODE_SESSION_ID);
    });

    it('does not set x-opencode-session when cacheKey is absent', () => {
      const model = makeModel();
      const request = prepareOpenAIRequest({
        model,
        messages: [],
        tools: [],
      });
      expect(request.headers?.['x-opencode-session']).toBeUndefined();
    });

    it('identifies as the opencode client on opencode endpoints', () => {
      const model = makeModel('opencode', OPENCODE_BASE_URL);
      const request = prepareOpenAIRequest({
        model,
        messages: [],
        tools: [],
        cacheKey: KIMI_SESSION_ID,
      });
      expect(request.headers?.['User-Agent']).toBe(OPENCODE_USER_AGENT);
    });

    it('does not identify as the opencode client on other endpoints', () => {
      const model = makeModel();
      const request = prepareOpenAIRequest({
        model,
        messages: [],
        tools: [],
        cacheKey: KIMI_SESSION_ID,
      });
      expect(request.headers?.['User-Agent']).toBeUndefined();
    });
  });

  describe('openai-responses', () => {
    it('sets x-opencode-session derived from the cache key', () => {
      const model = makeModel();
      const request = prepareOpenAIResponsesRequest({
        model,
        messages: [],
        tools: [],
        cacheKey: KIMI_SESSION_ID,
      });
      expect(request.headers?.['x-opencode-session']).toBe(OPENCODE_SESSION_ID);
    });

    it('does not set x-opencode-session when cacheKey is absent', () => {
      const model = makeModel();
      const request = prepareOpenAIResponsesRequest({
        model,
        messages: [],
        tools: [],
      });
      expect(request.headers?.['x-opencode-session']).toBeUndefined();
    });

    it('identifies as the opencode client on opencode endpoints', () => {
      const model = makeModel('opencode', OPENCODE_GO_BASE_URL);
      const request = prepareOpenAIResponsesRequest({
        model,
        messages: [],
        tools: [],
        cacheKey: KIMI_SESSION_ID,
      });
      expect(request.headers?.['User-Agent']).toBe(OPENCODE_USER_AGENT);
    });

    it('does not identify as the opencode client on other endpoints', () => {
      const model = makeModel();
      const request = prepareOpenAIResponsesRequest({
        model,
        messages: [],
        tools: [],
        cacheKey: KIMI_SESSION_ID,
      });
      expect(request.headers?.['User-Agent']).toBeUndefined();
    });
  });

  describe('anthropic', () => {
    it('sets x-opencode-session derived from the cache key', () => {
      const model = makeModel('anthropic');
      const request = prepareAnthropicRequest({
        model,
        messages: [],
        tools: [],
        cacheKey: KIMI_SESSION_ID,
      });
      expect(request.headers?.['x-opencode-session']).toBe(OPENCODE_SESSION_ID);
    });

    it('does not set x-opencode-session when cacheKey is absent', () => {
      const model = makeModel('anthropic');
      const request = prepareAnthropicRequest({
        model,
        messages: [],
        tools: [],
      });
      expect(request.headers?.['x-opencode-session']).toBeUndefined();
    });

    it('identifies as the opencode client on opencode endpoints', () => {
      const model = makeModel('opencode', OPENCODE_BASE_URL);
      const request = prepareAnthropicRequest({
        model,
        messages: [],
        tools: [],
        cacheKey: KIMI_SESSION_ID,
      });
      expect(request.headers?.['User-Agent']).toBe(OPENCODE_USER_AGENT);
    });

    it('does not identify as the opencode client on other endpoints', () => {
      const model = makeModel('anthropic');
      const request = prepareAnthropicRequest({
        model,
        messages: [],
        tools: [],
        cacheKey: KIMI_SESSION_ID,
      });
      expect(request.headers?.['User-Agent']).toBeUndefined();
    });
  });
});

describe('opencode session id derivation', () => {
  function sessionHeaderWithoutKey(cacheKey: string): string | undefined {
    const model: LlmModel = { ...makeModel(), apiKey: undefined };
    return prepareOpenAIRequest({
      model,
      messages: [],
      tools: [],
      cacheKey,
    }).headers?.['x-opencode-session'];
  }

  it('derives a 26 character hex id behind the ses prefix', () => {
    expect(sessionHeaderFor(KIMI_SESSION_ID)).toBe(OPENCODE_SESSION_ID);
    expect(sessionHeaderFor(KIMI_SESSION_ID)?.replace('ses_', '')).toMatch(/^[0-9a-f]{26}$/);
  });

  it('never derives the all-zero session id the gateway rejects', () => {
    const rejected = 'ses_000000000000000000000000';
    for (const cacheKey of [
      '',
      'zzz',
      'session_xyz',
      'ses_',
      '00000000-0000-0000-0000-000000000000',
    ]) {
      expect(sessionHeaderFor(cacheKey)).not.toBe(rejected);
      expect(sessionHeaderWithoutKey(cacheKey)).not.toBe(rejected);
    }
    expect(sessionHeaderWithoutKey('ses_')).toBe('ses_3730f19d70e463f876eb1e78c7');
  });

  it('keeps the same session id across calls for one cache key', () => {
    expect(sessionHeaderFor(KIMI_SESSION_ID)).toBe(sessionHeaderFor(KIMI_SESSION_ID));
  });

  it('changes the session id when the api key changes', () => {
    expect(sessionHeaderFor(KIMI_SESSION_ID, 'sk-other')).toBe('ses_15e24457e565a45ada423dcad3');
    expect(sessionHeaderFor(KIMI_SESSION_ID, 'sk-other')).not.toBe(OPENCODE_SESSION_ID);
  });

  it('omits the key fingerprint when the model carries no api key', () => {
    expect(sessionHeaderWithoutKey(KIMI_SESSION_ID)).toBe(OPENCODE_SESSION_ID_WITHOUT_KEY);
  });

  it('ignores an unparseable base url', () => {
    const request = prepareOpenAIRequest({
      model: makeModel('opencode', 'not a url'),
      messages: [],
      tools: [],
      cacheKey: KIMI_SESSION_ID,
    });
    expect(request.headers?.['x-opencode-session']).toBe(OPENCODE_SESSION_ID);
    expect(request.headers?.['User-Agent']).toBeUndefined();
  });
});

describe('opencode user agent host matching', () => {
  function userAgentFor(baseUrl: string): string | undefined {
    return prepareOpenAIRequest({
      model: makeModel('opencode', baseUrl),
      messages: [],
      tools: [],
      cacheKey: KIMI_SESSION_ID,
    }).headers?.['User-Agent'];
  }

  it.each(['https://api.opencode.ai/v1', 'https://opencode.ai:8443/v1', 'https://OPENCODE.AI/v1'])(
    'sends the opencode user agent to %s',
    (baseUrl) => {
      expect(userAgentFor(baseUrl)).toBe(OPENCODE_USER_AGENT);
    },
  );

  it.each([
    'https://evil-opencode.ai/v1',
    'https://opencode.ai.evil.com/v1',
    'https://notopencode.ai/v1',
    'https://proxy.example.com/opencode.ai/v1',
  ])('withholds the opencode user agent from %s', (baseUrl) => {
    expect(userAgentFor(baseUrl)).toBeUndefined();
  });
});

describe('proxyUrl plumbing', () => {
  it('exposes proxyUrl on LlmConnection', () => {
    const proxyUrl = 'http://proxy.example.test:3128';
    const model: LlmModel = {
      ...makeModel(),
      proxyUrl,
    };
    expect(model.proxyUrl).toBe(proxyUrl);
  });
});
