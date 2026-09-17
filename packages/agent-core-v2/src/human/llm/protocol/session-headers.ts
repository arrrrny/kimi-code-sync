import { createHash } from 'node:crypto';

import type { FormatRequestInput } from '#/llm/protocol/format';

const OPENCODE_HOSTNAME = 'opencode.ai';
const OPENCODE_CLIENT_USER_AGENT = 'opencode/1.17.0';
const OPENCODE_SESSION_PREFIX = 'ses_';
const OPENCODE_SESSION_LENGTH = 26;
const OPENCODE_SESSION_FILL = '0';
const OPENCODE_KEY_FINGERPRINT_LENGTH = 6;

function sessionHex(cacheKey: string): string {
  return cacheKey
    .toLowerCase()
    .replace(/^(?:ses|session)_/, '')
    .replaceAll(/[^0-9a-f]/g, '');
}

function keyFingerprint(apiKey: string | undefined): string {
  if (apiKey === undefined || apiKey.length === 0) return '';
  return createHash('sha256').update(apiKey).digest('hex').slice(0, OPENCODE_KEY_FINGERPRINT_LENGTH);
}

function encodeOpencodeSessionId(cacheKey: string, apiKey: string | undefined): string {
  const fingerprint = keyFingerprint(apiKey);
  const sessionLength = OPENCODE_SESSION_LENGTH - fingerprint.length;
  const truncated = sessionHex(cacheKey).slice(0, sessionLength);
  const session = truncated.padEnd(sessionLength, OPENCODE_SESSION_FILL);
  return `${OPENCODE_SESSION_PREFIX}${session}${fingerprint}`;
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
    'x-opencode-session': encodeOpencodeSessionId(cacheKey, input.model.apiKey),
  };
  if (!isOpencodeEndpoint(input.model.baseUrl)) return sessionHeaders;
  return { ...sessionHeaders, 'User-Agent': OPENCODE_CLIENT_USER_AGENT };
}
