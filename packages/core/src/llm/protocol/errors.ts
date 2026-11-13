/**
 * Request error helpers: local syntax errors (`SyntaxRequestFormatError`, `ThinkingConfigError`), abort
 * detection, error text, and conversion of unknown errors into `LlmErrorMessage`.
 */
import type { LlmErrorMessage, LlmRemoteErrorMessage } from '#/llm/response';
import { isTransientHttpStatus, toLlmStatusErrorMessage } from './rules/status';

export function sanitizeStatusErrorMessage(message: string): string {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(message);
  const extracted = titleMatch?.[1]?.trim();
  const normalized = extracted !== undefined && extracted.length > 0 ? extracted : message;
  return normalized.replaceAll('\r', '');
}

export function errorStatusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const record = error as Record<string, unknown>;
  const status = record['status'] ?? record['statusCode'];
  return typeof status === 'number' ? status : undefined;
}

/**
 * Walks an error's `cause` chain looking for a thrown error that carries an
 * HTTP status (provider SDKs wrap fetch rejections in their own connection
 * error classes, keeping the original provider error as the cause).
 */
export function statusErrorInCauseChain(error: unknown): unknown {
  let current: unknown = error;
  for (let depth = 0; current instanceof Error && depth < 5; depth += 1) {
    if (errorStatusCode(current) !== undefined) return current;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export class SyntaxRequestFormatError extends Error {
  toLlmErrorMessage(): LlmErrorMessage<'syntax'> {
    return { kind: 'syntax', code: 'request_format', message: this.message };
  }
}

export function toLlmSyntaxErrorMessage(error: unknown): LlmErrorMessage<'syntax'> {
  if (error instanceof SyntaxRequestFormatError) {
    return error.toLlmErrorMessage();
  }
  return {
    kind: 'syntax',
    code: 'internal',
    message: error instanceof Error ? error.message : String(error),
  };
}

type ThinkingConfigErrorCode =
  | 'thinking-unsupported'
  | 'thinking-cannot-disable'
  | 'off-needs-offeffort'
  | 'effort-unsupported';

export class ThinkingConfigError extends SyntaxRequestFormatError {
  readonly code: ThinkingConfigErrorCode;

  constructor(code: ThinkingConfigErrorCode, message: string) {
    super(message);
    this.name = 'ThinkingConfigError';
    this.code = code;
  }

  override toLlmErrorMessage(): LlmErrorMessage<'syntax'> {
    return { kind: 'syntax', code: 'thinking_config', message: this.message };
  }
}

export function unresolvedMediaRefError(ref: string): SyntaxRequestFormatError {
  return new SyntaxRequestFormatError(
    `Unresolved media reference '${ref}': messages must be lowered before encoding`,
  );
}

export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error && error.name === 'AbortError') return true;
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as object).constructor?.name === 'APIUserAbortError'
  );
}

function abortErrorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return 'The operation was aborted.';
}

export function errorText(error: unknown): string {
  try {
    return error instanceof Error ? error.message : String(error);
  } catch {
    return 'unprintable error';
  }
}

export function toLlmErrorMessage(error: unknown): LlmRemoteErrorMessage {
  try {
    if (isAbortError(error)) {
      return { kind: 'abort', message: abortErrorMessage(error), retryable: false };
    }
  } catch {
    const code =
    typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : undefined;
  const cause =
    typeof error === 'object' && error !== null
      ? (error as { cause?: unknown }).cause
      : undefined;
  const causeCode =
    typeof cause === 'object' && cause !== null && typeof (cause as { code?: unknown }).code === 'string'
      ? (cause as { code: string }).code
      : undefined;
  return {
    kind: 'unknown',
    message: cause instanceof Error ? cause.message : errorText(error),
    retryable: false,
    code: code ?? causeCode,
    name: error instanceof Error ? error.name : undefined,
  };
  }
  const code =
    typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : undefined;
  const cause =
    typeof error === 'object' && error !== null
      ? (error as { cause?: unknown }).cause
      : undefined;
  const causeCode =
    typeof cause === 'object' && cause !== null && typeof (cause as { code?: unknown }).code === 'string'
      ? (cause as { code: string }).code
      : undefined;
  // Errors thrown by provider clients carry an HTTP status the same way a
  // response does — classify them through the status rules so recoveries
  // (auth rejection, key rotation, context overflow) see the same kinds the
  // decoded-HTTP path produces.
  const statusCode = errorStatusCode(error);
  if (statusCode !== undefined && statusCode >= 400) {
    const record = error as Record<string, unknown>;
    const requestId = typeof record['requestId'] === 'string' ? record['requestId'] : undefined;
    const retryAfterMs = typeof record['retryAfterMs'] === 'number' ? record['retryAfterMs'] : undefined;
    return toLlmStatusErrorMessage({
      statusCode,
      message: errorText(error),
      requestId,
      retryAfterMs,
      retryable: isTransientHttpStatus(statusCode),
    });
  }
  return {
    kind: 'unknown',
    message: cause instanceof Error ? cause.message : errorText(error),
    retryable: false,
    code: code ?? causeCode,
    name: error instanceof Error ? error.name : undefined,
  };
}
