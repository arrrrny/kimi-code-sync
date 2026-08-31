import type { ManagedKimiCodeModelInfo } from './managed-kimi-code';
import { isRecord } from './utils';

// Honor a provider-supplied context length (OpenRouter's `context_length`,
// OpenAI's `context_window`) when present. When the value is missing or
// invalid the model's context is reported as `undefined` (unknown) rather
// than a guessed default, so a provider refresh cannot clobber a user's
// curated `maxContextSize` (e.g. from a models.dev catalog import). The 128K
// default in `OPENAI_COMPATIBLE_DEFAULT_CONTEXT` is applied downstream only
// when neither the provider nor an existing alias supplies a context size.
export const OPENAI_COMPATIBLE_DEFAULT_CONTEXT = 131072;

export interface FetchOpenAIProviderModelsOptions {
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
  readonly userAgent?: string;
}

/**
 * Fetches the model list from an OpenAI-compatible provider's `/models`
 * endpoint and normalizes it to {@link ManagedKimiCodeModelInfo}. OpenAI's wire
 * shape is `{ data: [{ id }] }`; some gateways report `object: 'model'` per
 * entry, which we tolerate. Providers that do not serve a recognizable
 * `/models` contract throw so the caller can report the failure instead of
 * silently skipping the provider.
 */
export async function fetchOpenAIProviderModels(
  baseUrl: string,
  apiKey: string,
  options: FetchOpenAIProviderModelsOptions = {},
): Promise<ManagedKimiCodeModelInfo[]> {
  const { signal = AbortSignal.timeout(15_000), fetchImpl = fetch, userAgent } = options;
  const trimmedBase = (baseUrl ?? '').replace(/\/+$/, '');
  if (trimmedBase.length === 0) {
    throw new Error('Provider baseUrl is empty; cannot fetch models.');
  }
  const url = `${trimmedBase}/models`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  if (userAgent !== undefined) {
    headers['User-Agent'] = userAgent;
  }
  const init: RequestInit = { headers };
  if (signal !== undefined) init.signal = signal;

  const response = await fetchImpl(url, init);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Failed to fetch OpenAI-compatible models from ${url} (HTTP ${response.status})${text ? `: ${text}` : ''}`,
    );
  }
  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload['data'])) {
    throw new Error(`Unexpected models response from ${url}: expected { data: [...] }.`);
  }

  const out: ManagedKimiCodeModelInfo[] = [];
  for (const raw of payload['data']) {
    if (!isRecord(raw)) continue;
    const id = raw['id'];
    if (typeof id !== 'string' || id.length === 0) continue;
    const rawCtx = raw['context_length'] ?? raw['context_window'];
    const parsedCtx = Number(rawCtx);
    const contextLength =
      Number.isInteger(parsedCtx) && parsedCtx > 0 ? parsedCtx : undefined;
    out.push({
      id,
      contextLength,
      supportsReasoning: false,
      supportsImageIn: false,
      supportsVideoIn: false,
      supportsToolUse: true,
    });
  }
  return out;
}
