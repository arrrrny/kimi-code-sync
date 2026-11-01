import { sha256Hex } from '#/utils/hash';

const OPENCODE_HOSTNAME = 'opencode.ai';
const OPENCODE_CLIENT_USER_AGENT = 'opencode/1.17.0';
const OPENCODE_SESSION_PREFIX = 'ses_';
const OPENCODE_SESSION_LENGTH = 26;
const OPENCODE_KEY_FINGERPRINT_LENGTH = 6;

function keyFingerprint(apiKey: string | undefined): string {
  if (apiKey === undefined || apiKey.length === 0) return '';
  return sha256Hex(new TextEncoder().encode(apiKey)).slice(0, OPENCODE_KEY_FINGERPRINT_LENGTH);
}

function encodeOpencodeSessionId(cacheKey: string, apiKey: string | undefined): string {
  const fingerprint = keyFingerprint(apiKey);
  const sessionLength = OPENCODE_SESSION_LENGTH - fingerprint.length;
  const session = sha256Hex(new TextEncoder().encode(cacheKey)).slice(0, sessionLength);
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

export interface OpencodeSessionInput {
  readonly cacheKey?: string;
  readonly apiKey?: string;
  readonly baseUrl?: string;
}

export function opencodeSessionHeaders(
  input: OpencodeSessionInput,
): Record<string, string> | undefined {
  const { cacheKey } = input;
  if (cacheKey === undefined) return undefined;
  const sessionHeaders: Record<string, string> = {
    'x-opencode-session': encodeOpencodeSessionId(cacheKey, input.apiKey),
  };
  if (!isOpencodeEndpoint(input.baseUrl)) return sessionHeaders;
  return { ...sessionHeaders, 'User-Agent': OPENCODE_CLIENT_USER_AGENT };
}
