import { registerErrorDomain, type ErrorDomain } from '#/_base/errors/codes';

export const FullCompactionErrors = {
  codes: {
    COMPACTION_FAILED: 'compaction.failed',
    COMPACTION_UNABLE: 'compaction.unable',
    COMPACTION_CANCELLED: 'compaction.cancelled',
  },
} as const satisfies ErrorDomain;

registerErrorDomain(FullCompactionErrors);
