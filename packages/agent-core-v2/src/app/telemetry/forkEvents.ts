import type { ITelemetryService } from './telemetry';
import {
  type TelemetryEventDefinition,
  defineAgentTelemetryEvent,
  telemetryEventDefinitions,
} from './events';

export interface CompactionThresholdOverrideEvent {
  action: 'set' | 'clear';
  ratio?: number;
}

export interface CompactionTokenBudgetOverrideEvent {
  action: 'set' | 'clear';
  tokens?: number;
}

export interface SubstituteModelActivatedEvent {
  original_model: string;
  substitute_model: string;
}

export interface SubstituteModelDeactivatedEvent {
  original_model: string;
}

export const forkTelemetryEventDefinitions = {
  ...telemetryEventDefinitions,
  compaction_threshold_override: defineAgentTelemetryEvent<CompactionThresholdOverrideEvent>({
    owner: 'kimi-code',
    comment: 'The compaction threshold ratio is set or cleared by the user.',
    properties: {
      action: 'Whether the threshold was set or cleared',
      ratio: 'The threshold ratio when set (0-1)',
    },
  }),
  compaction_token_budget_override: defineAgentTelemetryEvent<CompactionTokenBudgetOverrideEvent>({
    owner: 'kimi-code',
    comment: 'The compaction absolute token budget is set or cleared by the user.',
    properties: {
      action: 'Whether the budget was set or cleared',
      tokens: 'The token budget when set',
    },
  }),
  substitute_model_activated: defineAgentTelemetryEvent<SubstituteModelActivatedEvent>({
    owner: 'kimi-code',
    comment: 'A substitute model is activated due to a primary model rate limit.',
    properties: {
      original_model: 'The primary model that was rate-limited',
      substitute_model: 'The substitute model that was activated',
    },
  }),
  substitute_model_deactivated: defineAgentTelemetryEvent<SubstituteModelDeactivatedEvent>({
    owner: 'kimi-code',
    comment: 'The substitute model is deactivated and the primary model resumes.',
    properties: {
      original_model: 'The primary model that resumes',
    },
  }),
} as const;

export type ForkTelemetryEventName = keyof typeof forkTelemetryEventDefinitions;

export type ForkTelemetryEventPayload<K extends ForkTelemetryEventName> =
  typeof forkTelemetryEventDefinitions[K] extends TelemetryEventDefinition<infer P>
    ? P
    : never;

const FORK_EVENT_NAMES = new Set<string>([
  'compaction_threshold_override',
  'compaction_token_budget_override',
  'substitute_model_activated',
  'substitute_model_deactivated',
]);

export function forkTrack2(
  telemetry: ITelemetryService,
  event: string,
  properties?: Record<string, unknown>,
): void {
  if (!FORK_EVENT_NAMES.has(event)) {
    throw new Error(`Unknown fork telemetry event: ${event}`);
  }
  (telemetry as { track2(event: string, properties?: Record<string, unknown>): void }).track2(
    event,
    properties,
  );
}
