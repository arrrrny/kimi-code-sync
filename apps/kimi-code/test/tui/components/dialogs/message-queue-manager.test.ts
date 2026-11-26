import { visibleWidth } from '@moonshot-ai/pi-tui';
import { describe, expect, it, vi } from 'vitest';

import {
  MessageQueueManagerComponent,
  MessageQueueEditDialogComponent,
  type MessageQueueAction,
} from '#/tui/components/dialogs/message-queue-manager';
import type { QueuedMessage } from '#/tui/types';

const ANSI = /\u001B\[[0-9;]*m/g;
const strip = (s: string): string => s.replaceAll(ANSI, '');
const ESC = String.fromCodePoint(27);
const UP = `${ESC}[A`;
const DOWN = `${ESC}[B`;
const CTRL_S = '\u0013';
const CTRL_SHIFT_S = '\u001B[83;6u';

function prompt(text: string): QueuedMessage {
  return { text };
}

function bash(text: string): QueuedMessage {
  return { text, mode: 'bash' };
}

function compact(text: string): QueuedMessage {
  return { text, mode: 'compact' };
}

function text(component: MessageQueueManagerComponent | MessageQueueEditDialogComponent, width = 100) {
  return component.render(width).map(strip).join('\n');
}

describe('MessageQueueManagerComponent', () => {
  it('renders queued messages and the management hint', () => {
    const manager = new MessageQueueManagerComponent({
      messages: [prompt('First message'), prompt('Second message')],
      onAction: vi.fn(),
      onCancel: vi.fn(),
    });

    const out = text(manager);
    expect(out).toContain('Queued messages');
    expect(out).toContain('Ctrl-S send');
    expect(out).toContain('First message');
    expect(out).toContain('Second message');
  });

  it('shows empty state when no messages are queued', () => {
    const manager = new MessageQueueManagerComponent({
      messages: [],
      onAction: vi.fn(),
      onCancel: vi.fn(),
    });

    const out = text(manager);
    expect(out).toContain('No queued messages.');
  });

  it('navigates selection with Up/Down arrows', () => {
    const manager = new MessageQueueManagerComponent({
      messages: [prompt('First'), prompt('Second'), prompt('Third')],
      onAction: vi.fn(),
      onCancel: vi.fn(),
    });

    manager.handleInput(UP);
    manager.handleInput(UP);

    const out = text(manager);
    const firstPos = out.indexOf('First');
    const pointerPos = out.lastIndexOf('❯');
    expect(pointerPos).toBeLessThan(firstPos + 20);
  });

  it('Escape calls onCancel', () => {
    const onCancel = vi.fn();
    const manager = new MessageQueueManagerComponent({
      messages: [prompt('Hello')],
      onAction: vi.fn(),
      onCancel,
    });

    manager.handleInput(ESC);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('Space enters move mode and Up/Down reorders', async () => {
    const onAction = vi.fn(async (action: MessageQueueAction) => {
      expect(action).toEqual({ kind: 'move', index: 1, direction: 'up' });
      return [prompt('Second'), prompt('First')];
    });
    const manager = new MessageQueueManagerComponent({
      messages: [prompt('First'), prompt('Second')],
      onAction,
      onCancel: vi.fn(),
    });

    manager.handleInput(DOWN);
    manager.handleInput(' ');
    expect(text(manager)).toContain('↑↓ reorder');
    manager.handleInput(UP);

    await vi.waitFor(() => {
      expect(onAction).toHaveBeenCalledOnce();
    });
  });

  it('E calls onAction with edit for the selected message', async () => {
    const onAction = vi.fn();
    const manager = new MessageQueueManagerComponent({
      messages: [prompt('Edit me')],
      onAction,
      onCancel: vi.fn(),
    });

    manager.handleInput('e');
    expect(onAction).toHaveBeenCalledWith({ kind: 'edit', index: 0 });
  });

  it('D deletes the selected message', async () => {
    const onAction = vi.fn(async (action: MessageQueueAction) => {
      expect(action).toEqual({ kind: 'delete', index: 0 });
      return [prompt('Second message')];
    });
    const manager = new MessageQueueManagerComponent({
      messages: [prompt('First message'), prompt('Second message')],
      onAction,
      onCancel: vi.fn(),
    });

    manager.handleInput(UP);
    manager.handleInput('d');

    await vi.waitFor(() => {
      expect(onAction).toHaveBeenCalledOnce();
    });
    const out = text(manager);
    expect(out).not.toContain('First message');
    expect(out).toContain('Second message');
  });

  it('Ctrl+S calls onAction with send-selected', async () => {
    const onAction = vi.fn(async (action: MessageQueueAction) => {
      expect(action).toEqual({ kind: 'send-selected', index: 0 });
      return [prompt('Remaining')];
    });
    const manager = new MessageQueueManagerComponent({
      messages: [prompt('Send me'), prompt('Remaining')],
      onAction,
      onCancel: vi.fn(),
    });

    manager.handleInput(UP);
    manager.handleInput(CTRL_S);

    await vi.waitFor(() => {
      expect(onAction).toHaveBeenCalledOnce();
    });
  });

  it('Ctrl+Shift+S calls onAction with send-all', async () => {
    const onAction = vi.fn(async (action: MessageQueueAction) => {
      expect(action).toEqual({ kind: 'send-all' });
      return [];
    });
    const manager = new MessageQueueManagerComponent({
      messages: [prompt('One'), prompt('Two')],
      onAction,
      onCancel: vi.fn(),
    });

    manager.handleInput(CTRL_SHIFT_S);

    await vi.waitFor(() => {
      expect(onAction).toHaveBeenCalledOnce();
    });
  });

  it('bash commands render with $ prefix', () => {
    const manager = new MessageQueueManagerComponent({
      messages: [bash('echo hello')],
      onAction: vi.fn(),
      onCancel: vi.fn(),
    });

    const out = text(manager);
    expect(out).toContain('$ echo hello');
  });

  it('system messages (compact) show (auto) label and cannot be edited', async () => {
    const onAction = vi.fn();
    const manager = new MessageQueueManagerComponent({
      messages: [compact('auto compaction')],
      onAction,
      onCancel: vi.fn(),
    });

    manager.handleInput('e');
    expect(onAction).not.toHaveBeenCalled();
    expect(text(manager)).toContain('(auto)');
  });

  it('system messages cannot be deleted', async () => {
    const onAction = vi.fn();
    const manager = new MessageQueueManagerComponent({
      messages: [compact('auto compaction')],
      onAction,
      onCancel: vi.fn(),
    });

    manager.handleInput('d');
    expect(onAction).not.toHaveBeenCalled();
  });

  it('renders within narrow terminal widths', () => {
    const manager = new MessageQueueManagerComponent({
      messages: [prompt('A message that is quite long and should be truncated properly')],
      onAction: vi.fn(),
      onCancel: vi.fn(),
    });

    for (const width of [1, 2, 4, 10, 20]) {
      for (const row of manager.render(width)) {
        expect(visibleWidth(row)).toBeLessThanOrEqual(width);
      }
    }
  });
});

describe('MessageQueueEditDialogComponent', () => {
  it('renders the edit dialog with current message text', () => {
    const dialog = new MessageQueueEditDialogComponent({
      message: prompt('Original text'),
      index: 0,
      onDone: vi.fn(),
    });

    const out = text(dialog);
    expect(out).toContain('Edit queued message');
    expect(out).toContain('Original text');
  });

  it('Escape calls onDone with cancel', () => {
    const onDone = vi.fn();
    const dialog = new MessageQueueEditDialogComponent({
      message: prompt('Original'),
      index: 0,
      onDone,
    });

    dialog.handleInput(ESC);
    expect(onDone).toHaveBeenCalledWith({ kind: 'cancel', index: 0, text: 'Original' });
  });

  it('rejects empty text on Enter', () => {
    const onDone = vi.fn();
    const dialog = new MessageQueueEditDialogComponent({
      message: prompt('Original'),
      index: 0,
      onDone,
    });

    for (let i = 0; i < 'Original'.length; i++) {
      dialog.handleInput('\u007F');
    }
    dialog.handleInput('\r');
    expect(onDone).not.toHaveBeenCalled();
  });
});
