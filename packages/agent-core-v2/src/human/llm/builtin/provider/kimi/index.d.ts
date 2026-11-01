export { classifyKimiQuotaError } from './errors';
export { KIMI_DEFAULT_BASE_URL, kimiAnthropicProtocol, kimiOpenAIProtocol, kimiResponsesProtocol } from './protocol';
export declare const kimiRequester: import("#/llm/requester").LlmRequester<"endpoint" | "protocol">;
export declare const kimiAnthropicRequester: import("#/llm/requester").LlmRequester<"endpoint" | "protocol">;
export declare const kimiResponsesRequester: import("#/llm/requester").LlmRequester<"endpoint" | "protocol">;
export declare const kimiRequesters: {
    readonly openai: import("#/llm/requester").LlmRequester<"endpoint" | "protocol">;
    readonly anthropic: import("#/llm/requester").LlmRequester<"endpoint" | "protocol">;
    readonly openai_responses: import("#/llm/requester").LlmRequester<"endpoint" | "protocol">;
};
