import type {
  LlmRecovery,
  LlmRecoveryContext,
  LlmRecoveryEntry,
  LlmRecoveryRecord,
} from '@moonshot-ai/core/llm/policy/recovery';
import type { LlmErrorMessage } from '@moonshot-ai/core/llm/response';
import type { LlmRequest, LlmRequestModel, ThinkingRequestOptions } from '@moonshot-ai/core/llm/request';

import type { IConfigService } from '#/app/config/config';
import type { IFlagService } from '#/app/flag/flag';
import { resolveFallbackModel } from './configSection';

export const FALLBACK_MODEL_STRATEGY = 'fallback_model';

const API_KEY_ROTATION_STRATEGY = 'api_key_rotation';

export interface FallbackModelSwap {
  readonly model: LlmRequestModel;
  readonly protocol?: LlmRequest['protocol'];
}

export interface FallbackModelRecoveryDeps {
  readonly config: IConfigService;
  readonly flags: IFlagService;
  readonly resolveSwap: (
    request: LlmRequest,
    alias: string,
    thinking?: ThinkingRequestOptions['effort'],
  ) => FallbackModelSwap;
}

const FALLBACK_ELIGIBLE_KINDS: ReadonlySet<LlmErrorMessage['kind']> = new Set([
  'provider',
  'timeout',
  'connection',
  'quota_exhausted',
]);

function statusCodeOf(error: LlmErrorMessage): number | undefined {
  return (error as { readonly statusCode?: number }).statusCode;
}

function isAuthRejection(error: LlmErrorMessage): boolean {
  if (error.kind === 'auth') return true;
  return error.kind === 'status' && (statusCodeOf(error) === 401 || statusCodeOf(error) === 403);
}

function isRotationEligible(error: LlmErrorMessage): boolean {
  return error.kind === 'rate_limit' || isAuthRejection(error);
}

function rotationCount(applied: readonly LlmRecoveryRecord[]): number {
  return applied.filter(
    (record) => record.strategy === API_KEY_ROTATION_STRATEGY && record.failed !== true,
  ).length;
}

function rotationAvailable(ctx: LlmRecoveryContext): boolean {
  const controller = ctx.endpoint?.credentials?.rotation?.();
  if (controller === undefined) return false;
  return rotationCount(ctx.appliedRecoveries) < controller.keyCount - 1;
}

function triedAliases(ctx: LlmRecoveryContext): Set<string> {
  const tried = new Set<string>([ctx.request.model.spec.name]);
  for (const record of ctx.appliedRecoveries) {
    if (record.strategy === FALLBACK_MODEL_STRATEGY) tried.add(record.action);
  }
  return tried;
}

export function createFallbackModelRecovery(deps: FallbackModelRecoveryDeps): LlmRecovery {
  return {
    propose: (ctx) => {
      const fallback = resolveFallbackModel(deps.config, deps.flags);
      if (fallback === undefined) return undefined;

      if (isRotationEligible(ctx.error)) {
        if (rotationAvailable(ctx)) return undefined;
      } else if (!FALLBACK_ELIGIBLE_KINDS.has(ctx.error.kind)) {
        return undefined;
      }

      const tried = triedAliases(ctx);
      const thinking = ctx.request.model.thinking?.effort;
      for (const alias of [fallback.model, fallback.secondaryModel]) {
        if (alias === undefined || tried.has(alias)) continue;
        let swap: FallbackModelSwap;
        try {
          swap = deps.resolveSwap(ctx.request, alias, thinking);
        } catch {
          tried.add(alias);
          continue;
        }
        const entry: LlmRecoveryEntry = {
          strategy: FALLBACK_MODEL_STRATEGY,
          action: alias,
          detail: `${ctx.request.model.spec.name} → ${alias}`,
          rewrite: (request) => ({
            ...request,
            model: swap.model,
            protocol: swap.protocol ?? request.protocol,
          }),
        };
        return entry;
      }
      return undefined;
    },
  };
}