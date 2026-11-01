import { describe, expect, it } from 'vitest';

import { opencodeSessionHeaders } from '#human/llm/protocol/session-headers';

const OPENCODE_BASE_URL = 'https://opencode.ai/zen/v1';
const OPENCODE_GO_BASE_URL = 'https://opencode.ai/zen/go/v1';
const OPENCODE_USER_AGENT = 'opencode/1.17.0';
const KIMI_SESSION_ID = 'session_0923e81c-92bb-4bf0-80d8-4d0dbfdbd067';
const OPENCODE_SESSION_ID = 'ses_15e24457e565a45ada428b6a72';
const OPENCODE_SESSION_ID_WITHOUT_KEY = 'ses_15e24457e565a45ada426cb6e5';

describe('x-opencode-session header', () => {
  it('sets x-opencode-session derived from the cache key', () => {
    const headers = opencodeSessionHeaders({
      cacheKey: KIMI_SESSION_ID,
      apiKey: 'sk-probe',
      baseUrl: 'https://api.example.com/v1',
    });
    expect(headers?.['x-opencode-session']).toBe(OPENCODE_SESSION_ID);
  });

  it('derives a different session id when the api key is absent', () => {
    const headers = opencodeSessionHeaders({
      cacheKey: KIMI_SESSION_ID,
      apiKey: undefined,
      baseUrl: 'https://api.example.com/v1',
    });
    expect(headers?.['x-opencode-session']).toBe(OPENCODE_SESSION_ID_WITHOUT_KEY);
  });

  it('does not set x-opencode-session when cacheKey is absent', () => {
    const headers = opencodeSessionHeaders({
      apiKey: 'sk-probe',
      baseUrl: 'https://api.example.com/v1',
    });
    expect(headers).toBeUndefined();
  });

  it('identifies as the opencode client on opencode endpoints', () => {
    const headers = opencodeSessionHeaders({
      cacheKey: KIMI_SESSION_ID,
      apiKey: 'sk-probe',
      baseUrl: OPENCODE_BASE_URL,
    });
    expect(headers?.['User-Agent']).toBe(OPENCODE_USER_AGENT);
    expect(headers?.['x-opencode-session']).toBe(OPENCODE_SESSION_ID);
  });

  it('identifies as the opencode client on opencode subdomain endpoints', () => {
    const headers = opencodeSessionHeaders({
      cacheKey: KIMI_SESSION_ID,
      apiKey: 'sk-probe',
      baseUrl: OPENCODE_GO_BASE_URL,
    });
    expect(headers?.['User-Agent']).toBe(OPENCODE_USER_AGENT);
  });

  it('does not identify as the opencode client on other endpoints', () => {
    const headers = opencodeSessionHeaders({
      cacheKey: KIMI_SESSION_ID,
      apiKey: 'sk-probe',
      baseUrl: 'https://api.example.com/v1',
    });
    expect(headers?.['User-Agent']).toBeUndefined();
  });
});
