The conversation above is about to be compacted. Before the earlier history is
replaced, write the handoff document for this session — a structured snapshot
persisted to disk, read cold by the agent that resumes this task when the
conversation it summarizes is gone.

--- This message is a direct task, not part of the above conversation ---

${resume_from_block}Write the document with exactly these sections, in this order, each under its
own `## ` heading:

## Session Gist

One short paragraph: what this session is about, what the user is ultimately
after, and which request currently governs the work.

## Current State

Where the work stands right now: the last completed step, the step in progress,
and anything half-applied the resumer inherits as-is — uncommitted edits,
running processes, checkouts, servers left up.

## The Threads

Every open thread of work, one entry per thread with its concrete next action —
the exact command or edit to run next, not a plan essay. Say which thread to
pick up first.

## Gotchas

Failures already hit and their fixes, constraints that shaped earlier decisions,
and traps waiting on the road ahead — anything the resumer would otherwise
rediscover by failing again.

## Files and Artifacts Touched

Every file, command result, or artifact this session created or modified, with
exact paths and why each matters to the remaining work. Keep the final working
version of anything small enough to inline; point at the rest by path.

## Open Questions

What this conversation never established and the next step depends on: files
referenced but not yet read, schemas or APIs assumed but unseen, questions the
user has not answered. Name them so the resumer goes and checks instead of
assuming.

Write in the same language the conversation has been using — do not switch to
English just because these instructions happen to be in English. Be concrete:
exact paths, exact commands, exact values — the resumer sees only this document
and the compacted summary, not the conversation above. Keep each section
proportional to its thread: a thin thread needs a line, a deep one deserves
detail. Leave a section body empty only when it is genuinely empty, and never
invent content to fill one.

${custom_instruction_block}Respond with text only. Do not call any tools — you already have everything you
need in the conversation history.
