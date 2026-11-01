import { renderPrompt } from '#/_base/utils/render-prompt';

import handoffInstructionTemplate from './handoff-instruction.md?raw';

export interface HandoffInstructionInput {
  readonly originalPrompt?: string;
  readonly previousHandoffPaths?: readonly string[];
  readonly customInstruction?: string;
}

export function renderHandoffPointerFooter(
  path: string,
  earlierHandoffPaths: readonly string[] = [],
): string {
  const lines = [
    'A structured handoff document for this session was written to disk before this compaction:',
    path,
    '',
    'You are resuming this same task, not starting a new one, and nothing above this note records it in full.',
    'Your first action — before any other tool call, and before answering the user — is to read that file end to end.',
    'It holds the session gist, the current state, every open thread with its concrete next action, the gotchas already paid for, the files and artifacts touched, and the open questions.',
    'Then work its threads in the order it gives them, and re-check its gotchas before anything destructive.',
    'If it names a process, server, branch, or checkout, confirm that is still live before you touch it.',
    'Do not begin the in-flight work until you have read it.',
  ];
  if (earlierHandoffPaths.length > 0) {
    lines.push(
      '',
      'This session has been compacted more than once. Every handoff document written before this one is also still on disk, oldest first — together with the one above they are the complete compaction history of this session:',
      ...earlierHandoffPaths,
      'When the latest handoff assumes context it does not carry, go read the earlier handoff that holds it.',
    );
  }
  return lines.join('\n');
}

export function renderHandoffInstruction(input: HandoffInstructionInput): string {
  const previousHandoffPaths = (input.previousHandoffPaths ?? [])
    .map((path) => path.trim())
    .filter((path) => path.length > 0);
  const originalPrompt = input.originalPrompt?.trim() ?? '';
  const customInstruction = input.customInstruction?.trim() ?? '';
  return renderPrompt(handoffInstructionTemplate, {
    session_anchor_block:
      originalPrompt.length > 0
        ? [
            'The original prompt that opened this session — the goal every compaction since has served — is quoted below. Treat it as the anchor of this session: the handoff you write must keep that goal reachable.',
            '',
            originalPrompt,
            '',
            '',
          ].join('\n')
        : '',
    resume_from_block:
      previousHandoffPaths.length > 0
        ? [
            `${earlierHandoffPhrase(previousHandoffPaths.length)} You have access to all of this session's compactions: every handoff document they wrote is still readable, and all of them are listed below in chronological order, oldest first — each file name begins with the local time it was written:`,
            '',
            ...previousHandoffPaths,
            '',
            `The most recent handoff is ${previousHandoffPaths.at(-1)}. Begin the document with a \`## Resume from\` section that names that file and adds one line on what changed since it was written. The older handoffs are depth, not clutter — when the recent ones assume context they do not carry, go read the earlier handoff that holds it.`,
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

function earlierHandoffPhrase(count: number): string {
  return count === 1
    ? 'An earlier compaction in this session already wrote a handoff document.'
    : `Earlier compactions in this session already wrote ${count} handoff documents.`;
}
