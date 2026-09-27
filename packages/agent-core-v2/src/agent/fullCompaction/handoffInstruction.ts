import { renderPrompt } from '#/_base/utils/render-prompt';

import handoffInstructionTemplate from './handoff-instruction.md?raw';

export interface HandoffInstructionInput {
  readonly previousHandoffPath?: string;
  readonly customInstruction?: string;
}

export function renderHandoffPointerFooter(path: string): string {
  return [
    'A full handoff document for this session was saved before this compaction:',
    path,
    'Read it first when resuming: it records the session gist, current state, open threads with their next actions, gotchas, files and artifacts touched, and open questions.',
  ].join('\n');
}

export function renderHandoffInstruction(input: HandoffInstructionInput): string {
  const previousHandoffPath = input.previousHandoffPath?.trim() ?? '';
  const customInstruction = input.customInstruction?.trim() ?? '';
  return renderPrompt(handoffInstructionTemplate, {
    resume_from_block:
      previousHandoffPath.length > 0
        ? [
            'An earlier handoff document from this session already exists on disk at:',
            previousHandoffPath,
            'Begin the document with a `## Resume from` section that names that file and adds one line on what changed since it was written.',
            '',
          ].join('\n')
        : [
            'No earlier handoff document exists in this session, so omit the `## Resume from` section entirely.',
            '',
          ].join('\n'),
    custom_instruction_block:
      customInstruction.length > 0 ? `\nOptional user instruction:\n${customInstruction}\n` : '',
  }).trimEnd();
}
