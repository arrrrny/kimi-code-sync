import {
  Container,
  Key,
  matchesKey,
  CURSOR_MARKER,
  truncateToWidth,
  visibleWidth,
  type Focusable,
} from '@moonshot-ai/pi-tui';
import chalk from 'chalk';

import { SELECT_POINTER } from '#/tui/constant/symbols';
import { isQueuedCompactionBarrier, type QueuedMessage } from '#/tui/types';
import { currentTheme } from '#/tui/theme';
import { printableChar } from '#/tui/utils/printable-key';
import { SearchableList } from '#/tui/utils/searchable-list';

const MAX_EDIT_INPUT_LINES = 8;
const ELLIPSIS = '…';
const BRACKET_PASTE_START = '\u001B[200~';
const BRACKET_PASTE_END = '\u001B[201~';
const SHIFT_ENTER_LEGACY = '\u001B\r';
const SHIFT_ENTER_CSI = '\u001B[13;2~';
const SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
// oxlint-disable-next-line no-control-regex -- ESC (\x1b) is required to strip pasted terminal control sequences
const ANSI_CSI = /\u001B\[[0-9;]*[ -/]*[@-~]/g;

export type MessageQueueMoveDirection = 'up' | 'down';

export type MessageQueueAction =
  | { readonly kind: 'move'; readonly index: number; readonly direction: MessageQueueMoveDirection }
  | { readonly kind: 'edit'; readonly index: number }
  | { readonly kind: 'delete'; readonly index: number }
  | { readonly kind: 'send-selected'; readonly index: number }
  | { readonly kind: 'send-all' };

export interface MessageQueueManagerOptions {
  readonly messages: readonly QueuedMessage[];
  readonly onAction: (action: MessageQueueAction) => readonly QueuedMessage[] | void | Promise<readonly QueuedMessage[] | void>;
  readonly onCancel: () => void;
}

export interface MessageQueueEditResult {
  readonly kind: 'save' | 'cancel';
  readonly index: number;
  readonly text: string;
}

export interface MessageQueueEditDialogOptions {
  readonly message: QueuedMessage;
  readonly index: number;
  readonly onDone: (result: MessageQueueEditResult) => void;
}

function isEditable(message: QueuedMessage): boolean {
  return !isQueuedCompactionBarrier(message);
}

function isLocked(message: QueuedMessage): boolean {
  return isQueuedCompactionBarrier(message);
}

export class MessageQueueManagerComponent extends Container implements Focusable {
  focused = false;

  private readonly opts: MessageQueueManagerOptions;
  private messages: readonly QueuedMessage[];
  private list: SearchableList<number>;
  private movingIndex: number | undefined;
  private busy = false;

  constructor(opts: MessageQueueManagerOptions) {
    super();
    this.opts = opts;
    this.messages = opts.messages;
    this.list = this.createList(this.messages.length - 1);
  }

  handleInput(data: string): void {
    if (this.busy) return;
    if (matchesKey(data, Key.escape)) {
      this.opts.onCancel();
      return;
    }

    const isCtrlShiftS =
      matchesKey(data, Key.ctrlShift('s')) ||
      matchesKey(data, Key.shiftCtrl('s')) ||
      data === '\u001B[83;6u';

    if (isCtrlShiftS) {
      void this.applyAction({ kind: 'send-all' });
      return;
    }

    if (matchesKey(data, Key.ctrl('s')) || data === '\u0013') {
      const selected = this.list.selected();
      if (selected !== undefined) {
        void this.applyAction({ kind: 'send-selected', index: selected });
      }
      return;
    }

    const selected = this.list.selected();
    const decoded = printableChar(data);

    if (matchesKey(data, Key.space) || decoded === ' ') {
      if (selected !== undefined && isEditable(this.messages[selected]!)) {
        this.movingIndex = this.movingIndex === selected ? undefined : selected;
      }
      return;
    }

    if ((decoded === 'e' || decoded === 'E') && selected !== undefined && isEditable(this.messages[selected]!)) {
      void this.opts.onAction({ kind: 'edit', index: selected });
      return;
    }

    if ((decoded === 'd' || decoded === 'D') && selected !== undefined && isEditable(this.messages[selected]!)) {
      void this.applyAction({ kind: 'delete', index: selected });
      return;
    }

    if (this.movingIndex !== undefined) {
      if (matchesKey(data, Key.up)) {
        void this.applyAction({ kind: 'move', index: this.movingIndex, direction: 'up' });
        return;
      }
      if (matchesKey(data, Key.down)) {
        void this.applyAction({ kind: 'move', index: this.movingIndex, direction: 'down' });
        return;
      }
    }

    if (this.list.handleKey(data)) return;
  }

  override render(width: number): string[] {
    const view = this.list.view();
    const hint = this.movingIndex === undefined
      ? '↑↓ navigate · Space select · E edit · D delete · Ctrl-S send · Ctrl-Shift-S send all · Esc cancel'
      : '↑↓ reorder · Space done · E edit · D delete · Esc cancel';
    const lines: string[] = [
      currentTheme.fg('primary', '─'.repeat(width)),
      currentTheme.boldFg('primary', ' Queued messages'),
      currentTheme.fg('textMuted', ` ${hint}`),
      '',
    ];

    if (this.messages.length === 0) {
      lines.push(currentTheme.fg('textMuted', '  No queued messages.'));
    } else {
      for (let i = view.page.start; i < view.page.end; i++) {
        lines.push(this.renderMessage(i, i === view.selectedIndex, width));
      }

      const below = view.items.length - view.page.end;
      if (below > 0) {
        lines.push('');
        lines.push(currentTheme.fg('textMuted', ` ▼ ${String(below)} more`));
      }
    }

    lines.push('');
    lines.push(currentTheme.fg('primary', '─'.repeat(width)));
    return lines.map((line) => truncateToWidth(line, width, ELLIPSIS));
  }

  private renderMessage(index: number, selected: boolean, width: number): string {
    const message = this.messages[index];
    if (message === undefined) return '';

    const moving = index === this.movingIndex;
    const locked = isLocked(message);
    const pointer = selected ? SELECT_POINTER : ' ';
    const prefix = currentTheme.fg(selected ? 'primary' : 'textDim', `  ${pointer} `);
    const labelPrefix = `${String(index + 1)}. `;
    const stateLabel = moving ? '  selected' : locked ? '  (auto)' : '';
    const labelWidth = visibleWidth(labelPrefix);
    const stateWidth = visibleWidth(stateLabel);
    const messageWidth = Math.max(1, width - 5 - labelWidth - stateWidth);

    const singleLine = message.text.replaceAll(/\s+/g, ' ').trim();

    let text: string;
    if (message.mode === 'bash') {
      text = `$ ${singleLine}`;
    } else if (message.mode === 'model-switch') {
      text = `[switch to ${message.alias} thinking ${message.thinking}]`;
    } else if (message.mode === 'compact') {
      text = `[compact] ${singleLine}`;
    } else {
      text = singleLine;
    }

    const truncated = truncateToWidth(text, messageWidth, ELLIPSIS);
    const textStyle = locked
      ? (s: string) => currentTheme.fg('textDim', s)
      : selected
        ? (s: string) => currentTheme.boldFg('primary', s)
        : (s: string) => currentTheme.fg('text', s);

    let line = prefix + textStyle(labelPrefix + truncated);
    if (moving) line += currentTheme.fg('success', stateLabel);
    else if (locked) line += currentTheme.fg('textDim', stateLabel);
    return line;
  }

  private createList(initialIndex: number): SearchableList<number> {
    const indices = this.messages.map((_, i) => i);
    return new SearchableList({
      items: indices,
      toSearchText: (i) => {
        const msg = this.messages[i];
        return msg?.text ?? '';
      },
      initialIndex: Math.max(0, Math.min(initialIndex, indices.length - 1)),
      searchable: false,
    });
  }

  private async applyAction(action: Exclude<MessageQueueAction, { kind: 'edit' }>) {
    this.busy = true;
    try {
      const result = await this.opts.onAction(action);
      if (result !== undefined) {
        const prevSelected = this.list.selected();
        this.messages = result;
        if (this.messages.length === 0) {
          this.movingIndex = undefined;
          this.list = this.createList(-1);
        } else {
          const newIndex = action.kind === 'delete' && prevSelected !== undefined
            ? Math.min(prevSelected, this.messages.length - 1)
            : prevSelected !== undefined ? Math.min(prevSelected, this.messages.length - 1) : this.messages.length - 1;
          if (this.movingIndex !== undefined && this.movingIndex >= this.messages.length) {
            this.movingIndex = undefined;
          }
          this.list = this.createList(newIndex);
        }
      }
    } finally {
      this.busy = false;
      this.invalidate();
    }
  }
}

export class MessageQueueEditDialogComponent extends Container implements Focusable {
  focused = false;

  private readonly input = new MessageTextInput();
  private readonly opts: MessageQueueEditDialogOptions;
  private done = false;
  private error: string | undefined;

  constructor(opts: MessageQueueEditDialogOptions) {
    super();
    this.opts = opts;
    this.input.setValue(opts.message.text);
    this.input.onSubmit = (value) => {
      this.submit(value);
    };
  }

  handleInput(data: string): void {
    if (this.done) return;
    if (
      matchesKey(data, Key.escape) ||
      matchesKey(data, Key.ctrl('c')) ||
      matchesKey(data, Key.ctrl('d'))
    ) {
      this.done = true;
      this.opts.onDone({ kind: 'cancel', index: this.opts.index, text: this.opts.message.text });
      return;
    }
    this.error = undefined;
    this.input.handleInput(data);
  }

  override invalidate(): void {
    super.invalidate();
    this.input.invalidate();
  }

  override render(width: number): string[] {
    this.input.focused = this.focused && !this.done;

    const safeWidth = Math.max(0, width);
    if (safeWidth <= 0) return [''];
    const innerWidth = Math.max(1, safeWidth - 4);
    const pad = '  ';
    const border = (s: string): string => currentTheme.fg('primary', s);
    const title = truncateToWidth(
      currentTheme.boldFg('textStrong', 'Edit queued message'),
      innerWidth,
      ELLIPSIS,
    );
    const subtitle = truncateToWidth(
      currentTheme.fg(
        this.error === undefined ? 'textDim' : 'warning',
        this.error ?? 'Update the queued message text.',
      ),
      innerWidth,
      ELLIPSIS,
    );
    const inputLines = this.input.render(innerWidth);
    const footer = truncateToWidth(
      currentTheme.fg('textDim', 'Enter submit · Shift-Enter/Ctrl-J newline · Esc cancel'),
      innerWidth,
      ELLIPSIS,
    );
    const contentLines = [title, '', subtitle, '', ...inputLines, '', footer];
    if (safeWidth < 4) {
      return ['', ...contentLines.map((line) => truncateToWidth(line, safeWidth, ELLIPSIS))];
    }

    const lines = [
      '',
      border('╭' + '─'.repeat(safeWidth - 2) + '╮'),
      border('│') + ' '.repeat(safeWidth - 2) + border('│'),
    ];

    for (const content of contentLines) {
      const rightPad = Math.max(0, innerWidth - visibleWidth(content));
      lines.push(border('│') + pad + content + ' '.repeat(rightPad) + border('│'));
    }

    lines.push(border('│') + ' '.repeat(safeWidth - 2) + border('│'));
    lines.push(border('╰' + '─'.repeat(safeWidth - 2) + '╯'));
    lines.push('');

    return lines.map((line) => truncateToWidth(line, safeWidth, ELLIPSIS));
  }

  private submit(value: string): void {
    const text = value.trim();
    if (text.length === 0) {
      this.error = 'Message text cannot be empty.';
      return;
    }
    this.opts.onDone({ kind: 'save', index: this.opts.index, text });
  }
}

class MessageTextInput {
  focused = false;
  onSubmit?: (value: string) => void;

  private value = '';
  private cursor = 0;
  private pasteBuffer: string | undefined;

  getValue(): string {
    return this.value;
  }

  setValue(value: string): void {
    this.value = normalizeNewlines(value);
    this.cursor = this.value.length;
  }

  handleInput(data: string): void {
    if (this.handleBracketedPaste(data)) return;

    if (isNewlineInput(data)) {
      this.insert('\n');
      return;
    }

    if (matchesKey(data, Key.enter) || matchesKey(data, Key.return)) {
      this.onSubmit?.(this.value);
      return;
    }

    if (matchesKey(data, Key.backspace)) {
      this.deleteBeforeCursor();
      return;
    }

    if (matchesKey(data, Key.delete)) {
      this.deleteAfterCursor();
      return;
    }

    if (matchesKey(data, Key.left)) {
      this.cursor = previousGraphemeStart(this.value, this.cursor);
      return;
    }

    if (matchesKey(data, Key.right)) {
      this.cursor = nextGraphemeEnd(this.value, this.cursor);
      return;
    }

    if (matchesKey(data, Key.up)) {
      this.moveVertical(-1);
      return;
    }

    if (matchesKey(data, Key.down)) {
      this.moveVertical(1);
      return;
    }

    if (matchesKey(data, Key.home) || matchesKey(data, Key.ctrl('a'))) {
      this.cursor = this.currentLineStart();
      return;
    }

    if (matchesKey(data, Key.end) || matchesKey(data, Key.ctrl('e'))) {
      this.cursor = this.currentLineEnd();
      return;
    }

    const decoded = printableChar(data);
    if (isPrintableText(decoded)) {
      this.insert(decoded);
    }
  }

  invalidate(): void {
  }

  render(width: number): string[] {
    const safeWidth = Math.max(4, width);
    const logicalLines = this.value.split('\n');
    const cursor = this.cursorLocation();
    const range = visibleLineRange(logicalLines.length, cursor.line);
    const rendered: string[] = [];

    if (range.start > 0) {
      rendered.push(padInputLine(`  ${ELLIPSIS} ${String(range.start)} previous`, safeWidth));
    }

    for (let lineIndex = range.start; lineIndex < range.end; lineIndex++) {
      const line = logicalLines[lineIndex] ?? '';
      const prefix = lineIndex === 0 ? '> ' : '  ';
      rendered.push(
        lineIndex === cursor.line
          ? renderCursorLine(line, cursor.column, prefix, safeWidth, this.focused)
          : renderTextLine(line, prefix, safeWidth),
      );
    }

    const remaining = logicalLines.length - range.end;
    if (remaining > 0) {
      rendered.push(padInputLine(`  ${ELLIPSIS} ${String(remaining)} more`, safeWidth));
    }

    return rendered;
  }

  private insert(text: string): void {
    const normalized = normalizeNewlines(text);
    this.value =
      this.value.slice(0, this.cursor) + normalized + this.value.slice(this.cursor);
    this.cursor += normalized.length;
  }

  private deleteBeforeCursor(): void {
    if (this.cursor === 0) return;
    const start = previousGraphemeStart(this.value, this.cursor);
    this.value = this.value.slice(0, start) + this.value.slice(this.cursor);
    this.cursor = start;
  }

  private deleteAfterCursor(): void {
    if (this.cursor >= this.value.length) return;
    const end = nextGraphemeEnd(this.value, this.cursor);
    this.value = this.value.slice(0, this.cursor) + this.value.slice(end);
  }

  private moveVertical(delta: -1 | 1): void {
    const starts = lineStarts(this.value);
    const location = this.cursorLocation(starts);
    const targetLine = location.line + delta;
    if (targetLine < 0 || targetLine >= starts.length) return;

    const targetStart = starts[targetLine] ?? 0;
    const targetEnd = lineEndForStart(this.value, starts, targetLine);
    this.cursor = Math.min(targetStart + location.column, targetEnd);
  }

  private currentLineStart(): number {
    return this.value.lastIndexOf('\n', Math.max(0, this.cursor - 1)) + 1;
  }

  private currentLineEnd(): number {
    return lineEndAt(this.value, this.cursor);
  }

  private cursorLocation(starts = lineStarts(this.value)): { line: number; column: number } {
    let line = 0;
    for (let i = 0; i < starts.length; i++) {
      const start = starts[i] ?? 0;
      if (start > this.cursor) break;
      line = i;
    }
    const lineStart = starts[line] ?? 0;
    return { line, column: this.cursor - lineStart };
  }

  private handleBracketedPaste(data: string): boolean {
    if (this.pasteBuffer !== undefined) {
      this.appendPasteChunk(data);
      return true;
    }

    const start = data.indexOf(BRACKET_PASTE_START);
    if (start === -1) return false;

    this.pasteBuffer = '';
    const before = data.slice(0, start);
    if (isPrintableText(before)) this.insert(before);
    this.appendPasteChunk(data.slice(start + BRACKET_PASTE_START.length));
    return true;
  }

  private appendPasteChunk(data: string): void {
    if (this.pasteBuffer === undefined) return;

    this.pasteBuffer += data;
    const end = this.pasteBuffer.indexOf(BRACKET_PASTE_END);
    if (end === -1) return;

    const pasted = this.pasteBuffer.slice(0, end);
    const remaining = this.pasteBuffer.slice(end + BRACKET_PASTE_END.length);
    this.pasteBuffer = undefined;
    this.insert(sanitizePastedText(pasted));
    if (remaining.length > 0) this.handleInput(remaining);
  }
}

function isNewlineInput(data: string): boolean {
  return (
    data === '\n' ||
    data === SHIFT_ENTER_LEGACY ||
    data === SHIFT_ENTER_CSI ||
    matchesKey(data, Key.ctrl('j'))
  );
}

function normalizeNewlines(text: string): string {
  return text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

function sanitizePastedText(text: string): string {
  const normalized = normalizeNewlines(text).replaceAll(ANSI_CSI, '');
  let out = '';
  for (let i = 0; i < normalized.length;) {
    const code = normalized.codePointAt(i);
    if (code === undefined) break;
    const char = String.fromCodePoint(code);
    if (char === '\n' || isPrintableText(char)) {
      out += char;
    }
    i += code > 0xffff ? 2 : 1;
  }
  return out;
}

function isPrintableText(text: string): boolean {
  if (text.length === 0) return false;
  for (let i = 0; i < text.length;) {
    const code = text.codePointAt(i);
    if (code === undefined) return false;
    if (code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f)) return false;
    i += code > 0xffff ? 2 : 1;
  }
  return true;
}

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

function lineEndAt(text: string, offset: number): number {
  const end = text.indexOf('\n', offset);
  return end === -1 ? text.length : end;
}

function lineEndForStart(text: string, starts: readonly number[], line: number): number {
  const nextStart = starts[line + 1];
  return nextStart === undefined ? text.length : nextStart - 1;
}

function previousGraphemeStart(text: string, offset: number): number {
  if (offset <= 0) return 0;
  let previous = 0;
  for (const segment of SEGMENTER.segment(text.slice(0, offset))) {
    previous = segment.index;
  }
  return previous;
}

function nextGraphemeEnd(text: string, offset: number): number {
  if (offset >= text.length) return text.length;
  const segment = SEGMENTER.segment(text.slice(offset))[Symbol.iterator]().next().value;
  return segment === undefined ? text.length : offset + segment.segment.length;
}

function visibleLineRange(totalLines: number, cursorLine: number): { start: number; end: number } {
  if (totalLines <= MAX_EDIT_INPUT_LINES) return { start: 0, end: totalLines };

  const half = Math.floor(MAX_EDIT_INPUT_LINES / 2);
  const start = Math.min(
    Math.max(0, cursorLine - half),
    Math.max(0, totalLines - MAX_EDIT_INPUT_LINES),
  );
  return { start, end: start + MAX_EDIT_INPUT_LINES };
}

function renderTextLine(line: string, prefix: string, width: number): string {
  const prefixWidth = visibleWidth(prefix);
  const textWidth = Math.max(1, width - prefixWidth);
  const text = truncateToWidth(line, textWidth, ELLIPSIS);
  return padInputLine(prefix + text, width);
}

function renderCursorLine(
  line: string,
  column: number,
  prefix: string,
  width: number,
  focused: boolean,
): string {
  const prefixWidth = visibleWidth(prefix);
  const textWidth = Math.max(1, width - prefixWidth);
  const cursorEnd = nextGraphemeEnd(line, column);
  const before = line.slice(0, column);
  const cursorText = line.slice(column, cursorEnd) || ' ';
  const after = line.slice(cursorEnd);
  const cursorWidth = Math.max(1, visibleWidth(cursorText));
  const beforeWidth = Math.max(0, textWidth - cursorWidth);
  const beforeView = takeEndByWidth(before, beforeWidth);
  const afterView = takeStartByWidth(
    after,
    Math.max(0, textWidth - visibleWidth(beforeView) - cursorWidth),
  );
  const marker = focused ? CURSOR_MARKER : '';
  return padInputLine(
    prefix + beforeView + marker + chalk.inverse(cursorText) + afterView,
    width,
  );
}

function takeStartByWidth(text: string, width: number): string {
  let out = '';
  let used = 0;
  for (const segment of SEGMENTER.segment(text)) {
    const segmentWidth = visibleWidth(segment.segment);
    if (used + segmentWidth > width) break;
    out += segment.segment;
    used += segmentWidth;
  }
  return out;
}

function takeEndByWidth(text: string, width: number): string {
  let out = '';
  let used = 0;
  const segments = [...SEGMENTER.segment(text)];
  for (let i = segments.length - 1; i >= 0; i--) {
    const segment = segments[i];
    if (segment === undefined) continue;
    const segmentWidth = visibleWidth(segment.segment);
    if (used + segmentWidth > width) break;
    out = segment.segment + out;
    used += segmentWidth;
  }
  return out;
}

function padInputLine(line: string, width: number): string {
  return line + ' '.repeat(Math.max(0, width - visibleWidth(line)));
}