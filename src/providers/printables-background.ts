// SPDX-License-Identifier: GPL-3.0-or-later
import { MAX_QUERY_LENGTH, normalizeQuery } from '../search/query';
import { PAGE_SIZE, offsetNumber } from './pagination';
import { normalizePrintablesPage } from './printables';
import { PrintablesFailure } from './printables-messages';
import type { MessageListener, PrintablesRuntime, PrintablesSearchMessage, PrintablesReply } from './printables-messages';

const ENDPOINT = 'https://api.printables.com/graphql/';
function validMessage(value: unknown): value is PrintablesSearchMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;
  if (Object.keys(message).sort().join(',') !== 'limit,offset,query,type'
    || message.type !== 'printables.search'
    || typeof message.query !== 'string' || !message.query.length || message.query.length > MAX_QUERY_LENGTH
    || normalizeQuery(message.query) !== message.query
    || typeof message.limit !== 'number' || !Number.isInteger(message.limit) || message.limit < 1 || message.limit > PAGE_SIZE
    || typeof message.offset !== 'number' || !Number.isInteger(message.offset)) return false;
  try { offsetNumber(String(message.offset)); return true; } catch { return false; }
}

/** A single bundled operation, never a URL/header/method forwarding proxy. */
export function registerPrintablesHandler(runtime: PrintablesRuntime): void {
  let blockedUntil = 0;
  async function search(message: PrintablesSearchMessage): Promise<PrintablesReply> {
    try {
      if (Date.now() < blockedUntil) throw new PrintablesFailure('rate-limited');
      const { query, limit, offset } = message;
      // Only image.filePath is added to the live-working minimal selection.
      const operation = `query { searchPrints2(query: ${JSON.stringify(query)}, limit: ${limit}, offset: ${offset}) { totalCount items { id name slug likesCount downloadCount image { filePath } } } }`;
      let response: Response;
      try {
        response = await fetch(ENDPOINT, {
          method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: operation }),
        });
      } catch { throw new PrintablesFailure('network'); }
      if (response.status === 429) {
        const retry = response.headers.get('retry-after');
        const now = Date.now();
        const reset = retry && /^\d+$/.test(retry) ? now + Number(retry) * 1000 : Date.parse(retry ?? '');
        blockedUntil = Number.isFinite(reset) && reset > now ? reset : now + 60_000;
        throw new PrintablesFailure('rate-limited');
      }
      if (!response.ok) throw new PrintablesFailure('http', response.status);
      let payload: unknown;
      try { payload = await response.json(); } catch { throw new PrintablesFailure('invalid-json'); }
      return { ok: true, page: normalizePrintablesPage(payload, query, offset) };
    } catch (error) {
      return { ok: false, error: error instanceof PrintablesFailure
        ? { kind: error.kind, ...(error.status === undefined ? {} : { status: error.status }) }
        : { kind: 'invalid-response' } };
    }
  }
  const listener: MessageListener = (message, sender, respond) => {
    // No external messages or arbitrary webpage/content-script senders.
    if (sender.id !== runtime.id || typeof sender.url !== 'string') return false;
    try {
      const source = new URL(sender.url);
      const results = new URL(runtime.getURL('src/results/index.html'));
      if (source.protocol !== results.protocol || source.host !== results.host || source.pathname !== results.pathname) return false;
    } catch { return false; }
    if (!validMessage(message)) {
      respond({ ok: false, error: { kind: 'invalid-request' } });
      return false;
    }
    void search(message).then((reply) => {
      try { respond(reply); } catch { /* The Results tab may have closed or cancelled its channel. */ }
    });
    return true; // Keep the reply channel open on Chromium versions without async listeners.
  };
  runtime.onMessage.addListener(listener);
}
