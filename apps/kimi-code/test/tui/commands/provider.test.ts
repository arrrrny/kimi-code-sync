/**
 * Scenario: /provider post-add default-model selection.
 * Responsibilities: the picked effort is gated for persistence by the model's
 * effective default, and a session-only pick is still applied to the runtime
 * after the config refresh (which only reactivates from persisted values).
 * Wiring: real setDefaultModel with the harness/authFlow boundaries stubbed by
 * a small host rig.
 * Run: pnpm -C apps/kimi-code exec vitest run test/tui/commands/provider.test.ts
 */
import type { ModelAlias, ProviderConfig } from '@moonshot-ai/kimi-code-sdk';
import { describe, expect, it, vi } from 'vitest';

import type { SlashCommandHost } from '#/tui/commands';
import { handleProviderCommand, setDefaultModel } from '#/tui/commands/provider';
import { promptKeyProxyUrl } from '#/tui/commands/prompts';

const ESC = String.fromCodePoint(27);

type MountedPanel = {
  handleInput: (data: string) => void;
  render: (width: number) => string[];
};

/**
 * Host rig for the provider-manager flows. The harness config surface is a
 * single mutable snapshot, so a write followed by a re-read behaves like the
 * real one; `mountEditorReplacement` records every panel in mount order.
 */
function makeFlowHost(providers: Record<string, ProviderConfig> = {}) {
  const mounts: MountedPanel[] = [];
  const snapshot: { providers: Record<string, ProviderConfig> } = { providers };
  const replaceConfigSections = vi.fn(async (sections: Record<string, unknown>) => {
    snapshot.providers = sections['providers'] as Record<string, ProviderConfig>;
  });
  const setConfig = vi.fn(async (patch: Record<string, unknown>) => {
    snapshot.providers = patch['providers'] as Record<string, ProviderConfig>;
    return patch;
  });
  const appState: Record<string, unknown> = {
    availableProviders: snapshot.providers,
    availableModels: {},
    model: 'acme/m1',
  };
  const host = {
    state: { appState },
    harness: {
      supportsAtomicSectionReplace: () => true,
      replaceConfigSections,
      setConfig,
      getConfig: vi.fn(async () => ({ providers: snapshot.providers })),
    },
    authFlow: {
      refreshConfigAfterLogin: vi.fn(async () => {
        appState['availableProviders'] = snapshot.providers;
        return false;
      }),
    },
    restoreEditor: vi.fn(),
    mountEditorReplacement: vi.fn((panel: MountedPanel) => {
      mounts.push(panel);
    }),
    showError: vi.fn(),
    showStatus: vi.fn(),
    showNotice: vi.fn(),
    track: vi.fn(),
  } as unknown as SlashCommandHost & {
    harness: { replaceConfigSections: ReturnType<typeof vi.fn>; setConfig: ReturnType<typeof vi.fn> };
    showError: ReturnType<typeof vi.fn>;
    showStatus: ReturnType<typeof vi.fn>;
  };

  const nextMount = async (index: number): Promise<MountedPanel> => {
    await vi.waitFor(() => {
      expect(mounts.length).toBeGreaterThan(index);
    });
    return mounts[index]!;
  };

  return { host, mounts, nextMount, replaceConfigSections, setConfig, snapshot };
}

function submit(panel: MountedPanel, value: string): void {
  if (value.length > 0) panel.handleInput(value);
  panel.handleInput('\r');
}

function makeHost(
  options: {
    refreshReachedLiveSession?: boolean;
    activateReachedLiveSession?: boolean;
  } = {},
) {
  const appState = {
    availableModels: {
      // Declares no efforts; the Anthropic profile inference supplies
      // [low, medium, high, xhigh, max] with the default resolved to 'high'.
      opus: {
        provider: 'compatible',
        model: 'claude-opus-4-7',
        maxContextSize: 200_000,
      } as unknown as ModelAlias,
    },
    availableProviders: {
      compatible: { type: 'anthropic' },
    },
  };
  const host = {
    state: { appState },
    waitForLazyCreation: vi.fn(async () => {}),
    harness: {
      setConfig: vi.fn(async () => ({})),
    },
    authFlow: {
      refreshConfigAfterLogin: vi.fn(async () => options.refreshReachedLiveSession === true),
      activateModelAfterLogin: vi.fn(async () => options.activateReachedLiveSession === true),
    },
    track: vi.fn(),
    showStatus: vi.fn(),
  } as unknown as SlashCommandHost & {
    harness: { setConfig: ReturnType<typeof vi.fn> };
    authFlow: {
      refreshConfigAfterLogin: ReturnType<typeof vi.fn>;
      activateModelAfterLogin: ReturnType<typeof vi.fn>;
    };
    waitForLazyCreation: ReturnType<typeof vi.fn>;
    track: ReturnType<typeof vi.fn>;
  };
  return { host };
}

describe('setDefaultModel', () => {
  it('applies an above-default pick to the runtime when the gate keeps it session-only', async () => {
    const { host } = makeHost();

    await setDefaultModel(host, 'opus', 'xhigh');

    expect(host.harness.setConfig).toHaveBeenCalledWith({
      defaultModel: 'opus',
      thinking: { enabled: true },
    });
    expect(host.authFlow.activateModelAfterLogin).toHaveBeenCalledWith('opus', 'xhigh');
    // The application must come after the refresh, or the persisted value
    // reactivated by refreshConfigAfterLogin would clobber the pick.
    expect(
      host.authFlow.activateModelAfterLogin.mock.invocationCallOrder[0]!,
    ).toBeGreaterThan(host.authFlow.refreshConfigAfterLogin.mock.invocationCallOrder[0]!);
    // Without a session the engine never sees the pick, so the TUI stays the
    // sole model_switch producer.
    expect(host.track).toHaveBeenCalledWith('model_switch', { model: 'opus' });
  });

  it('does not re-apply the effort when the pick persists', async () => {
    const { host } = makeHost();

    await setDefaultModel(host, 'opus', 'high');

    expect(host.harness.setConfig).toHaveBeenCalledWith({
      defaultModel: 'opus',
      thinking: { enabled: true, effort: 'high' },
    });
    expect(host.authFlow.activateModelAfterLogin).not.toHaveBeenCalled();
  });

  it('does not re-apply a boolean on pick', async () => {
    const { host } = makeHost();

    await setDefaultModel(host, 'opus', 'on');

    expect(host.harness.setConfig).toHaveBeenCalledWith({
      defaultModel: 'opus',
      thinking: { enabled: true },
    });
    expect(host.authFlow.activateModelAfterLogin).not.toHaveBeenCalled();
  });

  it('leaves model_switch to the engine when activation changed the bound alias', async () => {
    const { host } = makeHost({ refreshReachedLiveSession: true });

    await setDefaultModel(host, 'opus', 'high');

    // refreshConfigAfterLogin routed through session.setModel with a changed
    // alias, which the engine already tracks — a TUI-side event would
    // double-count the switch.
    expect(host.track).not.toHaveBeenCalled();
  });

  it('leaves model_switch to the engine when a lazy session came live mid-flow and rebounded', async () => {
    // Session-less at entry, but the first prompt's lazy creation completes
    // while setConfig / the refresh are pending, so the session-only re-apply
    // lands on the now-live session and actually switches its alias (engine
    // emits).
    const { host } = makeHost({ activateReachedLiveSession: true });

    await setDefaultModel(host, 'opus', 'xhigh');

    expect(host.authFlow.activateModelAfterLogin).toHaveBeenCalledWith('opus', 'xhigh');
    expect(host.track).not.toHaveBeenCalled();
  });

  it('emits model_switch when a v1-created session only rebinds the same alias', async () => {
    // v1 session-less + session-only effort: the refresh creates the session
    // with the picked model (creation emits nothing), then the re-apply
    // reaches that live session but its setModel is an alias no-op (no engine
    // event either) — the TUI must stay the producer for the pick.
    const { host } = makeHost({
      refreshReachedLiveSession: false,
      activateReachedLiveSession: false,
    });

    await setDefaultModel(host, 'opus', 'xhigh');

    expect(host.authFlow.activateModelAfterLogin).toHaveBeenCalledWith('opus', 'xhigh');
    expect(host.track).toHaveBeenCalledWith('model_switch', { model: 'opus' });
  });

  it('waits for an in-flight lazy creation before activating (v2)', async () => {
    const { host } = makeHost();

    await setDefaultModel(host, 'opus', 'high');

    expect(host.waitForLazyCreation).toHaveBeenCalled();
    expect(
      host.waitForLazyCreation.mock.invocationCallOrder[0]!,
    ).toBeLessThan(host.harness.setConfig.mock.invocationCallOrder[0]!);
  });
});

describe('handleProviderCommand key flows', () => {
  const acme = (): Record<string, ProviderConfig> => ({
    acme: { type: 'openai', baseUrl: 'https://acme.test' } as ProviderConfig,
  });

  const twoKeyAcme = (): Record<string, ProviderConfig> => ({
    acme: {
      type: 'openai',
      baseUrl: 'https://acme.test',
      apiKeys: {
        key1: { key: 'sk-alpha-secret-value', name: 'work', proxyUrl: 'http://127.0.0.1:8081' },
        key2: { key: 'sk-beta-secret-value', name: 'spare' },
      },
      activeApiKeyId: 'key1',
    },
  });

  it('adds a key through name, secret, then one optional proxy question', async () => {
    const { host, mounts, nextMount, replaceConfigSections } = makeFlowHost(acme());

    void handleProviderCommand(host);
    mounts[0]!.handleInput('a');
    submit(await nextMount(1), 'work');
    submit(await nextMount(2), 'sk-alpha-secret-value');
    const proxy = await nextMount(3);
    expect(proxy.render(80).join('\n')).toContain('proxy URL');

    submit(proxy, '');
    await nextMount(4);

    expect(replaceConfigSections).toHaveBeenCalledTimes(1);
  });

  it('stores no per-key proxy when the proxy answer is empty', async () => {
    const { host, mounts, nextMount, replaceConfigSections } = makeFlowHost(acme());

    void handleProviderCommand(host);
    mounts[0]!.handleInput('a');
    submit(await nextMount(1), 'work');
    submit(await nextMount(2), 'sk-alpha-secret-value');
    submit(await nextMount(3), '');
    await nextMount(4);

    const written = replaceConfigSections.mock.calls[0]![0] as {
      providers: Record<string, ProviderConfig>;
    };
    const entry = written.providers['acme']!.apiKeys!['key1']!;

    expect(entry).toEqual({ key: 'sk-alpha-secret-value', name: 'work' });
    expect(entry.proxyUrl).toBeUndefined();
  });

  it('persists a supplied proxy with the key through the existing write path', async () => {
    const { host, mounts, nextMount, replaceConfigSections, setConfig } = makeFlowHost(acme());

    void handleProviderCommand(host);
    mounts[0]!.handleInput('a');
    submit(await nextMount(1), 'work');
    submit(await nextMount(2), 'sk-alpha-secret-value');
    submit(await nextMount(3), 'http://127.0.0.1:8081');
    await nextMount(4);

    expect(setConfig).not.toHaveBeenCalled();
    const written = replaceConfigSections.mock.calls[0]![0] as {
      providers: Record<string, ProviderConfig>;
    };
    const provider = written.providers['acme']!;

    expect(provider.apiKeys!['key1']).toEqual({
      key: 'sk-alpha-secret-value',
      name: 'work',
      proxyUrl: 'http://127.0.0.1:8081',
    });
    expect(provider.activeApiKeyId).toBe('key1');
  });

  it('abandons the flow and writes nothing when the proxy prompt is cancelled', async () => {
    const { host, mounts, nextMount, replaceConfigSections, setConfig } = makeFlowHost(acme());

    void handleProviderCommand(host);
    mounts[0]!.handleInput('a');
    submit(await nextMount(1), 'work');
    submit(await nextMount(2), 'sk-alpha-secret-value');
    (await nextMount(3)).handleInput(ESC);
    await nextMount(4);

    expect(replaceConfigSections).not.toHaveBeenCalled();
    expect(setConfig).not.toHaveBeenCalled();
    expect(host.showStatus).not.toHaveBeenCalled();
  });

  it('flips only rotate_keys from the R key, leaving the keys and their proxies alone', async () => {
    const { host, mounts, replaceConfigSections } = makeFlowHost(twoKeyAcme());

    void handleProviderCommand(host);
    mounts[0]!.handleInput('R');
    await vi.waitFor(() => {
      expect(replaceConfigSections).toHaveBeenCalledTimes(1);
    });

    const written = replaceConfigSections.mock.calls[0]![0] as {
      providers: Record<string, ProviderConfig>;
    };
    const provider = written.providers['acme']!;

    expect(provider.rotateKeys).toBe(true);
    expect(provider.activeApiKeyId).toBe('key1');
    expect(provider.apiKeys).toEqual(twoKeyAcme()['acme']!.apiKeys);
    expect(host.showStatus).toHaveBeenCalledWith('Key rotation enabled for acme (2 keys)');
  });

  it('writes nothing when R is pressed on a provider with a single key', async () => {
    const providers: Record<string, ProviderConfig> = {
      acme: {
        type: 'openai',
        baseUrl: 'https://acme.test',
        apiKeys: { key1: { key: 'sk-alpha-secret-value', name: 'work' } },
        activeApiKeyId: 'key1',
      },
    };
    const { host, mounts, replaceConfigSections, setConfig } = makeFlowHost(providers);

    void handleProviderCommand(host);
    mounts[0]!.handleInput('R');
    await vi.waitFor(() => {
      expect(host.showError).toHaveBeenCalled();
    });

    expect(replaceConfigSections).not.toHaveBeenCalled();
    expect(setConfig).not.toHaveBeenCalled();
    expect(host.showStatus).not.toHaveBeenCalled();
  });
});

describe('promptKeyProxyUrl', () => {
  it('resolves undefined when the user cancels', async () => {
    const { host, nextMount } = makeFlowHost();

    const answer = promptKeyProxyUrl(host, 'acme/work');
    const dialog = await nextMount(0);
    dialog.handleInput(ESC);

    await expect(answer).resolves.toBeUndefined();
  });

  it('accepts an empty answer as "no proxy of my own"', { timeout: 3000 }, async () => {
    const { host, nextMount } = makeFlowHost();

    const answer = promptKeyProxyUrl(host, 'acme/work');
    const dialog = await nextMount(0);
    dialog.handleInput('\r');

    await expect(answer).resolves.toStrictEqual({});
  });

  it('resolves a value with surrounding whitespace trimmed', async () => {
    const { host, nextMount } = makeFlowHost();

    const answer = promptKeyProxyUrl(host, 'acme/work');
    const dialog = await nextMount(0);
    submit(dialog, '  http://127.0.0.1:8081  ');

    await expect(answer).resolves.toStrictEqual({ proxyUrl: 'http://127.0.0.1:8081' });
  });

  it('re-prompts on an invalid proxy address instead of resolving it', async () => {
    const { host, nextMount } = makeFlowHost();

    const answer = promptKeyProxyUrl(host, 'acme/work');
    submit(await nextMount(0), 'not-a-url');
    submit(await nextMount(1), 'ftp://127.0.0.1:8081');
    submit(await nextMount(2), 'http://127.0.0.1:8081');

    await expect(answer).resolves.toStrictEqual({ proxyUrl: 'http://127.0.0.1:8081' });
  });
});
