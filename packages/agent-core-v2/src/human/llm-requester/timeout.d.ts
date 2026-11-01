import { type Dispatcher } from 'undici';
export declare const LLM_HEADERS_TIMEOUT_ENV = "KIMI_CODE_LLM_HEADERS_TIMEOUT_MS";
type Env = Readonly<Record<string, string | undefined>>;
export declare function resolveLlmHeadersTimeoutMs(env?: Env): number | undefined;
export declare function createLlmHeadersTimeoutFetch(env?: Env): typeof fetch;
export declare function getLlmHeadersTimeoutDispatcher(timeoutMs: number, env?: Env): Dispatcher | undefined;

