import type { LlmRemoteErrorMessage } from '#/llm/errors';
import type { LlmRecovery, LlmRecoveryRecord } from '#/llm/requester/recovery';
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

function detailOf(controller: LlmKeyRotationController, keyId: string, name: string): string {
  return `${controller.providerName} → ${name} (${keyId})`;
}

export const keyRotationRecovery: LlmRecovery = {
  propose: ({ error, appliedRecoveries, attempt, maxAttempts, credentialProvider }) => {
    const controller = credentialProvider?.rotation?.();
    if (controller === undefined) return undefined;
    if (!qualifies(error, attempt, maxAttempts)) return undefined;
    if (rotationCount(appliedRecoveries) >= controller.keyCount - 1) return undefined;
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
};
