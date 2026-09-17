import type { LlmRemoteErrorMessage } from '#/llm/errors';
import type { LlmRecovery, LlmRecoveryContext, LlmRecoveryRecord } from '#/llm/requester/recovery';
import type { LlmKeyRotationController } from '#/llm/requester/requester';

export const API_KEY_ROTATION_STRATEGY = 'api_key_rotation';

function rotationCount(appliedRecoveries: readonly LlmRecoveryRecord[]): number {
  return appliedRecoveries.filter((record) => record.strategy === API_KEY_ROTATION_STRATEGY).length;
}

function qualifies(error: LlmRemoteErrorMessage, attempt: number, maxAttempts: number): boolean {
  if (error.kind === 'rate_limit') {
    return attempt >= maxAttempts;
  }
  return error.kind === 'status' && error.statusCode === 403;
}

function eligible(ctx: LlmRecoveryContext): LlmKeyRotationController | undefined {
  const controller = ctx.credentialProvider?.rotation?.();
  if (controller === undefined) return undefined;
  return qualifies(ctx.error, ctx.attempt, ctx.maxAttempts) ? controller : undefined;
}

function spent(ctx: LlmRecoveryContext, controller: LlmKeyRotationController): boolean {
  return rotationCount(ctx.appliedRecoveries) >= controller.keyCount - 1;
}

function detailOf(controller: LlmKeyRotationController, keyId: string, name: string): string {
  return `${controller.providerName} → ${name} (${keyId})`;
}

function exhaustedDetailOf(controller: LlmKeyRotationController): string {
  return `${controller.providerName}: all ${controller.keyCount} configured keys were tried`;
}

export const keyRotationRecovery: LlmRecovery = {
  propose: (ctx) => {
    const controller = eligible(ctx);
    if (controller === undefined) return undefined;
    if (spent(ctx, controller)) return undefined;
    const target = controller.plan();
    if (target === undefined) return undefined;
    return {
      strategy: API_KEY_ROTATION_STRATEGY,
      action: target.keyId,
      detail: detailOf(controller, target.keyId, target.name),
      beforeNextAttempt: async () => {
        await controller.rotate(target.keyId);
      },
    };
  },
  exhausted: (ctx) => {
    const controller = eligible(ctx);
    if (controller === undefined) return undefined;
    if (!spent(ctx, controller)) return undefined;
    return {
      strategy: API_KEY_ROTATION_STRATEGY,
      action: 'exhausted',
      detail: exhaustedDetailOf(controller),
    };
  },
};
