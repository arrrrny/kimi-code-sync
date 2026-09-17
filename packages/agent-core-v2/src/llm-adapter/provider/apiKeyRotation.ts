import type {
  LlmCredential,
  LlmCredentialProvider,
  LlmKeyRotationController,
  LlmKeyRotationOutcome,
} from '#human/llm/requester/requester';

import { nonEmpty } from '../model/model-auth';

import type { IProviderService, ProviderApiKey, ProviderConfig } from './provider';

const MANAGED_PROVIDER_PREFIX = 'managed:';

const rotationChains = new Map<string, Promise<void>>();

interface ResolvedKey {
  readonly keyId: string;
  readonly entry: ProviderApiKey;
}

function keyEntries(config: ProviderConfig | undefined): Array<[string, ProviderApiKey]> {
  if (config?.apiKeys === undefined) return [];
  return Object.entries(config.apiKeys);
}

function resolveActiveKey(config: ProviderConfig | undefined): ResolvedKey | undefined {
  const entries = keyEntries(config);
  if (entries.length === 0) return undefined;
  const activeId = config?.activeApiKeyId;
  const match = entries.find(([keyId]) => keyId === activeId);
  return match === undefined ? undefined : { keyId: match[0], entry: match[1] };
}

function planNext(config: ProviderConfig | undefined): ResolvedKey | undefined {
  const entries = keyEntries(config);
  if (entries.length === 0) return undefined;
  const activeId = config?.activeApiKeyId;
  const index = entries.findIndex(([keyId]) => keyId === activeId);
  const next = entries[(index + 1) % entries.length];
  return next === undefined ? undefined : { keyId: next[0], entry: next[1] };
}

function credentialOf(
  config: ProviderConfig | undefined,
  fallbackApiKey: string | undefined,
): LlmCredential | undefined {
  const active = resolveActiveKey(config);
  if (active !== undefined) {
    const proxyUrl = nonEmpty(active.entry.proxyUrl);
    return { apiKey: active.entry.key, proxyUrl };
  }
  const legacy = nonEmpty(config?.apiKey) ?? nonEmpty(fallbackApiKey);
  return legacy === undefined ? undefined : { apiKey: legacy };
}

class ApiKeyRotationController implements LlmKeyRotationController {
  constructor(
    private readonly providers: IProviderService,
    readonly providerName: string,
  ) {}

  get keyCount(): number {
    return keyEntries(this.providers.get(this.providerName)).length;
  }

  plan(): { readonly keyId: string; readonly name: string } | undefined {
    const next = planNext(this.providers.get(this.providerName));
    return next === undefined ? undefined : { keyId: next.keyId, name: next.entry.name };
  }

  async rotate(expectedKeyId: string | undefined): Promise<LlmKeyRotationOutcome> {
    return this.serialize(() => this.apply(expectedKeyId));
  }

  private async apply(expectedKeyId: string | undefined): Promise<LlmKeyRotationOutcome> {
    const config = this.providers.get(this.providerName);
    if (config === undefined) return { outcome: 'unavailable' };
    const next = planNext(config);
    if (next === undefined) return { outcome: 'unavailable' };
    if (next.keyId !== expectedKeyId) {
      const active = resolveActiveKey(config);
      if (active === undefined) return { outcome: 'unavailable' };
      return { outcome: 'already-advanced', keyId: active.keyId, name: active.entry.name };
    }
    await this.providers.setActiveApiKey(this.providerName, next.keyId);
    return { outcome: 'rotated', keyId: next.keyId, name: next.entry.name };
  }

  private async serialize(run: () => Promise<LlmKeyRotationOutcome>): Promise<LlmKeyRotationOutcome> {
    const previous = rotationChains.get(this.providerName) ?? Promise.resolve();
    const result = previous.then(run, run);
    rotationChains.set(
      this.providerName,
      result.then(
        () => {},
        () => {},
      ),
    );
    return result;
  }
}

function rotationFor(
  providers: IProviderService,
  providerName: string,
): LlmKeyRotationController | undefined {
  if (providerName.startsWith(MANAGED_PROVIDER_PREFIX)) return undefined;
  const config = providers.get(providerName);
  if (config === undefined || config.oauth !== undefined) return undefined;
  if (config.rotateKeys !== true) return undefined;
  if (keyEntries(config).length < 2) return undefined;
  return new ApiKeyRotationController(providers, providerName);
}

export function createKeyedCredentialProvider(args: {
  readonly providers: IProviderService;
  readonly providerName: string;
  readonly fallbackApiKey?: string;
}): LlmCredentialProvider {
  return {
    resolve: () => credentialOf(args.providers.get(args.providerName), args.fallbackApiKey),
    rotation: () => rotationFor(args.providers, args.providerName),
  };
}
