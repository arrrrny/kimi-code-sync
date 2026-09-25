import { join } from 'pathe';

import { Service } from '#/_base/di/service';
import { createDecorator } from '#/_base/di/instantiation';
import { IAgentScopeContext } from '#/agent/scopeContext/scopeContext';
import { IBlobStore } from '#/persistence/interface/blobStore';
import { ISessionContext } from '#/session/sessionContext/sessionContext';

export const HANDOFF_STORAGE_DIR = 'handoff';

export function handoffFileName(timestampMs: number, sequence: number): string {
  const at = new Date(timestampMs);
  const two = (value: number) => String(value).padStart(2, '0');
  const three = (value: number) => String(value).padStart(3, '0');
  const date = `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}`;
  const time = `${two(at.getHours())}-${two(at.getMinutes())}-${two(at.getSeconds())}-${three(at.getMilliseconds())}`;
  return `${date}T${time}-${three(sequence)}.md`;
}

export function handoffStoragePath(sessionDir: string, agentId: string, fileName: string): string {
  return join(sessionDir, 'agents', agentId, HANDOFF_STORAGE_DIR, fileName);
}

export class AgentHandoffDocumentService extends Service {
  declare readonly _serviceBrand: undefined;

  private sequence = 0;
  private lastPath: string | undefined;

  constructor(
    @IBlobStore private readonly blobs: IBlobStore,
    @ISessionContext private readonly sessionCtx: ISessionContext,
    @IAgentScopeContext private readonly agent: IAgentScopeContext,
  ) {
    super();
  }

  get previousHandoffPath(): string | undefined {
    return this.lastPath;
  }

  async resumePointer(): Promise<string | undefined> {
    if (this.lastPath === undefined) {
      this.lastPath = await this.newestStoredHandoffPath();
    }
    return this.lastPath;
  }

  async record(document: string, timestampMs: number): Promise<string> {
    this.sequence += 1;
    const fileName = handoffFileName(timestampMs, this.sequence);
    const bytes = new TextEncoder().encode(document.replace(/\s+$/, ''));
    await this.blobs.put(this.agent.scope(), `${HANDOFF_STORAGE_DIR}/${fileName}`, bytes);
    this.lastPath = handoffStoragePath(this.sessionCtx.sessionDir, this.agent.agentId, fileName);
    return this.lastPath;
  }

  private async newestStoredHandoffPath(): Promise<string | undefined> {
    let names: readonly string[];
    try {
      names = await this.blobs.list(`${this.agent.scope()}/${HANDOFF_STORAGE_DIR}`);
    } catch {
      return undefined;
    }
    const newest = names.filter((name) => name.endsWith('.md')).toSorted().at(-1);
    return newest === undefined
      ? undefined
      : handoffStoragePath(this.sessionCtx.sessionDir, this.agent.agentId, newest);
  }
}

export const IAgentHandoffDocumentService =
  createDecorator<AgentHandoffDocumentService>('agentHandoffDocumentService');
