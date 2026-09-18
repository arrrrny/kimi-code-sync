import { describe, expect, it } from 'vitest';

import {
  declaredProviderCredential,
  reconcileProviderCredentialUpdate,
} from '../src/provider-credential';

describe('declaredProviderCredential', () => {
  it('returns inline for an apiKey-only provider', () => {
    expect(declaredProviderCredential({ apiKey: 'sk-a' }, 'acme')).toEqual({
      kind: 'inline',
      apiKey: 'sk-a',
    });
  });

  it('returns env for an apiKeyEnv-only provider', () => {
    expect(declaredProviderCredential({ apiKeyEnv: 'ACME_KEY' }, 'acme')).toEqual({
      kind: 'env',
      apiKeyEnv: 'ACME_KEY',
    });
  });

  it('returns none when no credential is declared', () => {
    expect(declaredProviderCredential({}, 'acme')).toEqual({ kind: 'none' });
  });

  it('treats blank credential fields as absent', () => {
    expect(declaredProviderCredential({ apiKey: '  ', apiKeyEnv: 'ACME_KEY' }, 'acme')).toEqual({
      kind: 'env',
      apiKeyEnv: 'ACME_KEY',
    });
    expect(declaredProviderCredential({ apiKey: '', apiKeyEnv: ' ' }, 'acme')).toEqual({
      kind: 'none',
    });
  });

  it('resolves the active named key as the inline credential', () => {
    expect(
      declaredProviderCredential(
        {
          apiKeys: { k1: { key: 'sk-first' }, k2: { key: 'sk-second' } },
          activeApiKeyId: 'k2',
          apiKey: 'sk-legacy',
        },
        'acme',
      ),
    ).toEqual({ kind: 'inline', apiKey: 'sk-second' });
  });

  it('falls back to apiKey when the active named key is missing or blank', () => {
    expect(
      declaredProviderCredential(
        { apiKeys: { k1: { key: 'sk-first' } }, activeApiKeyId: 'ghost', apiKey: 'sk-legacy' },
        'acme',
      ),
    ).toEqual({ kind: 'inline', apiKey: 'sk-legacy' });
    expect(
      declaredProviderCredential(
        { apiKeys: { k1: { key: '   ' } }, activeApiKeyId: 'k1', apiKey: 'sk-legacy' },
        'acme',
      ),
    ).toEqual({ kind: 'inline', apiKey: 'sk-legacy' });
  });

  it('names apiKeys when a rotation provider conflicts with the declared fields', () => {
    const withEnv = declaredProviderCredential(
      { apiKeys: { k1: { key: 'sk-a' } }, activeApiKeyId: 'k1', apiKeyEnv: 'ACME_KEY' },
      'acme',
    );
    expect(withEnv.kind).toBe('conflict');
    if (withEnv.kind !== 'conflict') return;
    expect(withEnv.message).toContain('apiKeys');
    expect(withEnv.message).toContain('apiKeyEnv');

    const withOAuth = declaredProviderCredential(
      { apiKeys: { k1: { key: 'sk-a' } }, activeApiKeyId: 'k1', oauth: { storage: 'file', key: 'k' } },
      'acme',
    );
    expect(withOAuth.kind).toBe('conflict');
    if (withOAuth.kind !== 'conflict') return;
    expect(withOAuth.message).toContain('apiKeys');
    expect(withOAuth.message).toContain('oauth');
  });

  it.each([
    [{ apiKey: 'sk-a', apiKeyEnv: 'ACME_KEY' }, 'apiKey', 'apiKeyEnv'],
    [{ apiKeyEnv: 'ACME_KEY', oauth: { storage: 'file', key: 'k' } }, 'apiKeyEnv', 'oauth'],
    [{ apiKey: 'sk-a', oauth: { storage: 'file', key: 'k' } }, 'apiKey', 'oauth'],
  ])('rejects %o as a conflict naming both fields', (provider, first, second) => {
    const declared = declaredProviderCredential(provider, 'acme');
    expect(declared.kind).toBe('conflict');
    if (declared.kind !== 'conflict') return;
    expect(declared.message).toContain('acme');
    expect(declared.message).toContain(first);
    expect(declared.message).toContain(second);
  });
});

describe('reconcileProviderCredentialUpdate', () => {
  it('rejects an update submitting both fields', () => {
    const result = reconcileProviderCredentialUpdate(
      {},
      { apiKey: 'sk-a', apiKeyEnv: 'ACME_KEY' },
      'acme',
    );
    expect(result.ok).toBe(false);
  });

  it('replaces the existing credential with a submitted apiKeyEnv', () => {
    expect(
      reconcileProviderCredentialUpdate({ apiKey: 'sk-old' }, { apiKeyEnv: 'ACME_KEY' }, 'acme'),
    ).toEqual({ ok: true, apiKeyEnv: 'ACME_KEY' });
  });

  it('replaces the existing credential with a submitted apiKey', () => {
    expect(
      reconcileProviderCredentialUpdate({ apiKeyEnv: 'ACME_KEY' }, { apiKey: 'sk-a' }, 'acme'),
    ).toEqual({ ok: true, apiKey: 'sk-a' });
  });

  it('preserves the existing credential when the update omits both fields', () => {
    expect(
      reconcileProviderCredentialUpdate(
        { apiKey: 'sk-old', apiKeyEnv: 'ACME_KEY' },
        {},
        'acme',
      ),
    ).toEqual({ ok: true, apiKey: 'sk-old', apiKeyEnv: 'ACME_KEY' });
  });

  it('clears only its own field on an explicit blank value', () => {
    expect(
      reconcileProviderCredentialUpdate(
        { apiKey: 'sk-old', apiKeyEnv: 'ACME_KEY' },
        { apiKey: '  ' },
        'acme',
      ),
    ).toEqual({ ok: true, apiKey: undefined, apiKeyEnv: 'ACME_KEY' });
    expect(
      reconcileProviderCredentialUpdate(
        { apiKey: 'sk-old', apiKeyEnv: 'ACME_KEY' },
        { apiKeyEnv: '' },
        'acme',
      ),
    ).toEqual({ ok: true, apiKey: 'sk-old', apiKeyEnv: undefined });
  });
});
