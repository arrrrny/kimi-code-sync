import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { configToTomlData, parseConfigString } from '#/config/index';
import { createKimiConfigRpc } from '#/index';

const toPosix = (p: string): string => p.replaceAll('\\', '/');

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'kimi-sdk-config-'));
  tempDirs.push(dir);
  return dir;
}

describe('SDK config TOML', () => {
  it('resolves config paths through the config RPC wrapper', async () => {
    const dir = await makeTempDir();
    const rpc = createKimiConfigRpc();

    await expect(rpc.resolveConfigPath({ homeDir: dir })).resolves.toBe(toPosix(join(dir, 'config.toml')));
  });

  it('returns structured validation issues through the config RPC wrapper', async () => {
    const rpc = createKimiConfigRpc();

    await expect(
      rpc.validateConfigToml({
        text: `
[providers.kimi]
type = "kimi"

[models.kimi]
provider = "kimi"
model = "kimi"
max_context_size = "large"
`,
        filePath: 'broken.toml',
      }),
    ).rejects.toMatchObject({
      details: {
        validationIssues: [
          {
            path: ['models', 'kimi', 'maxContextSize'],
          },
        ],
      },
    });
  });

  it('parses a provider api_key_env into camelCase apiKeyEnv', async () => {
    const rpc = createKimiConfigRpc();
    const text = `
[providers.acme]
type = "openai"
api_key_env = "ACME_API_KEY"
`;

    await expect(rpc.validateConfigToml({ text })).resolves.toBeUndefined();
    expect(parseConfigString(text).providers['acme']?.apiKeyEnv).toBe('ACME_API_KEY');
  });

  it('carries provider rotate_keys and a key proxy_url through a read/write cycle', () => {
    const config = parseConfigString(`
[providers.kilo]
type = "openai"
active_api_key_id = "key2"
rotate_keys = true

[providers.kilo.api_keys.key1]
key = "sk-alpha"
name = "work"
proxy_url = "http://127.0.0.1:8081"

[providers.kilo.api_keys.key2]
key = "sk-beta"
name = "personal"
`);

    expect(config.providers['kilo']).toMatchObject({
      rotateKeys: true,
      activeApiKeyId: 'key2',
      apiKeys: {
        key1: { key: 'sk-alpha', name: 'work', proxyUrl: 'http://127.0.0.1:8081' },
        key2: { key: 'sk-beta', name: 'personal' },
      },
    });

    const written = configToTomlData(config) as {
      providers: Record<string, Record<string, unknown>>;
    };
    expect(written.providers['kilo']).toMatchObject({
      rotate_keys: true,
      active_api_key_id: 'key2',
    });
    expect(written.providers['kilo']?.['api_keys']).toEqual({
      key1: { key: 'sk-alpha', name: 'work', proxy_url: 'http://127.0.0.1:8081' },
      key2: { key: 'sk-beta', name: 'personal' },
    });
  });
});
