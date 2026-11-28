import { isRecord } from './utils';

interface ModelsDevModelEntry {
  readonly id?: string;
  readonly name?: string;
  readonly limit?: { readonly context?: number; readonly input?: number; readonly output?: number };
  readonly tool_call?: boolean;
  readonly reasoning?: boolean;
  readonly status?: string;
  readonly interleaved?: boolean | { readonly field?: string };
  readonly modalities?: { readonly input?: readonly string[]; readonly output?: readonly string[] };
  readonly family?: string;
}

interface ModelsDevProviderEntry {
  readonly models?: Record<string, ModelsDevModelEntry>;
}

type ModelsDevCatalog = Record<string, ModelsDevProviderEntry>;

export interface ModelsDevModelInfo {
  readonly displayName?: string;
  readonly capabilities?: string[];
  readonly context?: number;
  readonly reasoningKey?: string;
}

const MODELS_DEV_URL = 'https://models.dev/api.json';

declare const __KIMI_CODE_BUILT_IN_CATALOG__: string | undefined;

function loadBuiltInCatalog(): ModelsDevCatalog | undefined {
  const text =
    typeof __KIMI_CODE_BUILT_IN_CATALOG__ === 'string' ? __KIMI_CODE_BUILT_IN_CATALOG__ : undefined;
  if (typeof text !== 'string' || text.length === 0) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? (parsed as ModelsDevCatalog) : undefined;
  } catch {
    return undefined;
  }
}

let catalogMemo: ModelsDevCatalog | undefined | null = null;

function builtInCatalog(): ModelsDevCatalog | undefined {
  if (catalogMemo === null) catalogMemo = loadBuiltInCatalog();
  return catalogMemo;
}

function toCapabilities(model: ModelsDevModelEntry): string[] | undefined {
  const caps = new Set<string>();
  const inputs = model.modalities?.input ?? [];
  if (inputs.includes('image')) caps.add('image_in');
  if (inputs.includes('video')) caps.add('video_in');
  if (inputs.includes('audio')) caps.add('audio_in');
  if (Boolean(model.reasoning) || model.reasoning !== undefined) caps.add('thinking');
  caps.add('tool_use');
  if (model.status === 'deprecated' || model.status === 'alpha') return [];
  return caps.size > 0 ? [...caps] : undefined;
}

function toReasoningKey(model: ModelsDevModelEntry): string | undefined {
  const interleaved = model.interleaved;
  if (typeof interleaved !== 'object' || interleaved === null) return undefined;
  const field = interleaved.field?.trim();
  return field !== undefined && field.length > 0 ? field : undefined;
}

function entryFor(catalog: ModelsDevCatalog, providerId: string): ModelsDevProviderEntry | undefined {
  if (!isRecord(catalog[providerId])) return undefined;
  return catalog[providerId] as ModelsDevProviderEntry;
}

function modelInfoFrom(
  entry: ModelsDevProviderEntry | undefined,
  modelId: string,
): ModelsDevModelInfo | undefined {
  if (entry?.models === undefined) return undefined;
  const raw = entry.models[modelId];
  if (!isRecord(raw)) return undefined;
  const rawName = raw['name'];
  const displayName =
    typeof rawName === 'string' && rawName.length > 0 ? rawName : undefined;
  const capabilities = toCapabilities(raw as ModelsDevModelEntry);
  const reasoningKey = toReasoningKey(raw as ModelsDevModelEntry);
  const limit = isRecord(raw['limit']) ? (raw['limit'] as Record<string, unknown>) : undefined;
  const rawContext = limit?.['context'];
  const context = typeof rawContext === 'number' && rawContext > 0 ? rawContext : undefined;
  if (
    displayName === undefined &&
    capabilities === undefined &&
    context === undefined &&
    reasoningKey === undefined
  ) {
    return undefined;
  }
  return {
    ...(displayName !== undefined ? { displayName } : {}),
    ...(capabilities !== undefined ? { capabilities } : {}),
    ...(context !== undefined ? { context } : {}),
    ...(reasoningKey !== undefined ? { reasoningKey } : {}),
  };
}

const FALLBACK_PROVIDER_IDS: readonly string[] = ['opencode'];

function lookupInEntry(
  entry: ModelsDevProviderEntry | undefined,
  modelId: string,
): ModelsDevModelInfo | undefined {
  if (entry === undefined) return undefined;
  return (
    modelInfoFrom(entry, modelId) ??
    modelInfoFrom(entry, modelId.replace(/:free$/i, '')) ??
    modelInfoFrom(entry, modelId.replace(/-free$/i, ''))
  );
}

export function lookupModelsDevModel(
  providerId: string,
  modelId: string,
): ModelsDevModelInfo | undefined {
  const catalog = builtInCatalog();
  if (catalog === undefined) return undefined;
  const own = lookupInEntry(entryFor(catalog, providerId), modelId);
  if (own !== undefined) return own;
  for (const fallbackId of FALLBACK_PROVIDER_IDS) {
    if (fallbackId === providerId) continue;
    const fallback = lookupInEntry(entryFor(catalog, fallbackId), modelId);
    if (fallback !== undefined) return fallback;
  }
  let firstCandidate: ModelsDevModelInfo | undefined;
  const candidateContexts = new Set<number>();
  for (const id of Object.keys(catalog)) {
    if (id === providerId || FALLBACK_PROVIDER_IDS.includes(id)) continue;
    const candidate = lookupInEntry(entryFor(catalog, id), modelId);
    if (candidate === undefined) continue;
    firstCandidate ??= candidate;
    if (candidate.context !== undefined) candidateContexts.add(candidate.context);
  }
  if (firstCandidate === undefined) return undefined;
  const context =
    candidateContexts.size === 1 ? candidateContexts.values().next().value : undefined;
  const { displayName, capabilities, reasoningKey } = firstCandidate;
  return {
    ...(displayName !== undefined ? { displayName } : {}),
    ...(capabilities !== undefined ? { capabilities } : {}),
    ...(context !== undefined ? { context } : {}),
    ...(reasoningKey !== undefined ? { reasoningKey } : {}),
  };
}

export async function refreshModelsDevCatalog(
  fetchImpl: typeof fetch = fetch,
  userAgent?: string,
): Promise<ModelsDevCatalog> {
  const builtIn = builtInCatalog();
  try {
    const res = await fetchImpl(MODELS_DEV_URL, {
      headers: {
        Accept: 'application/json',
        ...(userAgent !== undefined ? { 'User-Agent': userAgent } : {}),
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return builtIn ?? {};
    const payload: unknown = await res.json();
    if (!isRecord(payload)) return builtIn ?? {};
    catalogMemo = payload as ModelsDevCatalog;
    return catalogMemo;
  } catch {
    return builtIn ?? {};
  }
}
