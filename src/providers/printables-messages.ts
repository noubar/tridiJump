// SPDX-License-Identifier: GPL-3.0-or-later
import type { ResultPage } from './provider';

export interface PrintablesSearchMessage {
  type: 'printables.search';
  query: string;
  limit: number;
  offset: number;
}
export type PrintablesErrorKind = 'network' | 'http' | 'graphql' | 'invalid-response'
  | 'invalid-json' | 'invalid-request' | 'rate-limited' | 'transport';
export type PrintablesReply = { ok: true; page: ResultPage }
  | { ok: false; error: { kind: PrintablesErrorKind; status?: number } };

/** Messages carry categories, never remote exception text, headers or bodies. */
export class PrintablesFailure extends Error {
  constructor(readonly kind: PrintablesErrorKind, readonly status?: number) {
    const messages: Record<PrintablesErrorKind, string> = {
      network: 'Could not reach Printables. Open Printables directly.',
      http: status === 401 || status === 403
        ? 'Printables denied anonymous search access. Open Printables directly.'
        : `Printables search failed (HTTP ${status}). Open Printables directly.`,
      graphql: 'Printables rejected the search query. Its search interface may have changed. Open Printables directly.',
      'invalid-response': 'Printables returned an unexpected search response. Open Printables directly.',
      'invalid-json': 'Printables returned an unreadable response. Open Printables directly.',
      'invalid-request': 'Printables search request was invalid. Reload the extension and try again.',
      'rate-limited': 'Printables rate limit reached. Please wait before searching again.',
      transport: 'Printables background transport is unavailable. Reload the extension or open Printables directly.',
    };
    super(messages[kind]);
  }
}

export interface MessageSender { id?: string; url?: string }
export type MessageListener = (message: unknown, sender: MessageSender, respond: (reply: PrintablesReply) => void) => boolean;
export interface PrintablesRuntime {
  id: string;
  getURL(path: string): string;
  sendMessage(message: PrintablesSearchMessage): Promise<unknown>;
  onMessage: { addListener(listener: MessageListener): void };
}
export function printablesRuntime(): PrintablesRuntime | undefined {
  return (globalThis as typeof globalThis & { chrome?: { runtime?: PrintablesRuntime } }).chrome?.runtime;
}
