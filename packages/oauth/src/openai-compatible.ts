import type { ManagedKimiCodeModelInfo } from './managed-kimi-code';
import { isRecord } from './utils';

export const OPENAI_COMPATIBLE_DEFAULT_CONTEXT = 262144;

export interface FetchOpenAIProviderModelsOptions {
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
  readonly userAgent?: string;
}

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
    const reportedContextLength =
      Number.isInteger(parsedCtx) && parsedCtx > 0 ? parsedCtx : undefined;
    const contextLength = reportedContextLength ?? OPENAI_COMPATIBLE_DEFAULT_CONTEXT;
    const topProviderMaxOutputSize = isRecord(raw['top_provider'])
      ? positiveInteger(raw['top_provider']['max_completion_tokens'])
      : undefined;
    const bareMaxTokens = positiveInteger(raw['max_tokens']);
    const reportedMaxOutputSize =
      topProviderMaxOutputSize ??
      (bareMaxTokens !== undefined &&
      (reportedContextLength === undefined || bareMaxTokens < reportedContextLength)
        ? bareMaxTokens
        : undefined);
    const rawName = raw['name'];
    const displayName = typeof rawName === 'string' && rawName.length > 0 ? rawName : undefined;
    out.push({
      id,
      contextLength,
      ...(reportedContextLength !== undefined ? { reportedContextLength } : {}),
      ...(reportedMaxOutputSize !== undefined ? { reportedMaxOutputSize } : {}),
      displayName,
      supportsReasoning: false,
      supportsImageIn: false,
      supportsVideoIn: false,
      supportsToolUse: true,
    });
  }
  return out;
}

function positiveInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
