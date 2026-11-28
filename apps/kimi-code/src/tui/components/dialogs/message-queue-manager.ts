import {
  Container,
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  type Focusable,
} from '@moonshot-ai/pi-tui';

import { TRUNCATION_ELLIPSIS } from '#/tui/constant/rendering';
import { SELECT_POINTER } from '#/tui/constant/symbols';
import { isQueuedCompactionBarrier, type QueuedMessage } from '#/tui/types';
import { currentTheme } from '#/tui/theme';
import { printableChar } from '#/tui/utils/printable-key';
import { MultilineTextInput } from '#/tui/utils/multiline-input';
import { SearchableList } from '#/tui/utils/searchable-list';

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
  private listLength: number;
  private movingIndex: number | undefined;
  private busy = false;

  constructor(opts: MessageQueueManagerOptions) {
    super();
    this.opts = opts;
    this.messages = opts.messages;
    this.listLength = this.messages.length;
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
      const selected = this.editableSelection();
      if (selected !== undefined) {
        void this.applyAction({ kind: 'send-selected', index: selected });
      }
      return;
    }

    const decoded = printableChar(data);

    if (matchesKey(data, Key.space) || decoded === ' ') {
      const editable = this.editableSelection();
      if (editable !== undefined) {
        this.movingIndex = this.movingIndex === editable ? undefined : editable;
      }
      return;
    }

    if (decoded === 'e' || decoded === 'E') {
      const editable = this.editableSelection();
      if (editable !== undefined) {
        void this.opts.onAction({ kind: 'edit', index: editable });
        return;
      }
    }

    if (decoded === 'd' || decoded === 'D') {
      const editable = this.editableSelection();
      if (editable !== undefined) {
        void this.applyAction({ kind: 'delete', index: editable });
        return;
      }
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
    this.syncListLength();
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
    return lines.map((line) => truncateToWidth(line, width, TRUNCATION_ELLIPSIS));
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

    const truncated = truncateToWidth(text, messageWidth, TRUNCATION_ELLIPSIS);
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

  private editableSelection(): number | undefined {
    const selected = this.list.selected();
    if (selected === undefined) return undefined;
    const message = this.messages[selected];
    return message !== undefined && isEditable(message) ? selected : undefined;
  }

  private syncListLength(): void {
    if (this.listLength === this.messages.length) return;
    this.listLength = this.messages.length;
    if (this.movingIndex !== undefined && this.movingIndex >= this.messages.length) {
      this.movingIndex = undefined;
    }
    const selected = this.list.selected();
    this.list = this.createList(
      Math.min(selected ?? this.messages.length - 1, this.messages.length - 1),
    );
  }

  private async applyAction(action: Exclude<MessageQueueAction, { kind: 'edit' }>) {
    this.busy = true;
    try {
      const moved = action.kind === 'move' ? this.messages[action.index] : undefined;
      const result = await this.opts.onAction(action);
      if (result === undefined) return;
      this.messages = result;
      this.listLength = this.messages.length;
      if (this.messages.length === 0) {
        this.movingIndex = undefined;
        this.list = this.createList(-1);
        return;
      }
      const target = action.kind === 'move'
        ? (action.direction === 'up' ? action.index - 1 : action.index + 1)
        : -1;
      if (target >= 0 && target < this.messages.length && this.messages[target] === moved) {
        this.movingIndex = target;
        this.list = this.createList(target);
        return;
      }
      const selected = this.list.selected();
      this.list = this.createList(
        Math.min(selected ?? this.messages.length - 1, this.messages.length - 1),
      );
    } finally {
      this.busy = false;
      this.invalidate();
    }
  }
}

export class MessageQueueEditDialogComponent extends Container implements Focusable {
  focused = false;

  private readonly input = new MultilineTextInput();
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
      TRUNCATION_ELLIPSIS,
    );
    const subtitle = truncateToWidth(
      currentTheme.fg(
        this.error === undefined ? 'textDim' : 'warning',
        this.error ?? 'Update the queued message text.',
      ),
      innerWidth,
      TRUNCATION_ELLIPSIS,
    );
    const inputLines = this.input.render(innerWidth);
    const footer = truncateToWidth(
      currentTheme.fg('textDim', 'Enter submit · Shift-Enter/Ctrl-J newline · Esc cancel'),
      innerWidth,
      TRUNCATION_ELLIPSIS,
    );
    const contentLines = [title, '', subtitle, '', ...inputLines, '', footer];
    if (safeWidth < 4) {
      return ['', ...contentLines.map((line) => truncateToWidth(line, safeWidth, TRUNCATION_ELLIPSIS))];
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

    return lines.map((line) => truncateToWidth(line, safeWidth, TRUNCATION_ELLIPSIS));
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
