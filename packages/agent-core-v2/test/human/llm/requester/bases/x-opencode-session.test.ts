import { describe, expect, it } from 'vitest';

import type { LlmModel } from '#human/llm/model';

import { planOpenAIRequest } from '#human/llm/requester/bases/openai/requester';
import { planOpenAIResponsesRequest } from '#human/llm/requester/bases/openai-responses/requester';
import { planAnthropicRequest } from '#human/llm/requester/bases/anthropic/requester';

const OPENCODE_BASE_URL = 'https://opencode.ai/zen/v1';
const OPENCODE_GO_BASE_URL = 'https://opencode.ai/zen/go/v1';
const OPENCODE_USER_AGENT = 'opencode/1.17.0';
const KIMI_SESSION_ID = 'session_0923e81c-92bb-4bf0-80d8-4d0dbfdbd067';
const OPENCODE_SESSION_ID = 'ses_0923e81c92bb4bf080d88b6a72';
const OPENCODE_SESSION_ID_WITHOUT_KEY = 'ses_0923e81c92bb4bf080d84d0dbf';

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
  return planOpenAIRequest({
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
      const request = planOpenAIRequest({
        model,
        messages: [],
        tools: [],
        cacheKey: KIMI_SESSION_ID,
      });
      expect(request.headers?.['x-opencode-session']).toBe(OPENCODE_SESSION_ID);
    });

    it('does not set x-opencode-session when cacheKey is absent', () => {
      const model = makeModel();
      const request = planOpenAIRequest({
        model,
        messages: [],
        tools: [],
      });
      expect(request.headers?.['x-opencode-session']).toBeUndefined();
    });

    it('identifies as the opencode client on opencode endpoints', () => {
      const model = makeModel('opencode', OPENCODE_BASE_URL);
      const request = planOpenAIRequest({
        model,
        messages: [],
        tools: [],
        cacheKey: KIMI_SESSION_ID,
      });
      expect(request.headers?.['User-Agent']).toBe(OPENCODE_USER_AGENT);
    });

    it('does not identify as the opencode client on other endpoints', () => {
      const model = makeModel();
      const request = planOpenAIRequest({
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
      const request = planOpenAIResponsesRequest({
        model,
        messages: [],
        tools: [],
        cacheKey: KIMI_SESSION_ID,
      });
      expect(request.headers?.['x-opencode-session']).toBe(OPENCODE_SESSION_ID);
    });

    it('does not set x-opencode-session when cacheKey is absent', () => {
      const model = makeModel();
      const request = planOpenAIResponsesRequest({
        model,
        messages: [],
        tools: [],
      });
      expect(request.headers?.['x-opencode-session']).toBeUndefined();
    });

    it('identifies as the opencode client on opencode endpoints', () => {
      const model = makeModel('opencode', OPENCODE_GO_BASE_URL);
      const request = planOpenAIResponsesRequest({
        model,
        messages: [],
        tools: [],
        cacheKey: KIMI_SESSION_ID,
      });
      expect(request.headers?.['User-Agent']).toBe(OPENCODE_USER_AGENT);
    });

    it('does not identify as the opencode client on other endpoints', () => {
      const model = makeModel();
      const request = planOpenAIResponsesRequest({
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
      const request = planAnthropicRequest({
        model,
        messages: [],
        tools: [],
        cacheKey: KIMI_SESSION_ID,
      });
      expect(request.headers?.['x-opencode-session']).toBe(OPENCODE_SESSION_ID);
    });

    it('does not set x-opencode-session when cacheKey is absent', () => {
      const model = makeModel('anthropic');
      const request = planAnthropicRequest({
        model,
        messages: [],
        tools: [],
      });
      expect(request.headers?.['x-opencode-session']).toBeUndefined();
    });

    it('identifies as the opencode client on opencode endpoints', () => {
      const model = makeModel('opencode', OPENCODE_BASE_URL);
      const request = planAnthropicRequest({
        model,
        messages: [],
        tools: [],
        cacheKey: KIMI_SESSION_ID,
      });
      expect(request.headers?.['User-Agent']).toBe(OPENCODE_USER_AGENT);
    });

    it('does not identify as the opencode client on other endpoints', () => {
      const model = makeModel('anthropic');
      const request = planAnthropicRequest({
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
  it('strips the session prefix and dashes and truncates the session part', () => {
    expect(sessionHeaderFor(KIMI_SESSION_ID)).toBe(OPENCODE_SESSION_ID);
    expect(sessionHeaderFor(KIMI_SESSION_ID)?.replace('ses_', '')).toHaveLength(26);
  });

  it('lowercases and drops characters outside the hex alphabet', () => {
    expect(sessionHeaderFor('session_AB12CD34-ef56-4789-9012-3456789ABCDE')).toBe(
      'ses_ab12cd34ef56478990128b6a72',
    );
  });

  it('pads short cache keys', () => {
    expect(sessionHeaderFor('probe')).toBe('ses_be0000000000000000008b6a72');
  });

  it('accepts keys already carrying the ses prefix', () => {
    expect(sessionHeaderFor('ses_abc')).toBe('ses_abc000000000000000008b6a72');
  });

  it('keeps the same session id across calls for one cache key', () => {
    expect(sessionHeaderFor(KIMI_SESSION_ID)).toBe(sessionHeaderFor(KIMI_SESSION_ID));
  });

  it('changes the session id when the api key changes', () => {
    expect(sessionHeaderFor(KIMI_SESSION_ID, 'sk-other')).toBe('ses_0923e81c92bb4bf080d83dcad3');
    expect(sessionHeaderFor(KIMI_SESSION_ID, 'sk-other')).not.toBe(OPENCODE_SESSION_ID);
  });

  it('omits the key fingerprint when the model carries no api key', () => {
    const model: LlmModel = { ...makeModel(), apiKey: undefined };
    const request = planOpenAIRequest({
      model,
      messages: [],
      tools: [],
      cacheKey: KIMI_SESSION_ID,
    });
    expect(request.headers?.['x-opencode-session']).toBe(OPENCODE_SESSION_ID_WITHOUT_KEY);
  });

  it('ignores an unparseable base url', () => {
    const request = planOpenAIRequest({
      model: makeModel('opencode', 'not a url'),
      messages: [],
      tools: [],
      cacheKey: KIMI_SESSION_ID,
    });
    expect(request.headers?.['x-opencode-session']).toBe(OPENCODE_SESSION_ID);
    expect(request.headers?.['User-Agent']).toBeUndefined();
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
