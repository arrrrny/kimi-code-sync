export interface OpencodeSessionInput {
    readonly cacheKey?: string;
    readonly apiKey?: string;
    readonly baseUrl?: string;
}
export declare function opencodeSessionHeaders(input: OpencodeSessionInput): Record<string, string> | undefined;
