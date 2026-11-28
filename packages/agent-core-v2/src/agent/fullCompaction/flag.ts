import { type FlagDefinitionInput, registerFlagDefinition } from '#/app/flag/flagRegistry';

export const COMPACTION_HANDOFF_FLAG_ID = 'compaction-handoff';
export const COMPACTION_HANDOFF_FLAG_ENV = 'KIMI_CODE_EXPERIMENTAL_COMPACTION_HANDOFF';

export const compactionHandoffFlag: FlagDefinitionInput = {
  id: COMPACTION_HANDOFF_FLAG_ID,
  title: 'Handoff document before auto-compaction',
  description:
    'Before an automatic context compaction replaces the history, generate a structured handoff document (session gist, current state, open threads with next actions, gotchas, files touched, open questions), persist it beside the session records, and point the post-compaction summary and clients at it.',
  env: COMPACTION_HANDOFF_FLAG_ENV,
  default: false,
  surface: 'core',
};

registerFlagDefinition(compactionHandoffFlag);
