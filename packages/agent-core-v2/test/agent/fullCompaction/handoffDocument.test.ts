import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'pathe';
import { afterEach, describe, expect, it } from 'vitest';

import {
  AgentHandoffDocumentService,
  handoffFileName,
  handoffStoragePath,
} from '#/agent/fullCompaction/handoffDocument';
import { renderHandoffInstruction } from '#/agent/fullCompaction/handoffInstruction';
import { BlobStoreService } from '#/persistence/backends/node-fs/blobStoreService';
import { FileStorageService } from '#/persistence/backends/node-fs/fileStorageService';
import type { ISessionContext } from '#/session/sessionContext/sessionContext';
import type { IAgentScopeContext } from '#/agent/agentContext/agentContext';

const NAME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}-(\d{3})\.md$/;

describe('handoff file naming', () => {
  it('names a document by local date, millisecond time, and zero-padded sequence', () => {
    const name = handoffFileName(Date.UTC(2026, 8, 25, 10, 0, 0, 123), 7);
    expect(name).toMatch(NAME_PATTERN);
    expect(NAME_PATTERN.exec(name)?.[1]).toBe('007');
  });

  it('orders names lexicographically in chronological order across timestamps and sequences', () => {
    const first = handoffFileName(Date.UTC(2026, 8, 25, 10, 0, 0, 0), 1);
    const second = handoffFileName(Date.UTC(2026, 8, 25, 10, 0, 0, 1), 2);
    const third = handoffFileName(Date.UTC(2026, 8, 25, 10, 0, 1, 0), 12);
    expect(first < second).toBe(true);
    expect(second < third).toBe(true);
    expect(NAME_PATTERN.exec(first)?.[1]).toBe('001');
    expect(NAME_PATTERN.exec(third)?.[1]).toBe('012');
  });
});

describe('AgentHandoffDocumentService', () => {
  const homeDirs: string[] = [];

  function makeService(
    existingHomeDir?: string,
  ): { service: AgentHandoffDocumentService; sessionDir: string; homeDir: string } {
    const homeDir = existingHomeDir ?? mkdtempSync(join(tmpdir(), 'kimi-handoff-home-'));
    homeDirs.push(homeDir);
    const sessionDir = join(homeDir, 'sessions', 'ws1', 's1');
    const agentScope = 'sessions/ws1/s1/agents/agent-1';
    const blobs = new BlobStoreService(new FileStorageService(homeDir, 0o700, 0o600));
    const sessionCtx = { sessionDir } as ISessionContext;
    const agentCtx = {
      agentId: 'agent-1',
      scope: () => agentScope,
    } as unknown as IAgentScopeContext;
    const service = new AgentHandoffDocumentService(blobs, sessionCtx, agentCtx);
    return { service, sessionDir, homeDir };
  }

  afterEach(() => {
    for (const homeDir of homeDirs.splice(0)) {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it('persists a document atomically under the agent scope and reports its storage path', async () => {
    const { service, sessionDir } = makeService();
    const path = await service.record('# Handoff\n\ngist text\n', Date.UTC(2026, 8, 25, 10, 0, 0, 0));

    expect(path).toBe(
      handoffStoragePath(sessionDir, 'agent-1', handoffFileName(Date.UTC(2026, 8, 25, 10, 0, 0, 0), 1)),
    );
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, 'utf-8')).toBe('# Handoff\n\ngist text');
    expect(service.previousHandoffPath).toBe(path);
  });

  it('never overwrites an earlier document and advances the resume pointer', async () => {
    const { service } = makeService();
    const first = await service.record('first handoff\n', Date.UTC(2026, 8, 25, 10, 0, 0, 0));
    const firstContent = readFileSync(first, 'utf-8');

    const second = await service.record('second handoff\n', Date.UTC(2026, 8, 25, 10, 0, 5, 0));

    expect(second).not.toBe(first);
    expect(readFileSync(first, 'utf-8')).toBe(firstContent);
    expect(readFileSync(second, 'utf-8')).toBe('second handoff');
    expect(NAME_PATTERN.exec(basename(first))?.[1]).toBe('001');
    expect(NAME_PATTERN.exec(basename(second))?.[1]).toBe('002');
    expect(service.previousHandoffPath).toBe(second);
  });

  it('starts a fresh agent scope at sequence one with no resume pointer', async () => {
    const { service } = makeService();
    expect(service.previousHandoffPath).toBeUndefined();
    await expect(service.resumePointer()).resolves.toBeUndefined();
    const path = await service.record('fresh scope\n', Date.UTC(2026, 8, 25, 10, 0, 0, 0));
    expect(NAME_PATTERN.exec(basename(path))?.[1]).toBe('001');
  });

  it('seeds the resume pointer from the newest stored document in a revived process', async () => {
    const first = makeService();
    await first.service.record('first handoff\n', Date.UTC(2026, 8, 25, 10, 0, 0, 0));
    const secondPath = await first.service.record(
      'second handoff\n',
      Date.UTC(2026, 8, 25, 10, 0, 5, 0),
    );

    const revived = makeService(first.homeDir);
    expect(revived.service.previousHandoffPath).toBeUndefined();
    await expect(revived.service.resumePointer()).resolves.toBe(secondPath);
    expect(revived.service.previousHandoffPath).toBe(secondPath);
  });
});

describe('renderHandoffInstruction', () => {
  const FIXED_HEADINGS = [
    'Session Gist',
    'Current State',
    'The Threads',
    'Gotchas',
    'Files and Artifacts Touched',
    'Open Questions',
  ];

  function headingPositions(rendered: string, heading: string): number {
    return rendered.toLowerCase().split(heading.toLowerCase()).slice(0, -1).map(
      (_, index, parts) => parts.slice(0, index + 1).join(heading.toLowerCase()).length,
    );
  }

  it('requests the fixed section headings in order', () => {
    const rendered = renderHandoffInstruction({});
    let cursor = -1;
    for (const heading of FIXED_HEADINGS) {
      const next = rendered.toLowerCase().indexOf(heading.toLowerCase(), cursor + 1);
      expect(next).toBeGreaterThan(cursor);
      cursor = next;
    }
  });

  it('omits the resume pointer when no earlier handoff exists', () => {
    const rendered = renderHandoffInstruction({});
    expect(rendered).not.toMatch(/^##\s+Resume from/im);
  });

  it('points at the earlier handoff when one exists', () => {
    const rendered = renderHandoffInstruction({
      previousHandoffPath: '/home/sessions/w/s/agents/a/handoff/first.md',
    });
    expect(rendered).toContain('/home/sessions/w/s/agents/a/handoff/first.md');
    expect(rendered).toContain('## Resume from');
  });

  it('embeds the compaction instruction only when present', () => {
    const without = renderHandoffInstruction({});
    expect(without).not.toContain('Focus the handoff on the migration');

    const withInstruction = renderHandoffInstruction({
      customInstruction: 'Focus the handoff on the migration',
    });
    expect(withInstruction).toContain('Focus the handoff on the migration');
  });
});
