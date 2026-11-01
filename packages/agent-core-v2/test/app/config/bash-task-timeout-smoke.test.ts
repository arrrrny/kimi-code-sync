import { DisposableStore } from '#/_base/di/lifecycle';
import { SyncDescriptor } from '#/_base/di/descriptors';
import { TestInstantiationService } from '#/_base/di/test';
import { stubLog } from '../../_base/log/stubs';
import { IConfigService, IConfigRegistry } from '#/app/config/config';
import { ConfigService, ConfigRegistry } from '#/app/config/configService';
import { stubBootstrap } from '../../app/bootstrap/stubs';
import { IBootstrapService } from '#/app/bootstrap/bootstrap';
import { ILogService } from '#/_base/log/log';
import { InMemoryStorageService } from '#/persistence/backends/memory/inMemoryStorageService';
import { IFileSystemStorageService } from '#/persistence/interface/storage';
import { IAtomicTomlDocumentStore } from '#/persistence/interface/atomicDocumentStore';
import { TomlAtomicDocumentStore } from '#/persistence/backends/node-fs/atomicDocumentStore';
import { resolveAgentTaskConfig } from '#/agent/task/configSection';
import '#/agent/task/configSection';
import { describe, expect, it } from 'vitest';

describe('bash_task_timeout_s smoke (PR #44)', () => {
  it('honors [task] bash_task_timeout_s = 1800 through the production ConfigService loader', async () => {
    const disposables = new DisposableStore();
    try {
      const ix = disposables.add(new TestInstantiationService());
      const storage = new InMemoryStorageService();
      const toml = '[task]\nbash_task_timeout_s = 1800\n';
      await storage.write('', 'config.toml', new TextEncoder().encode(toml));

      ix.stub(ILogService, stubLog());
      ix.stub(IBootstrapService, stubBootstrap('/tmp/kimi-cfg', {}));
      ix.stub(IFileSystemStorageService, storage);
      ix.set(IAtomicTomlDocumentStore, new SyncDescriptor(TomlAtomicDocumentStore));
      ix.set(IConfigRegistry, new SyncDescriptor(ConfigRegistry));
      ix.set(IConfigService, new SyncDescriptor(ConfigService));

      const config = ix.get(IConfigService);
      await config.ready;

      expect(resolveAgentTaskConfig(config)?.bashTaskTimeoutS).toBe(1800);
    } finally {
      disposables.dispose();
    }
  });

  it('honors [background] bash_task_timeout_s = 1800 via the legacy alias', async () => {
    const disposables = new DisposableStore();
    try {
      const ix = disposables.add(new TestInstantiationService());
      const storage = new InMemoryStorageService();
      const toml = '[background]\nbash_task_timeout_s = 1800\n';
      await storage.write('', 'config.toml', new TextEncoder().encode(toml));

      ix.stub(ILogService, stubLog());
      ix.stub(IBootstrapService, stubBootstrap('/tmp/kimi-cfg', {}));
      ix.stub(IFileSystemStorageService, storage);
      ix.set(IAtomicTomlDocumentStore, new SyncDescriptor(TomlAtomicDocumentStore));
      ix.set(IConfigRegistry, new SyncDescriptor(ConfigRegistry));
      ix.set(IConfigService, new SyncDescriptor(ConfigService));

      const config = ix.get(IConfigService);
      await config.ready;

      expect(resolveAgentTaskConfig(config)?.bashTaskTimeoutS).toBe(1800);
    } finally {
      disposables.dispose();
    }
  });
});