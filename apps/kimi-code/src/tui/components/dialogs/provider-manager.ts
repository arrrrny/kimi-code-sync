import type { ProviderConfig } from '@moonshot-ai/kimi-code-sdk';
import {
  getOpenPlatformById,
  isOpenPlatformId,
  type CustomRegistrySource,
} from '@moonshot-ai/kimi-code-oauth';
import {
  Container,
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  type Focusable,
} from '@moonshot-ai/pi-tui';

import { DEFAULT_OAUTH_PROVIDER_NAME } from '#/constant/app';
import { CURRENT_MARK, SELECT_POINTER } from '#/tui/constant/symbols';
import { currentTheme } from '#/tui/theme';
import { printableChar } from '#/tui/utils/printable-key';
import { pageView, type PageView } from '#/tui/utils/paging';

interface ConfirmState {
  readonly label: string;
  readonly providerIds: readonly string[];
}

/** Key row for a named API key within a provider. */
interface KeyRow {
  readonly kind: 'key';
  readonly id: string; // `${providerId}:${keyId}`
  readonly providerId: string;
  readonly keyId: string;
  readonly label: string; // key name
  readonly preview: string; // masked key preview
  readonly isActive: boolean;
  readonly proxyUrl?: string; // the key's own proxy, if it declares one
}

export interface ProviderManagerOptions {
  readonly providers: Record<string, ProviderConfig>;
  readonly activeProviderId?: string;
  readonly onAdd: () => void;
  readonly onDeleteSource: (providerIds: readonly string[]) => void;
  /** Add a new named API key to a provider. */
  readonly onAddKey: (providerId: string) => void;
  /** Remove a named API key from a provider. */
  readonly onRemoveKey: (providerId: string, keyId: string) => void;
  /** Set the active API key for a provider. */
  readonly onSetActiveKey: (providerId: string, keyId: string) => void;
  /** Set proxy URL for a provider. */
  readonly onSetProxyUrl: (providerId: string) => void;
  /** Turn automatic API key rotation on or off for a provider. */
  readonly onToggleRotation: (providerId: string) => void;
  readonly onClose: () => void;
}

interface SourceRow {
  readonly kind: 'source';
  readonly id: string;
  readonly label: string;
  readonly providerIds: readonly string[];
  readonly hasActive: boolean;
  readonly baseUrl?: string;
  /** True when automatic key rotation is on for the provider. */
  readonly rotateKeys?: boolean;
  /** Child key rows for this provider (if it has multiple named keys). */
  readonly keyRows: readonly KeyRow[];
}

interface AddRow {
  readonly kind: 'add';
  readonly id: '__add__';
  readonly label: string;
}

type Row = SourceRow | AddRow | KeyRow;

const ADD_ROW_LABEL = '[ Add New Platform ]';
const PAGE_SIZE = 8;
const HEADER_HINT = '↑↓ navigate · D delete · A add key · S set active · R rotate keys · P proxy · Esc cancel';

function readCustomRegistrySource(provider: unknown): CustomRegistrySource | undefined {
  if (typeof provider !== 'object' || provider === null) return undefined;
  const source = (provider as { readonly source?: unknown }).source;
  if (typeof source !== 'object' || source === null) return undefined;
  const candidate = source as {
    readonly kind?: unknown;
    readonly url?: unknown;
    readonly apiKey?: unknown;
  };
  if (candidate.kind !== 'apiJson') return undefined;
  if (typeof candidate.url !== 'string' || candidate.url.length === 0) return undefined;
  if (typeof candidate.apiKey !== 'string') return undefined;
  return { kind: 'apiJson', url: candidate.url, apiKey: candidate.apiKey };
}

function sourceUrlLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.host + parsed.pathname.replace(/\/+$/, '');
  } catch {
    return url;
  }
}

/**
 * Group providers into source rows + append the synthetic add-row.
 * The grouping rules:
 *   - `DEFAULT_OAUTH_PROVIDER_NAME` → skipped (managed via /logout).
 *   - Open Platform id (`isOpenPlatformId(id)`) → 1 source per provider,
 *     label = `OpenPlatformDefinition.name`.
 *   - `cfg.source.kind === 'apiJson'` → one source per `{url, apiKey}`
 *     pair, label = hostname + pathname.
 *   - Anything else → 1 source per provider, label = provider id.
 *   - Providers with multiple named API keys (`apiKeys`) get child key rows.
 */
function buildRows(opts: ProviderManagerOptions): readonly Row[] {
  const rows: Row[] = [];

  const customRegistryIndex = new Map<string, number>();
  const sourceRows: SourceRow[] = [];

  for (const [id, cfg] of Object.entries(opts.providers)) {
    if (id === DEFAULT_OAUTH_PROVIDER_NAME) continue;

    const isActive = id === opts.activeProviderId;

    if (isOpenPlatformId(id)) {
      const platform = getOpenPlatformById(id);
      sourceRows.push({
        kind: 'source',
        id: `open:${id}`,
        label: platform?.name ?? id,
        providerIds: [id],
        hasActive: isActive,
        keyRows: [],
      });
      continue;
    }

    const baseUrl =
      typeof cfg === 'object' && cfg !== null && 'baseUrl' in cfg && typeof cfg.baseUrl === 'string'
        ? cfg.baseUrl
        : undefined;

    const customSource = readCustomRegistrySource(cfg);
    if (customSource !== undefined) {
      const key = `${customSource.url}${customSource.apiKey}`;
      const existingIdx = customRegistryIndex.get(key);
      if (existingIdx !== undefined) {
        const existing = sourceRows[existingIdx];
        if (existing !== undefined && existing.kind === 'source') {
          sourceRows[existingIdx] = {
            kind: 'source',
            id: existing.id,
            label: existing.label,
            providerIds: [...existing.providerIds, id],
            hasActive: existing.hasActive || isActive,
            baseUrl: existing.baseUrl,
            rotateKeys: existing.rotateKeys,
            keyRows: existing.keyRows,
          };
        }
        continue;
      }
      customRegistryIndex.set(key, sourceRows.length);
      sourceRows.push({
        kind: 'source',
        id: `custom:${key}`,
        label: sourceUrlLabel(customSource.url),
        providerIds: [id],
        hasActive: isActive,
        baseUrl,
        keyRows: [],
      });
      continue;
    }

    // Build key rows for providers with multiple named API keys
    const keyRows = buildKeyRows(id, cfg as ProviderConfig);

    sourceRows.push({
      kind: 'source',
      id: `provider:${id}`,
      label: id,
      providerIds: [id],
      hasActive: isActive,
      baseUrl,
      rotateKeys: cfg.rotateKeys === true,
      keyRows,
    });
  }

  // Flatten: source rows followed by their key rows
  for (const source of sourceRows) {
    rows.push(source);
    for (const keyRow of source.keyRows) {
      rows.push(keyRow);
    }
  }

  rows.push({ kind: 'add', id: '__add__', label: ADD_ROW_LABEL });
  return rows;
}

function buildKeyRows(providerId: string, provider: ProviderConfig): readonly KeyRow[] {
  const apiKeys = provider.apiKeys;
  if (!apiKeys || Object.keys(apiKeys).length === 0) return [];

  const activeKeyId = provider.activeApiKeyId;
  return Object.entries(apiKeys).map(([keyId, keyInfo]) => ({
    kind: 'key' as const,
    id: `${providerId}:${keyId}`,
    providerId,
    keyId,
    label: keyInfo.name,
    preview: maskApiKey(keyInfo.key),
    isActive: keyId === activeKeyId,
    proxyUrl: keyInfo.proxyUrl,
  }));
}

function maskApiKey(key: string): string {
  if (key.length <= 12) return '*'.repeat(key.length);
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

/**
 * Display form of a per-key proxy: its host alone, so credentials a user
 * embeds in the URL never reach the dialog. A hand-edited config can hold a
 * value the URL parser rejects, hence the defensive strip of both the scheme
 * and any userinfo.
 */
function proxyHost(proxyUrl: string): string {
  try {
    const host = new URL(proxyUrl).host;
    if (host.length > 0) return host;
  } catch {
    // fall through to the strip below
  }
  const withoutScheme = proxyUrl.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '');
  const withoutUserinfo = withoutScheme.slice(withoutScheme.lastIndexOf('@') + 1);
  return withoutUserinfo.split('/')[0] ?? withoutUserinfo;
}

export class ProviderManagerComponent extends Container implements Focusable {
  focused = false;
  private opts: ProviderManagerOptions;
  private rows: readonly Row[];
  private selectedIndex: number;
  private confirm: ConfirmState | undefined;

  constructor(opts: ProviderManagerOptions) {
    super();
    this.opts = opts;
    this.rows = buildRows(opts);
    const activeIdx = opts.activeProviderId
      ? this.rows.findIndex(
          (row) => row.kind === 'source' && row.providerIds.includes(opts.activeProviderId ?? ''),
        )
      : -1;
    this.selectedIndex = Math.max(activeIdx, 0);
    this.confirm = undefined;
  }

  setOptions(next: ProviderManagerOptions): void {
    const previousSelected = this.rows[this.selectedIndex];
    const previousSelectedId = previousSelected?.id;
    const previousFirstProviderId =
      previousSelected?.kind === 'source' ? previousSelected.providerIds[0] : undefined;

    this.opts = next;
    this.rows = buildRows(next);
    this.confirm = undefined;

    let newIdx = -1;
    if (previousSelectedId !== undefined) {
      newIdx = this.rows.findIndex((row) => row.id === previousSelectedId);
    }
    if (newIdx < 0 && previousFirstProviderId !== undefined) {
      newIdx = this.rows.findIndex(
        (row) => row.kind === 'source' && row.providerIds.includes(previousFirstProviderId),
      );
    }
    if (newIdx < 0) {
      newIdx = Math.min(this.selectedIndex, Math.max(0, this.rows.length - 1));
    }
    this.selectedIndex = newIdx;
    this.invalidate();
  }

  private page(): PageView {
    return pageView(this.rows.length, this.selectedIndex, PAGE_SIZE);
  }

  handleInput(data: string): void {
    if (this.confirm !== undefined) {
      this.handleConfirmInput(data);
      return;
    }

    if (matchesKey(data, Key.escape)) {
      this.opts.onClose();
      return;
    }

    const rows = this.rows;

    if (matchesKey(data, Key.up)) {
      if (rows.length === 0) return;
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      this.invalidate();
      return;
    }
    if (matchesKey(data, Key.down)) {
      if (rows.length === 0) return;
      this.selectedIndex = Math.min(rows.length - 1, this.selectedIndex + 1);
      this.invalidate();
      return;
    }

    if (matchesKey(data, Key.left) || matchesKey(data, Key.pageUp)) {
      if (rows.length === 0) return;
      this.selectedIndex = Math.max(0, this.selectedIndex - PAGE_SIZE);
      this.invalidate();
      return;
    }
    if (matchesKey(data, Key.right) || matchesKey(data, Key.pageDown)) {
      if (rows.length === 0) return;
      this.selectedIndex = Math.min(rows.length - 1, this.selectedIndex + PAGE_SIZE);
      this.invalidate();
      return;
    }

    if (matchesKey(data, Key.enter)) {
      const selected = rows[this.selectedIndex];
      if (selected?.kind === 'add') {
        this.opts.onAdd();
      }
      return;
    }

    const ch = printableChar(data);
    const selected = rows[this.selectedIndex];

    // Key row actions: A=add key, S=set active, D=delete key
    if (selected?.kind === 'key') {
      if (ch === 'a' || ch === 'A') {
        this.opts.onAddKey(selected.providerId);
        return;
      }
      if (ch === 's' || ch === 'S') {
        this.opts.onSetActiveKey(selected.providerId, selected.keyId);
        return;
      }
      if (ch === 'd' || ch === 'D') {
        this.armDeleteKeyConfirm(selected);
        return;
      }
    }

    // Source row actions: A=add key (if provider supports it), D=delete provider, P=proxy
    if (selected?.kind === 'source') {
      if ((ch === 'a' || ch === 'A') && selected.providerIds.length === 1) {
        // Only allow adding keys to standalone providers (not grouped ones)
        const providerId = selected.providerIds[0];
        if (providerId) this.opts.onAddKey(providerId);
        return;
      }
      if ((ch === 'p' || ch === 'P') && selected.providerIds.length === 1) {
        // Allow setting proxy URL for standalone providers
        const providerId = selected.providerIds[0];
        if (providerId) this.opts.onSetProxyUrl(providerId);
        return;
      }
      if ((ch === 'r' || ch === 'R') && selected.providerIds.length === 1) {
        // Allow toggling key rotation for standalone providers
        const providerId = selected.providerIds[0];
        if (providerId) this.opts.onToggleRotation(providerId);
        return;
      }
      if (ch === 'd' || ch === 'D') {
        this.armDeleteProviderConfirm(selected);
        return;
      }
    }
  }

  private armDeleteProviderConfirm(selected: SourceRow): void {
    const prompt =
      selected.providerIds.length === 1
        ? `Delete platform "${selected.label}"?`
        : `Delete platform "${selected.label}" and all ${String(selected.providerIds.length)} providers?`;
    this.confirm = {
      label: prompt,
      providerIds: selected.providerIds,
    };
    this.invalidate();
  }

  private armDeleteKeyConfirm(selected: KeyRow): void {
    const prompt = `Delete API key "${selected.label}" from provider "${selected.providerId}"?`;
    this.confirm = {
      label: prompt,
      providerIds: [`${selected.providerId}:${selected.keyId}`], // special format for key deletion
    };
    this.invalidate();
  }

  private handleConfirmInput(data: string): void {
    const k = printableChar(data);
    if (matchesKey(data, Key.escape) || k === 'n' || k === 'N') {
      this.confirm = undefined;
      this.invalidate();
      return;
    }
    if (k === 'y' || k === 'Y') {
      const confirm = this.confirm;
      this.confirm = undefined;
      this.invalidate();
      if (confirm === undefined) return;
      // Check if it's a key deletion (format: "providerId:keyId")
      const firstId = confirm.providerIds[0];
      if (!firstId) return;
      if (firstId.includes(':')) {
        const parts = firstId.split(':', 2);
        const providerId = parts[0];
        const keyId = parts[1];
        if (providerId && keyId) {
          this.opts.onRemoveKey(providerId, keyId);
        }
      } else {
        this.opts.onDeleteSource(confirm.providerIds);
      }
      return;
    }
  }

  override render(width: number): string[] {
    const lines: string[] = [];

    const border = currentTheme.fg('primary', '─'.repeat(width));
    lines.push(border);
    lines.push(currentTheme.boldFg('primary', ' Providers'));
    lines.push(currentTheme.fg('textMuted', ' ' + HEADER_HINT));
    lines.push('');

    const rows = this.rows;
    if (rows.length === 0) {
      lines.push(currentTheme.fg('textMuted', '  No providers configured.'));
    } else {
      const view = this.page();
      for (let i = view.start; i < view.end; i++) {
        const row = rows[i];
        if (row === undefined) continue;
        for (const line of renderRow(row, { isSelected: i === this.selectedIndex, width })) {
          lines.push(line);
        }
      }
    }

    lines.push('');

    if (this.confirm !== undefined) {
      lines.push(this.renderConfirmLine(width));
    } else {
      const view = this.page();
      if (view.pageCount > 1) {
        lines.push(
          currentTheme.fg(
            'textMuted',
            ` Page ${String(view.page + 1)}/${String(view.pageCount)}`,
          ),
        );
      }
    }

    lines.push(border);
    return lines.map((line) => truncateToWidth(line, width));
  }

  private renderConfirmLine(width: number): string {
    const confirm = this.confirm;
    const prompt = confirm?.label ?? '';
    const styled = currentTheme.boldFg('warning', `  ${prompt} [y/N]`);
    return truncateToWidth(styled, width, '…');
  }
}


function renderRow(
  row: Row,
  ctx: { isSelected: boolean; width: number },
): string[] {
  const { isSelected, width } = ctx;
  const pointer = isSelected ? SELECT_POINTER : ' ';
  const pointerStyle = (text: string) =>
    isSelected ? currentTheme.fg('primary', text) : currentTheme.fg('textDim', text);
  const labelStyle = (text: string) =>
    isSelected
      ? currentTheme.boldFg('primary', text)
      : row.kind === 'add'
        ? currentTheme.fg('primary', text)
        : currentTheme.fg('text', text);

  // The active provider is flagged with a trailing "← current" (success),
  // matching the model selector's current-item marker — see .agents/skills/write-tui/DESIGN.md.
  const isActiveProvider = row.kind === 'source' && row.hasActive;
  const isActiveKey = row.kind === 'key' && row.isActive;
  const marker = (isActiveProvider || isActiveKey) ? ` ${CURRENT_MARK}` : '';

  const labelWidth = Math.max(0, width - 4 - visibleWidth(marker));
  const labelText = truncateToWidth(row.label, labelWidth, '…');
  let line = `  ${pointerStyle(`${pointer} `)}${labelStyle(labelText)}`;
  if (isActiveProvider || isActiveKey) line += currentTheme.fg('success', marker);

  const lines: string[] = [line];

  if (row.kind === 'source') {
    if (row.baseUrl !== undefined && row.baseUrl.length > 0) {
      const urlText = truncateToWidth(row.baseUrl, Math.max(0, width - 6), '…');
      lines.push(currentTheme.fg('textMuted', `      ${urlText}`));
    }
    if (row.keyRows.length >= 2) {
      const state = row.rotateKeys === true ? 'on' : 'off';
      lines.push(
        currentTheme.fg(
          row.rotateKeys === true ? 'success' : 'textDim',
          `      rotate keys: ${state}`,
        ),
      );
    }
    // Key rows are rendered as separate entries in the flat rows array,
    // so we don't render them again here.
  } else if (row.kind === 'key') {
    // Render key row with indentation
    const keyLabelWidth = Math.max(0, width - 8 - visibleWidth(marker));
    const keyLabelText = truncateToWidth(row.label, keyLabelWidth, '…');
    const keyPointer = isSelected ? SELECT_POINTER : ' ';
    const keyPointerStyle = (text: string) =>
      isSelected ? currentTheme.fg('primary', text) : currentTheme.fg('textDim', text);
    const keyLine = `    ${keyPointerStyle(`${keyPointer} `)}${currentTheme.fg('text', keyLabelText)}  ${currentTheme.fg('textMuted', row.preview)}`;
    if (row.isActive) {
      lines.push(currentTheme.fg('success', `${keyLine} ${CURRENT_MARK}`));
    } else {
      lines.push(keyLine);
    }
    if (row.proxyUrl !== undefined) {
      const proxyText = truncateToWidth(proxyHost(row.proxyUrl), Math.max(0, width - 8), '…');
      lines.push(currentTheme.fg('textMuted', `      proxy: ${proxyText}`));
    }
  }

  return lines;
}
