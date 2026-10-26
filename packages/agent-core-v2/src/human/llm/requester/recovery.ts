import type { LlmRemoteErrorMessage } from '#/llm/errors';
import type { Message } from '#/llm/message';
import type { LlmCredentialProvider } from '#/llm/requester/requester';

export interface LlmRecoveryRecord {
  readonly strategy: string;
  readonly action: string;
  readonly detail?: string;
  readonly failed?: boolean;
}

export interface LlmRecoveryContext {
  readonly error: LlmRemoteErrorMessage;
  readonly messages: readonly Message[];
  readonly appliedRecoveries: readonly LlmRecoveryRecord[];
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly credentialProvider?: LlmCredentialProvider;
}

export interface LlmRecoveryProposal {
  readonly action: string;
  readonly detail?: string;
  readonly attemptMessageOverride?: readonly Message[];
  readonly beforeNextAttempt?: () => void | Promise<void>;
}

export interface LlmRecovery {
  propose(ctx: LlmRecoveryContext): (LlmRecoveryProposal & LlmRecoveryRecord) | undefined;
  exhausted?(ctx: LlmRecoveryContext): LlmRecoveryRecord | undefined;
}
