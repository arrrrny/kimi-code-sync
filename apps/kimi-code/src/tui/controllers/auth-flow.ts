import {
  removeProviderFromConfig,
  type KimiConfig,
  type KimiHarness,
  type RefreshProviderModelsOptions,
  type RefreshProviderModelsResponse,
  type OAuthRef,
  type Session,
  type ThinkingEffort,
} from '@moonshot-ai/kimi-code-sdk';

import {
  confirmThenPerformModelSwitch,
  matchedModelSwitchRule,
} from '../commands/config';
import type { SlashCommandHost } from '../commands/dispatch';
import { createKimiCodeUserAgent } from '#/cli/host-identity';
import { OAUTH_LOGIN_REQUIRED_STARTUP_NOTICE } from '../constant/kimi-tui';
import { refreshEffortSwitchConfig } from '#/utils/effort-switch-config';
import { refreshModelSwitchConfirmConfig } from '#/utils/model-switch-confirm-config';
import { lazyModelSelection } from '../utils/model-switch';
import {
  refreshCatalogProviderModels,
  type RefreshCatalogResult,
  type RefreshProviderHost,
} from '../utils/refresh-providers';
import { thinkingEffortFromConfig } from '../utils/thinking-config';
import type { AppState, KimiTUIOptions } from '../types';

export interface AuthFlowHost {
  session: Session | undefined;
  readonly harness: KimiHarness;
  readonly options: KimiTUIOptions;

  setAppState(patch: Partial<AppState>): void;
  setStartupReady(): void;
  resetSessionRuntime(): void;
  setAuthRequired(required: boolean): void;
  appendStartupNotice(extra: string): void;
  hydrateLazyConfigDefaults(includeModel?: boolean): Promise<void>;
}

export class AuthFlowController {
  constructor(private readonly host: AuthFlowHost) {}

  async refreshAvailableModels(): Promise<void> {
    const config = await this.host.harness.getConfig({ reload: true });
    this.host.setAppState({
      availableModels: config.models ?? {},
      availableProviders: config.providers ?? {},
    });
  }

  enterLoginRequiredStartupState(): void {
    this.host.resetSessionRuntime();
    this.host.setAppState({
      sessionId: '',
      model: '',
      thinkingEffort: 'off',
      contextTokens: 0,
      maxContextTokens: 0,
      contextUsage: 0,
      sessionTitle: null,
    });
    this.host.setAuthRequired(true);
    this.host.appendStartupNotice(OAUTH_LOGIN_REQUIRED_STARTUP_NOTICE);
    this.host.setStartupReady();
  }

  async activateModelAfterLogin(model: string, effort?: string): Promise<boolean> {
    const { host } = this;
    if (host.session !== undefined) {
      const session = host.session;
      const modelChanged = (await session.getStatus()).model !== model;
      await session.setModel(model);
      if (effort !== undefined) {
        await session.setThinking(effort);
      }
      host.setAuthRequired(false);
      return modelChanged;
    }

    const patch: Partial<AppState> = { model };
    if (effort !== undefined) {
      patch.thinkingEffort = effort as ThinkingEffort;
      patch.lazySessionThinking = effort as ThinkingEffort;
    }
    host.setAppState(patch);
    host.setAuthRequired(false);
    return false;
  }

  async refreshConfigAfterLogin(effortOverride?: ThinkingEffort): Promise<boolean | 'gated'> {
    const { host } = this;
    const config = await host.harness.getConfig({ reload: true });
    const availableModels = config.models ?? {};
    const availableProviders = config.providers ?? {};
    const defaultModel = host.options.startup.model ?? config.defaultModel;
    const selected = defaultModel !== undefined ? availableModels[defaultModel] : undefined;
    try {
      const accessToken = await host.harness.auth.getCachedAccessToken();
      await Promise.all([
        refreshModelSwitchConfirmConfig({ accessToken }),
        refreshEffortSwitchConfig({ accessToken }),
      ]);
    } catch {}

    if (defaultModel === undefined || selected === undefined) {
      if (host.session === undefined) {
        await host.hydrateLazyConfigDefaults();
      }
      host.setAppState({ availableModels, availableProviders });
      return false;
    }

    const configuredEffort = thinkingEffortFromConfig(config.thinking);
    const slashHost = this.host as unknown as SlashCommandHost;
    host.setAppState({ availableModels, availableProviders });
    if (matchedModelSwitchRule(slashHost, defaultModel) !== undefined) {
      if (host.session === undefined) await host.hydrateLazyConfigDefaults(false);
      const targetDefaultEffort =
        host.session === undefined ? lazyModelSelection(config, defaultModel).thinkingEffort : undefined;
      confirmThenPerformModelSwitch(
        slashHost,
        defaultModel,
        effortOverride ?? configuredEffort ?? targetDefaultEffort ?? slashHost.state.appState.thinkingEffort,
        'session',
      );
      return 'gated';
    }

    const activated = await this.activateModelAfterLogin(defaultModel, configuredEffort);
    if (host.session === undefined) {
      await host.hydrateLazyConfigDefaults();
      host.setAppState({ availableModels, availableProviders });
      return activated;
    }
    const appStatePatch: Partial<AppState> = {
      availableModels,
      availableProviders,
      model: defaultModel,
      maxContextTokens: selected.maxContextSize,
    };
    host.setAppState(appStatePatch);
    return activated;
  }

  async refreshConfigAfterLogout(): Promise<void> {
    const config = await this.host.harness.getConfig({ reload: true });
    const availableModels = config.models ?? {};
    const availableProviders = config.providers ?? {};

    if (this.host.session !== undefined) {
      this.host.setAppState({ availableModels, availableProviders });
      return;
    }

    this.host.setAppState({
      availableModels,
      availableProviders,
      model: '',
      thinkingEffort: 'off',
      maxContextTokens: 0,
      contextUsage: 0,
      contextTokens: 0,
    });
  }

  async refreshProviderModels(
    options?: RefreshProviderModelsOptions,
  ): Promise<RefreshProviderModelsResponse> {
    const result = await this.host.harness.refreshProviderModels(options);
    await this.refreshAvailableModels();
    return result;
  }

  async refreshOAuthProviderModels(): Promise<RefreshProviderModelsResponse> {
    const result = await this.host.harness.refreshProviderModels({ scope: 'oauth' });
    // Same rationale as refreshProviderModels: an oauth-scoped refresh rewrites
    // provider metadata (type, baseUrl, …) while reporting the provider as
    // unchanged, so reload even when no model changed.
    await this.refreshAvailableModels();
    return result;
  }

  /**
   * On-demand catalog refresh for OpenAI-compatible providers (`/refresh-catalog`).
   * Unlike the automatic refresh, this preserves curated `maxContextSize` values
   * and enriches names/capabilities from models.dev.
   */
  async refreshCatalogModels(providerId?: string): Promise<RefreshCatalogResult> {
    const result = await refreshCatalogProviderModels(this.buildRefreshHost(), { providerId });
    if (result.changed.length > 0) {
      await this.refreshAvailableModels();
    }
    return result;
  }

  /**
   * Build the refresh orchestrator's persistence host. When the harness can
   * persist several config sections as ONE atomic write (the v2 engine's
   * `replaceSections`), the orchestrator's two-phase contract (removeProvider
   * then setConfig) is absorbed the same way the v2 engine's own refresh path
   * does it: the removal is staged in memory only, and the following
   * setConfig persists the complete records in a single write — so a process
   * exit mid-refresh can never leave config.toml in a "provider removed, not
   * yet restored" state. The v1 harness keeps the legacy host (two
   * whole-document writes, each atomic on its own).
   */
  private buildRefreshHost(): RefreshProviderHost {
    const { host } = this;
    const resolveOAuthToken = async (providerName: string, oauthRef?: OAuthRef): Promise<string> => {
      const tokenProvider = host.harness.auth.resolveOAuthTokenProvider(providerName, oauthRef);
      return tokenProvider.getAccessToken();
    };
    const userAgent = createKimiCodeUserAgent();
    if (!host.harness.supportsAtomicSectionReplace()) {
      return {
        getConfig: () => host.harness.getConfig({ reload: true }),
        removeProvider: (id) => host.harness.removeProvider(id),
        setConfig: (patch) => host.harness.setConfig(patch),
        resolveOAuthToken,
        userAgent,
      };
    }
    let staged: KimiConfig | undefined;
    const requireStaged = (): KimiConfig => {
      if (staged === undefined) {
        throw new Error('refresh host: getConfig must be called before writes');
      }
      return staged;
    };
    return {
      getConfig: async () => {
        staged = await host.harness.getConfig({ reload: true });
        return staged;
      },
      removeProvider: (id) => {
        staged = removeProviderFromConfig(requireStaged(), id);
        return Promise.resolve(staged);
      },
      setConfig: async (patch) => {
        // The orchestrator always passes complete records (built from a full
        // clone), so the Partial-shaped patch is a full KimiConfig overlay.
        staged = { ...requireStaged(), ...patch } as KimiConfig;
        // Object.entries keeps keys whose value is `undefined`, so a cleared
        // section (e.g. a dangling defaultModel) is expressed as a removal in
        // the atomic write; sections absent from the patch stay untouched.
        await host.harness.replaceConfigSections(Object.fromEntries(Object.entries(patch)));
        return staged;
      },
      resolveOAuthToken,
      userAgent,
    };
  }
}
