import type { ProviderConfig } from '@moonshot-ai/kimi-code-sdk';
import chalk from 'chalk';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  ProviderManagerComponent,
  type ProviderManagerOptions,
} from '#/tui/components/dialogs/provider-manager';
import { darkColors } from '#/tui/theme/colors';

// Truecolor SGR fragments for the darkColors tokens we assert on
// (see theme/colors.ts). Forcing chalk.level below guarantees they appear.
const PRIMARY = '38;2;79;168;255'; // colors.primary  #4FA8FF
const MUTED = '38;2;107;107;107'; // colors.textMuted #6B6B6B
const BOLD = '[1m';
const ESC = String.fromCodePoint(27);

const SGR = new RegExp(`${ESC}\\[[0-9;]*m`, 'g');

function rendered(component: ProviderManagerComponent, width = 120): string {
  return component.render(width).join('\n').replaceAll(SGR, '');
}

function makeComponent(overrides: Partial<ProviderManagerOptions> = {}): ProviderManagerComponent {
  return new ProviderManagerComponent({
    providers: {} as Record<string, ProviderConfig>,
    onAdd: vi.fn(),
    onDeleteSource: vi.fn(),
    onAddKey: vi.fn(),
    onRemoveKey: vi.fn(),
    onSetActiveKey: vi.fn(),
    onSetProxyUrl: vi.fn(),
    onToggleRotation: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  });
}

function addRowLine(component: ProviderManagerComponent, width = 120): string | undefined {
  return component.render(width).find((line) => line.includes('Add New Platform'));
}

describe('ProviderManagerComponent', () => {
  let previousLevel: typeof chalk.level;
  beforeAll(() => {
    previousLevel = chalk.level;
    chalk.level = 3;
  });
  afterAll(() => {
    chalk.level = previousLevel;
  });

  it('renders [ Add New Platform ] in the brand color, never muted, when not selected', () => {
    // A configured provider occupies row 0 (selected); the add row sits below
    // it and is therefore not the highlighted row.
    const component = makeComponent({
      providers: {
        acme: { baseUrl: 'https://acme.test' },
      } as unknown as Record<string, ProviderConfig>,
      activeProviderId: 'acme',
    });
    const line = addRowLine(component);
    expect(line).toBeDefined();
    expect(line).toContain(PRIMARY);
    expect(line).not.toContain(MUTED);
  });

  it('bolds [ Add New Platform ] when it is the selected row', () => {
    // With no configured providers the synthetic add row is the only row, so it
    // starts as the highlighted selection.
    const component = makeComponent();
    const line = addRowLine(component);
    expect(line).toBeDefined();
    expect(line).toContain(BOLD);
    expect(line).toContain(PRIMARY);
  });

  it('marks the active provider with the shared "← current" marker, not a bullet', () => {
    const component = makeComponent({
      providers: {
        acme: { baseUrl: 'https://acme.test' },
      } as unknown as Record<string, ProviderConfig>,
      activeProviderId: 'acme',
    });
    const plain = component
      .render(120)
      .join('\n')
      .replaceAll(/\[[0-9;]*m/g, '');
    expect(plain).toContain('← current');
    expect(plain).not.toContain('●');
  });

  it('uses the same header shape as the model dialog (one top border, title, hint, no inner border)', () => {
    const component = makeComponent({
      providers: {
        acme: { baseUrl: 'https://acme.test' },
      } as unknown as Record<string, ProviderConfig>,
      activeProviderId: 'acme',
    });
    const lines = component.render(120).map((l) => l.replaceAll(SGR, ''));
    const isBorder = (l: string | undefined): boolean => /^─+$/.test((l ?? '').trim());

    const titleIdx = lines.findIndex((l) => l.includes('Providers'));
    expect(titleIdx).toBeGreaterThanOrEqual(0);
    // The line directly under the title is the hint, never an inner border (the
    // old `border · title · border` sandwich is gone).
    expect(isBorder(lines[titleIdx + 1])).toBe(false);
    expect(lines[titleIdx + 1]).toContain('navigate');
    expect(lines[titleIdx + 1]).toContain('Esc cancel');
    // Blank line separates the hint from the body, exactly like the model dialog.
    expect(lines[titleIdx + 2]).toBe('');
    // Only the top and bottom full-width borders remain — two, not three.
    expect(lines.filter(isBorder).length).toBe(2);
  });

  it('shows a key row with its name, a masked preview and the current marker, and no proxy text', () => {
    const component = makeComponent({
      providers: {
        acme: {
          type: 'openai',
          baseUrl: 'https://acme.test',
          apiKeys: {
            key1: { key: 'sk-alpha-secret-value', name: 'work' },
            key2: { key: 'sk-beta-secret-value', name: 'spare' },
          },
          activeApiKeyId: 'key1',
        },
      } as unknown as Record<string, ProviderConfig>,
    });

    const plain = rendered(component);

    expect(plain).toContain('work');
    expect(plain).toContain('spare');
    expect(plain).toContain('sk-alpha...alue');
    expect(plain).not.toContain('sk-alpha-secret-value');
    expect(plain).toContain('← current');
    expect(plain).not.toContain('proxy:');
  });

  it('shows the rotation state and the R hint for a provider with several keys', () => {
    const keys = {
      key1: { key: 'sk-alpha-secret-value', name: 'work' },
      key2: { key: 'sk-beta-secret-value', name: 'spare' },
    };
    const rotationOff = makeComponent({
      providers: {
        acme: { type: 'openai', baseUrl: 'https://acme.test', apiKeys: keys, activeApiKeyId: 'key1' },
      } as unknown as Record<string, ProviderConfig>,
    });
    const rotationOn = makeComponent({
      providers: {
        acme: {
          type: 'openai',
          baseUrl: 'https://acme.test',
          apiKeys: keys,
          activeApiKeyId: 'key1',
          rotateKeys: true,
        },
      } as unknown as Record<string, ProviderConfig>,
    });

    expect(rendered(rotationOff)).toContain('rotate keys: off');
    expect(rendered(rotationOn)).toContain('rotate keys: on');

    const hint = rotationOff
      .render(120)
      .map((line) => line.replaceAll(SGR, ''))
      .find((line) => line.includes('navigate'));
    expect(hint).toContain('R rotate keys');
  });

  it("shows a key's own proxy host on its row", () => {
    const component = makeComponent({
      providers: {
        acme: {
          type: 'openai',
          baseUrl: 'https://acme.test',
          apiKeys: {
            key1: {
              key: 'sk-alpha-secret-value',
              name: 'work',
              proxyUrl: 'http://127.0.0.1:8081',
            },
          },
        },
      } as unknown as Record<string, ProviderConfig>,
    });

    const plain = rendered(component);

    expect(plain).toContain('proxy:');
    expect(plain).toContain('127.0.0.1:8081');
  });

  it("never renders a key's proxy userinfo or the key secret", () => {
    const component = makeComponent({
      providers: {
        acme: {
          type: 'openai',
          baseUrl: 'https://acme.test',
          apiKeys: {
            key1: {
              key: 'sk-alpha-secret-value',
              name: 'work',
              proxyUrl: 'http://proxy-user:proxy-pass@127.0.0.1:8081',
            },
          },
        },
      } as unknown as Record<string, ProviderConfig>,
    });

    const plain = rendered(component);

    expect(plain).toContain('127.0.0.1:8081');
    expect(plain).not.toContain('proxy-user');
    expect(plain).not.toContain('proxy-pass');
    expect(plain).not.toContain('sk-alpha-secret-value');
  });

  it('shows no proxy text for a key without a proxy of its own', () => {
    const component = makeComponent({
      providers: {
        acme: {
          type: 'openai',
          baseUrl: 'https://acme.test',
          proxyUrl: 'http://127.0.0.1:8080',
          apiKeys: { key1: { key: 'sk-alpha-secret-value', name: 'work' } },
        },
      } as unknown as Record<string, ProviderConfig>,
    });

    expect(rendered(component)).not.toContain('proxy:');
  });

  it('deletes the highlighted provider via the D key with a y/N confirm', () => {
    const onDeleteSource = vi.fn();
    const component = makeComponent({
      providers: {
        acme: { baseUrl: 'https://acme.test' },
      } as unknown as Record<string, ProviderConfig>,
      activeProviderId: 'acme',
      onDeleteSource,
    });
    component.handleInput('D');
    expect(rendered(component)).toContain('[y/N]');
    component.handleInput('y');
    expect(onDeleteSource).toHaveBeenCalledWith(['acme']);
  });

  it('closes on Esc', () => {
    const onClose = vi.fn();
    const component = makeComponent({
      providers: {
        acme: { baseUrl: 'https://acme.test' },
      } as unknown as Record<string, ProviderConfig>,
      onClose,
    });
    component.handleInput(ESC);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
