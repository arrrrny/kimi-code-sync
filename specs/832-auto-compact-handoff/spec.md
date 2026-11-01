# Feature Specification: Auto-Compact Handoff Document

**Feature Branch**: `832-auto-compact-handoff`

**Created**: 2026-09-25

**Status**: Draft

**Input**: User description: "auto-compact: before it kicks in, run the handoff skill so we
have a proper handoff document to follow before the auto compact"

---

## Summary

The engine already auto-compacts a session when context usage crosses the configured
threshold (default 85% of the model window) or when a request overflows and overflow
recovery kicks in. What the compaction leaves behind is a freeform LLM summary spliced into
the history: good enough to keep the model talking, but unstructured, ephemeral (it lives
only inside the conversation), and not something a human or a fresh agent instance can pick
up cold.

This feature makes every auto-compaction first produce a **structured handoff document**,
modeled on the `handoff` skill's format: session gist, current state, in-flight threads with
the next concrete action for each, gotchas (failures hit and their fixes), files and
artifacts touched, and open questions. The document is written to disk next to the session's
other records before the history is summarized away, the replacement summary points at it as
the first thing to read, and the compaction-completion signal carries its path so the UI (and
any client) can surface it.

Handoff generation must never endanger the compaction itself: if the extra generation call
fails, the compaction proceeds exactly as it does today and the failure is reported as a
warning. The whole feature is gated behind an experimental flag, default off.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A session that crosses the auto-compact threshold gets a handoff document on disk (Priority: P1)

A user runs a long autonomous task. Context usage crosses the trigger ratio and the engine
starts an auto-compaction. Before any history is replaced, the system generates a structured
handoff document from the pre-compaction history and writes it to disk beside the session's
other records. After the compaction completes, the file is still there with every required
section filled in.

**Why this priority**: This is the core value. Everything else is plumbing around the
artifact existing; without the document there is no handoff.

**Independent Test**: Drive a session past the compaction threshold with a scripted model,
let the auto-compaction run, then assert a handoff document exists on disk with the required
sections and content derived from the pre-compaction conversation.

**Acceptance Scenarios**:

1. **Given** a session whose measured context crosses the configured trigger ratio, **When**
   the auto-compaction completes, **Then** a handoff document exists on disk in the
   session's storage area, dated and sequenced so it can be told apart from other handoffs.
2. **Given** a handoff document produced by an auto-compaction, **When** it is read cold,
   **Then** it contains the required sections (session gist, current state, in-flight threads
   with next actions, gotchas, files and artifacts touched, open questions) and the content
   is consistent with the pre-compaction conversation, not invented.
3. **Given** a session whose context overflows outright and the overflow-recovery path
   auto-compacts, **When** recovery completes, **Then** a handoff document was produced from
   the history available before the retry.
4. **Given** two auto-compactions in the same session, **When** the second completes, **Then**
   the first document is still on disk and the second is distinguishable from it (no
   overwrite).

---

### User Story 2 - The post-compaction context is anchored to the handoff document (Priority: P2)

After the compaction, the summary that replaced the history tells the continued agent — and
the user — that a full handoff exists and where it is. The compaction-complete event carries
the path so the TUI (and any other client) can show it. A fresh agent instance resuming the
session reads the pointer first and reconstructs the full state from the document instead of
guessing from the summary alone.

**Why this priority**: The document is only useful if the post-compaction context can find
it. This is what turns a file on disk into a handoff.

**Independent Test**: Complete an auto-compaction with a scripted model and assert that the
replacement summary references the handoff document's path and that the compaction-complete
event exposes it.

**Acceptance Scenarios**:

1. **Given** a completed auto-compaction that produced a handoff document, **When** the
   replacement summary is inspected, **Then** it names the handoff document and its path as
   the first thing to read when resuming.
2. **Given** a completed auto-compaction that produced a handoff document, **When** the
   compaction-completed event reaches clients, **Then** its payload includes the handoff
   document's path.
3. **Given** the TUI renders a completed auto-compaction that produced a handoff document,
   **When** the completion message is shown, **Then** it displays the handoff document's path.

---

### User Story 3 - Handoff generation is safe to fail and off by default (Priority: P3)

The feature is enabled by an experimental flag. With it off, sessions behave exactly as
today — no extra model call, no files. With it on, a failure to generate the handoff (model
error, cascade exhausted, unusable output) must never block or fail the compaction: the
compaction completes without a handoff, a warning is issued, and clients see a compaction
that simply has no handoff attached.

**Why this priority**: It protects the thing users already rely on (compaction) from the new
thing (handoff generation), and keeps the feature invisible until it is opted into.

**Independent Test**: Enable the feature, make the handoff-generation model call fail, and
confirm the compaction still completes with a summary and no handoff; disable the feature and
confirm zero additional model calls and no files written.

**Acceptance Scenarios**:

1. **Given** the experimental flag is off (the default), **When** an auto-compaction runs,
   **Then** no handoff generation call is made and no handoff document is written.
2. **Given** the flag is on and the handoff-generation call fails, **When** the auto-compaction
   runs, **Then** the compaction still completes with a summary, a warning about the handoff
   is recorded, and the completion payload reports no handoff path.
3. **Given** the flag is on and a compaction is cancelled while the handoff document was
   already written, **When** the user inspects the storage area, **Then** the document remains
   (it is a valid snapshot) and the session is not left in a broken state.

---

### Edge Cases

- What happens when the overflow-recovery path fires and the history is already over the
  window? The handoff is generated from the pre-shrunk history the recovery path already
  prepares; if even that fails, the degradation rule (Story 3) applies.
- What happens when the compaction model cascade cannot resolve any model for handoff
  generation? Same degradation rule — the compaction proceeds without a handoff.
- What happens when a manual `/compact` runs? Manual compaction behavior is unchanged in
  this version; only auto-sourced compactions produce handoff documents.
- What happens when a session is resumed after the process exited mid-handoff? A partial or
  missing document is treated as absent; the summary pointer only exists when the document
  was fully written.
- What happens when the handoff output does not follow the required structure? The system
  still persists it (best effort) but does not claim structure it cannot verify; the pointer
  is still emitted.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST generate a handoff document from the pre-compaction history
  whenever an auto-compaction (threshold-triggered or overflow-recovery) begins and the
  feature is enabled, and it MUST do so before the history is replaced.
- **FR-002**: The handoff document MUST follow a fixed structure with these sections, in
  order: resume pointer (link to any previous handoff), session gist, current state,
  in-flight threads with the next concrete action for each, gotchas (failures hit and their
  fixes), files and artifacts touched, open questions.
- **FR-003**: The handoff document MUST be persisted to the session's storage area and MUST
  remain readable after the compaction completes and after the session ends.
- **FR-004**: Handoff documents MUST be named so that date and sequence are visible, and a
  new handoff MUST NOT overwrite an earlier one from the same session.
- **FR-005**: The replacement summary of a handoff-producing compaction MUST reference the
  handoff document and its path so a resuming agent reads it first.
- **FR-006**: The compaction-completed event MUST carry the handoff document path when one
  was produced, and MUST NOT carry one when it was not.
- **FR-007**: Handoff generation failure MUST NOT block, fail, or abort the compaction; a
  warning MUST be recorded and the compaction MUST complete without the handoff.
- **FR-008**: The feature MUST be gated behind an experimental flag that defaults to off,
  following the existing per-flag env > config > master-env > default precedence.
- **FR-009**: Handoff generation MUST use the same compaction (squeeze) model resolution
  cascade as summarization, including mid-flight fallback.
- **FR-010**: The TUI compaction-complete display MUST show the handoff document path when
  one was produced.

### Key Entities *(include if feature involves data)*

- **HandoffDocument**: the generated artifact — session it belongs to, sequence within the
  session, creation time, source (auto), the fixed section content, and its storage path.
  It is write-once per compaction and survives the session.
- **Compaction handoff enablement**: the experimental flag (with its env and config
  surface) that turns the feature on; no other user-facing configuration in this version.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After an auto-compaction with the feature enabled, a handoff document exists
  on disk with all required sections, 100% of the time the generation call succeeds.
- **SC-002**: Given only the post-compaction history, the handoff document's path is
  resolvable and the document loads cold (a fresh agent can read it with no other context).
- **SC-003**: Zero compactions fail or abort because of handoff generation — a failing
  generation degrades to today's behavior.
- **SC-004**: With the flag off, auto-compaction makes no additional model calls and writes
  no handoff files — behavior identical to today.

## Assumptions

- The existing auto-compaction machinery (threshold strategy, overflow recovery, model
  cascade, events) is reused unchanged; this feature adds a pre-summarization artifact step
  inside the same flow, not a parallel one.
- Handoff generation costs one additional LLM call per auto-compaction using the compaction
  model cascade; that cost is accepted whenever auto-compact fires, which is by definition
  a session-saving moment.
- Handoff documents live beside the session's existing persisted records; there is no new
  top-level configuration beyond the experimental flag in this version.
- This is a fork-owned feature (upstream MoonshotAI/kimi-code will not accept it); the files
  that carry it must be added to the fork-owned guard list with survival markers so the
  daily upstream sync cannot silently drop them.
