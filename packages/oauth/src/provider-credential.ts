export interface ProviderCredentialView {
  readonly apiKey?: unknown;
  readonly apiKeyEnv?: unknown;
  readonly apiKeys?: unknown;
  readonly activeApiKeyId?: unknown;
  readonly oauth?: unknown;
}

export type DeclaredProviderCredential =
  | { readonly kind: 'inline'; readonly apiKey: string }
  | { readonly kind: 'env'; readonly apiKeyEnv: string }
  | { readonly kind: 'none' }
  | { readonly kind: 'conflict'; readonly message: string };

interface InlineApiKey {
  readonly key: string;
  readonly field: 'apiKey' | 'apiKeys';
}

function activeInlineApiKey(provider: ProviderCredentialView): InlineApiKey | undefined {
  const activeId = nonEmptyString(provider.activeApiKeyId);
  const entries = provider.apiKeys;
  if (activeId !== undefined && typeof entries === 'object' && entries !== null) {
    const entry = (entries as Record<string, unknown>)[activeId];
    const key =
      typeof entry === 'object' && entry !== null
        ? nonEmptyString((entry as { key?: unknown }).key)
        : undefined;
    if (key !== undefined) return { key, field: 'apiKeys' };
  }
  const legacy = nonEmptyString(provider.apiKey);
  return legacy === undefined ? undefined : { key: legacy, field: 'apiKey' };
}

export function declaredProviderCredential(
  provider: ProviderCredentialView,
  providerName: string,
): DeclaredProviderCredential {
  const inline = activeInlineApiKey(provider);
  const apiKeyEnv = nonEmptyString(provider.apiKeyEnv);
  const hasOAuth = provider.oauth !== undefined;
  if (inline !== undefined && apiKeyEnv !== undefined) {
    return {
      kind: 'conflict',
      message: credentialConflictMessage('Provider', providerName, inline.field, 'apiKeyEnv'),
    };
  }
  if (apiKeyEnv !== undefined && hasOAuth) {
    return {
      kind: 'conflict',
      message: credentialConflictMessage('Provider', providerName, 'apiKeyEnv', 'oauth'),
    };
  }
  if (inline !== undefined && hasOAuth) {
    return {
      kind: 'conflict',
      message: credentialConflictMessage('Provider', providerName, inline.field, 'oauth'),
    };
  }
  if (inline !== undefined) return { kind: 'inline', apiKey: inline.key };
  if (apiKeyEnv !== undefined) return { kind: 'env', apiKeyEnv };
  return { kind: 'none' };
}

export function credentialConflictMessage(
  kind: string,
  name: string,
  first: string,
  second: string,
): string {
  return `${kind} "${name}" has both ${first} and ${second} set in config.toml - they are mutually exclusive. Remove one.`;
}

export function apiKeyEnvMissingMessage(providerName: string, envName: string): string {
  return `Provider "${providerName}" declares api_key_env = "${envName}" in config.toml, but the environment variable is not set or is empty.`;
}

export interface ProviderCredentialUpdate {
  readonly apiKey?: string;
  readonly apiKeyEnv?: string;
}

export type ProviderCredentialReconciliation =
  | { readonly ok: true; readonly apiKey?: string; readonly apiKeyEnv?: string }
  | { readonly ok: false; readonly message: string };

export function reconcileProviderCredentialUpdate(
  existing: ProviderCredentialUpdate,
  submitted: ProviderCredentialUpdate,
  providerName: string,
): ProviderCredentialReconciliation {
  const key = nonEmptyString(submitted.apiKey);
  const env = nonEmptyString(submitted.apiKeyEnv);
  if (key !== undefined && env !== undefined) {
    return {
      ok: false,
      message: credentialConflictMessage('Provider', providerName, 'apiKey', 'apiKeyEnv'),
    };
  }
  if (env !== undefined) return { ok: true, apiKeyEnv: env };
  if (key !== undefined) return { ok: true, apiKey: key };
  return {
    ok: true,
    apiKey: submitted.apiKey === undefined ? existing.apiKey : undefined,
    apiKeyEnv: submitted.apiKeyEnv === undefined ? existing.apiKeyEnv : undefined,
  };
}

export function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
