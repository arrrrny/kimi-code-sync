import { isRecord } from './utils';
import type { ManagedKimiModelAlias, ManagedKimiModelAliasOverrides } from './managed-kimi-code';

export const MANAGED_KIMI_MODEL_FIELDS: ReadonlySet<string> = new Set([
  'provider',
  'model',
  'maxContextSize',
  'capabilities',
  'displayName',
  'protocol',
  'betaApi',
  'adaptiveThinking',
  'supportEfforts',
  'defaultEffort',
]);

export const CUSTOM_REGISTRY_MODEL_FIELDS: ReadonlySet<string> = new Set([
  'provider',
  'model',
  'maxContextSize',
  'maxOutputSize',
  'capabilities',
  'displayName',
  'supportEfforts',
  'defaultEffort',
  'upgrade',
]);

const OPENAI_COMPATIBLE_REFRESHED_FIELDS: ReadonlySet<string> = new Set([
  'provider',
  'model',
  'maxContextSize',
  'maxOutputSize',
  'displayName',
]);

const CURATED_DERIVED_FIELDS = ['displayName', 'reasoningKey'] as const;

function cloneOverrides(
  overrides: ManagedKimiModelAliasOverrides | undefined,
): ManagedKimiModelAliasOverrides | undefined {
  if (overrides === undefined) return undefined;
  return structuredClone(overrides);
}

function userExtras(
  existing: Record<string, unknown>,
  remoteOwnedFields: ReadonlySet<string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(existing)) {
    if (key === 'overrides') continue;
    if (!remoteOwnedFields.has(key)) out[key] = value;
  }
  return out;
}

export function mergeRefreshedModelAlias(
  existing: unknown,
  remote: ManagedKimiModelAlias,
  remoteOwnedFields: ReadonlySet<string>,
): ManagedKimiModelAlias {
  const current = isRecord(existing) ? existing : {};
  const overrides = cloneOverrides(
    isRecord(current['overrides'])
      ? (current['overrides'] as ManagedKimiModelAliasOverrides)
      : undefined,
  );
  return {
    ...userExtras(current, remoteOwnedFields),
    ...remote,
    ...(overrides !== undefined ? { overrides } : {}),
  };
}

export function mergeOpenAiCompatibleModelAlias(
  existing: unknown,
  remote: ManagedKimiModelAlias,
): ManagedKimiModelAlias {
  const current = isRecord(existing) ? existing : {};
  const capabilities = mergeCapabilities(current['capabilities'], remote.capabilities);
  const merged = mergeRefreshedModelAlias(current, remote, OPENAI_COMPATIBLE_REFRESHED_FIELDS);
  if (capabilities !== undefined) merged.capabilities = capabilities;
  else delete merged.capabilities;
  for (const field of CURATED_DERIVED_FIELDS) {
    if (merged[field] === undefined && current[field] !== undefined) {
      (merged as Record<string, unknown>)[field] = current[field];
    }
  }
  return merged;
}

function mergeCapabilities(
  curated: unknown,
  catalog: readonly string[] | undefined,
): string[] | undefined {
  if (catalog !== undefined && catalog.length === 0) return undefined;
  const out = new Set<string>();
  if (Array.isArray(curated)) {
    for (const entry of curated) {
      if (typeof entry === 'string' && entry.length > 0) out.add(entry);
    }
  }
  for (const entry of catalog ?? []) out.add(entry);
  return out.size > 0 ? [...out] : undefined;
}
