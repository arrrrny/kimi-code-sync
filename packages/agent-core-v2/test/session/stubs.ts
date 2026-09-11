import { Emitter, type Event } from '#/_base/event';
import type { IOAuthService } from '#/app/auth/auth';
import {
  type ConfigChangedEvent,
  type ConfigDiagnostic,
  type ConfigInspectValue,
  IConfigService,
  type ResolvedConfig,
} from '#/app/config/config';
import type { IModelOAuthTokens } from '#/llm-adapter/model/model-oauth';

export class StubConfigService implements IConfigService {
  declare readonly _serviceBrand: undefined;
  readonly ready = Promise.resolve();
  private readonly _onDidChange = new Emitter<ConfigChangedEvent>();
  readonly onDidChangeConfiguration: Event<ConfigChangedEvent> = this._onDidChange.event;
  readonly onDidSectionChange: Event<ConfigChangedEvent> = this._onDidChange.event;
  private readonly _onDidChangeDiagnostics = new Emitter<readonly ConfigDiagnostic[]>();
  readonly onDidChangeDiagnostics: Event<readonly ConfigDiagnostic[]> =
    this._onDidChangeDiagnostics.event;
  private readonly _values = new Map<string, unknown>();

  constructor(initial?: Record<string, unknown>) {
    for (const [domain, value] of Object.entries(initial ?? {})) {
      this._values.set(domain, value);
    }
  }

  get<T = unknown>(domain: string): T {
    return this._values.get(domain) as T;
  }

  inspect<T = unknown>(_domain: string): ConfigInspectValue<T> {
    return undefined as unknown as ConfigInspectValue<T>;
  }

  update<K extends string>(_domain: K, _value: unknown): void {}

  patch<K extends string>(_domain: K, _patch: unknown): void {}

  getAll(): Readonly<Record<string, unknown>> {
    return Object.fromEntries(this._values.entries());
  }

  set<K extends string>(_domain: K, _value: unknown): Promise<void> {
    return Promise.resolve();
  }

  replace<K extends string>(_domain: K, _value: unknown): Promise<void> {
    return Promise.resolve();
  }

  replaceSections(_sections: Record<string, unknown>): Promise<void> {
    return Promise.resolve();
  }

  reload(): Promise<void> {
    return Promise.resolve();
  }

  inspectResolved(): ResolvedConfig {
    return {} as ResolvedConfig;
  }

  diagnostics(): readonly ConfigDiagnostic[] {
    return [];
  }

  oauth(): IOAuthService {
    return {} as IOAuthService;
  }

  modelOAuth(): Promise<IModelOAuthTokens | undefined> {
    return Promise.resolve(undefined);
  }

  fireChange(): void {
    this._onDidChange.fire({} as ConfigChangedEvent);
  }

  fireDiagnostics(diagnostics: readonly ConfigDiagnostic[]): void {
    this._onDidChangeDiagnostics.fire(diagnostics);
  }
}