/* oxlint-disable typescript-eslint/no-unsafe-declaration-merging -- Event2 class+payload-interface declaration merging is the sanctioned event-declaration idiom. */
import { z } from 'zod';

import { AgentEvent2 } from '#/app/event/event2';
import { defineState } from '#/state/state';

export interface SqueezeModelDecision {
  readonly agentId: string;
  readonly model: string;
  readonly modelDisplay?: string;
}

const squeezeModelDecidedSchema = z.object({
  agentId: z.string(),
  model: z.string(),
  modelDisplay: z.string().optional(),
});

export class SqueezeModelDecided extends AgentEvent2<
  z.infer<typeof squeezeModelDecidedSchema>
> {
  static override readonly type = 'squeeze_model.decided';
  static override readonly durable = true;
  static override readonly schema = squeezeModelDecidedSchema;
}
export interface SqueezeModelDecided {
  readonly agentId: string;
  readonly model: string;
  readonly modelDisplay?: string;
}

export interface SqueezeModelState {
  readonly model: string;
  readonly modelDisplay?: string;
}

export const squeezeModelKey = defineState<SqueezeModelState>(
  'squeezeModel',
  () => ({ model: '' }),
).replayable({ schema: z.custom<SqueezeModelState>() })
  .on(SqueezeModelDecided, (s, e) => {
    s.model = e.model;
    s.modelDisplay = e.modelDisplay;
  });
