import type { FormatRequestInput } from '#/llm/protocol/format';

const OPENCODE_HOSTNAME = 'opencode.ai';
const OPENCODE_CLIENT_USER_AGENT = 'opencode/1.17.0';
const OPENCODE_SESSION_PREFIX = 'ses_';
const OPENCODE_SESSION_LENGTH = 26;
const OPENCODE_SESSION_FILL = '0';

function encodeOpencodeSessionId(cacheKey: string): string {
  const hex = cacheKey
    .toLowerCase()
    .replace(/^(?:ses|session)_/, '')
    .replaceAll(/[^0-9a-f]/g, '');
  const truncated = hex.slice(0, OPENCODE_SESSION_LENGTH);
  return `${OPENCODE_SESSION_PREFIX}${truncated.padEnd(OPENCODE_SESSION_LENGTH, OPENCODE_SESSION_FILL)}`;
}

function isOpencodeEndpoint(baseUrl: string | undefined): boolean {
  if (baseUrl === undefined) return false;
  let hostname: string;
  try {
    ({ hostname } = new URL(baseUrl));
  } catch {
    return false;
  }
  return hostname === OPENCODE_HOSTNAME || hostname.endsWith(`.${OPENCODE_HOSTNAME}`);
}

export function opencodeSessionHeaders(
  input: FormatRequestInput,
): Record<string, string> | undefined {
  const { cacheKey } = input;
  if (cacheKey === undefined) return undefined;
  const sessionHeaders: Record<string, string> = {
    'x-opencode-session': encodeOpencodeSessionId(cacheKey),
  };
  if (!isOpencodeEndpoint(input.model.baseUrl)) return sessionHeaders;
  return { ...sessionHeaders, 'User-Agent': OPENCODE_CLIENT_USER_AGENT };
}
