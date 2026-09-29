import { renderPrompt } from '#/_base/utils/render-prompt';

import handoffInstructionTemplate from './handoff-instruction.md?raw';

export interface HandoffInstructionInput {
  readonly previousHandoffPath?: string;
  readonly customInstruction?: string;
}

export function renderHandoffPointerFooter(path: string): string {
  return [
    'A structured handoff document for this session was written to disk before this compaction:',
    path,
    '',
    'You are resuming this same task, not starting a new one, and nothing above this note records it in full.',
    'Your first action — before any other tool call, and before answering the user — is to read that file end to end.',
    'It holds the session gist, the current state, every open thread with its concrete next action, the gotchas already paid for, the files and artifacts touched, and the open questions.',
    'Then work its threads in the order it gives them, and re-check its gotchas before anything destructive.',
    'If it names a process, server, branch, or checkout, confirm that is still live before you touch it.',
    'Do not begin the in-flight work until you have read it.',
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
