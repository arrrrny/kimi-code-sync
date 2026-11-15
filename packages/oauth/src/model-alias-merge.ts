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

/**
 * Which aliases the OpenAI-compatible catalog refresh (`/refresh-catalog`)
 * owns: the ones the refresh generated under `${providerId}/`. The provider's
 * `baseUrl` / `model` pointers, `maxContextSize`, `capabilities`, `displayName`
 * and `maxOutputSize` are all derived from the `/models` response and the
 * models.dev catalog, so the refresh overwrites them.
 *
 * What is NOT in this set stays untouched — a user's `overrides` block and any
 * extra key they added to the alias (e.g. `upgrade`).
 */
const OPENAI_COMPATIBLE_REFRESHED_FIELDS: ReadonlySet<string> = new Set([
  'provider',
  'model',
  'maxContextSize',
  'maxOutputSize',
  'displayName',
  'supportEfforts',
  'defaultEffort',
]);

/**
 * Fields the refresh writes only when it actually learned something, and
 * otherwise leaves as the user curated them.
 *
 * An OpenAI-compatible `/models` endpoint reports no reasoning metadata at all
 * (`fetchOpenAIProviderModels` fills in `supportsReasoning: false` and no
 * efforts), and models.dev has no entry for a private model id — so for these
 * fields "the remote said nothing" means *unknown*, not *removed*. Overwriting
 * a curated set with that absence is the data loss this guards against: it
 * downgrades the model from `low|high|max` to the UI's default thinking on/off
 * toggle, and drops `thinking` from `capabilities` so a reasoning model looks
 * non-reasoning entirely.
 *
 * When the catalog does declare a value it still wins — the remote answer
 * outranks the curated one. `capabilities` is the exception: it is unioned
 * rather than replaced, because the curated set is not a claim about what the
 * catalog said, it is the union of what the user saw work and what the catalog
 * contributed earlier. A catalog that knows nothing must not subtract from it,
 * and a catalog that knows more must still add.
 */
const CURATED_DERIVED_FIELDS = [
  'displayName',
  'supportEfforts',
  'defaultEffort',
  'reasoningKey',
] as const;

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

/**
 * Merge one `/refresh-catalog` model entry into the alias map, keeping the
 * fields the remote genuinely declared and the curated ones it said nothing
 * about.
 *
 * `remote` is built from the provider's `/models` response plus the models.dev
 * catalog, so a field the provider omitted is `undefined` on it. For the
 * curated derived fields that means "unknown", not "removed" — dropping them
 * would let a refresh erase the user's effort ladder or reasoning field.
 * Everything else (provider / model / context / display name) already has a
 * defined fallback and is taken from `remote` as-is.
 *
 * `capabilities` is unioned: the catalog's answer adds to the curated set, and
 * an empty catalog answer leaves it alone.
 */
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

/**
 * Union of the curated and catalog capability lists, in that order so a curated
 * `thinking` stays ahead of a catalog `tool_use`. Returns `undefined` only when
 * neither side declared anything.
 */
function mergeCapabilities(
  curated: unknown,
  catalog: readonly string[] | undefined,
): string[] | undefined {
  const out = new Set<string>();
  if (Array.isArray(curated)) {
    for (const entry of curated) {
      if (typeof entry === 'string' && entry.length > 0) out.add(entry);
    }
  }
  for (const entry of catalog ?? []) out.add(entry);
  return out.size > 0 ? [...out] : undefined;
}
