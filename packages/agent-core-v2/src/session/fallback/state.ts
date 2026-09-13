import { defineState } from '#/state/state';

export interface ActiveFallbackModel {
  readonly alias: string;
  readonly tier: 'primary' | 'secondary';
  readonly forModelAlias: string | undefined;
}

export const fallbackModelActiveKey = defineState<ActiveFallbackModel | undefined>(
  'fallbackModel.active',
  () => undefined,
);
