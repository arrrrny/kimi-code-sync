import {
  refreshModelsDevCatalog,
  refreshProviderCatalog,
  refreshProviderModels,
  type ProviderChange,
  type RefreshCatalogResult,
  type RefreshProviderOptions,
  type RefreshProviderScope,
  type RefreshResult,
} from '@moonshot-ai/kimi-code-oauth';
import type { KimiConfig, KimiConfigPatch, OAuthRef } from '@moonshot-ai/kimi-code-sdk';

export interface RefreshProviderHost {
  getConfig(): Promise<KimiConfig>;
  removeProvider(providerId: string): Promise<KimiConfig>;
  setConfig(patch: KimiConfigPatch): Promise<KimiConfig>;
  resolveOAuthToken(providerName: string, oauthRef?: OAuthRef): Promise<string>;
  readonly userAgent?: string;
}

export type { ProviderChange, RefreshCatalogResult, RefreshProviderOptions, RefreshProviderScope, RefreshResult };

export async function refreshAllProviderModels(
  host: RefreshProviderHost,
  options: RefreshProviderOptions = {},
): Promise<RefreshResult> {
  return refreshProviderModels(
    {
      getConfig: () => host.getConfig(),
      removeProvider: (providerId) => host.removeProvider(providerId),
      setConfig: (patch) => host.setConfig(patch as unknown as KimiConfigPatch),
      resolveOAuthToken: (providerName, oauthRef) =>
        host.resolveOAuthToken(providerName, oauthRef as unknown as OAuthRef),
      userAgent: host.userAgent,
    },
    options,
  );
}

export async function refreshCatalogProviderModels(
  host: RefreshProviderHost,
  options: { providerId?: string } = {},
): Promise<RefreshCatalogResult> {
  await refreshModelsDevCatalog(undefined, host.userAgent);
  return refreshProviderCatalog(
    {
      getConfig: () => host.getConfig(),
      removeProvider: (providerId) => host.removeProvider(providerId),
      setConfig: (patch) => host.setConfig(patch as unknown as KimiConfigPatch),
      resolveOAuthToken: (providerName, oauthRef) =>
        host.resolveOAuthToken(providerName, oauthRef as unknown as OAuthRef),
      userAgent: host.userAgent,
    },
    options,
  );
}
