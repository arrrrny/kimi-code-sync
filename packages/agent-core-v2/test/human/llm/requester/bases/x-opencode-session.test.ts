import { describe, expect, it } from 'vitest';

import type { LlmModel } from '#human/llm/model';

import { openAIFormat } from '#human/llm/requester/bases/openai/format';
import { openAIResponsesFormat } from '#human/llm/requester/bases/openai-responses/format';
import { createAnthropicFormat } from '#human/llm/requester/bases/anthropic/format';

function makeModel(provider = 'openai', baseUrl = 'https://api.example.com/v1'): LlmModel {
  return {
    provider,
    model: 'probe-model',
    capability: { image_in: false, video_in: false, audio_in: false, thinking: false, tool_use: true },
    baseUrl,
    apiKey: 'sk-probe',
  };
}

describe('x-opencode-session header', () => {
  describe('openai (chat completions)', () => {
    it('sets x-opencode-session when cacheKey is provided', () => {
      const model = makeModel();
      const request = openAIFormat.formatRequest({
        model,
        messages: [],
        tools: [],
        trait: undefined,
        ctx: { model },
        cacheKey: 'session-probe',
      });
      expect(request.headers?.['x-opencode-session']).toBe('session-probe');
    });

    it('does not set x-opencode-session when cacheKey is absent', () => {
      const model = makeModel();
      const request = openAIFormat.formatRequest({
        model,
        messages: [],
        tools: [],
        trait: undefined,
        ctx: { model },
      });
      expect(request.headers?.['x-opencode-session']).toBeUndefined();
    });
  });

  describe('openai-responses', () => {
    it('sets x-opencode-session when cacheKey is provided', () => {
      const model = makeModel();
      const request = openAIResponsesFormat.formatRequest({
        model,
        messages: [],
        tools: [],
        trait: undefined,
        ctx: { model },
        cacheKey: 'session-probe',
      });
      expect(request.headers?.['x-opencode-session']).toBe('session-probe');
    });

    it('does not set x-opencode-session when cacheKey is absent', () => {
      const model = makeModel();
      const request = openAIResponsesFormat.formatRequest({
        model,
        messages: [],
        tools: [],
        trait: undefined,
        ctx: { model },
      });
      expect(request.headers?.['x-opencode-session']).toBeUndefined();
    });
  });

  describe('anthropic', () => {
    it('sets x-opencode-session when cacheKey is provided', () => {
      const model = makeModel('anthropic');
      const format = createAnthropicFormat();
      const request = format.formatRequest({
        model,
        messages: [],
        tools: [],
        trait: undefined,
        ctx: { model },
        cacheKey: 'session-probe',
      });
      expect(request.headers?.['x-opencode-session']).toBe('session-probe');
    });

    it('does not set x-opencode-session when cacheKey is absent', () => {
      const model = makeModel('anthropic');
      const format = createAnthropicFormat();
      const request = format.formatRequest({
        model,
        messages: [],
        tools: [],
        trait: undefined,
        ctx: { model },
      });
      expect(request.headers?.['x-opencode-session']).toBeUndefined();
    });
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
