// SPDX-License-Identifier: GPL-3.0-or-later
/** A conservative client batch size, not a claim about the providers' API maximum. */
export const PAGE_SIZE = 20;

export function pageNumber(cursor: string | undefined): number {
  const page = cursor === undefined ? 1 : Number(cursor);
  if (!Number.isSafeInteger(page) || page < 1 || (cursor !== undefined && String(page) !== cursor)) {
    throw new Error('Invalid provider continuation. Start a new search.');
  }
  return page;
}

export function offsetNumber(cursor: string | undefined): number {
  const offset = cursor === undefined ? 0 : Number(cursor);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 2_147_483_647 || (cursor !== undefined && String(offset) !== cursor)) {
    throw new Error('Invalid provider continuation. Start a new search.');
  }
  return offset;
}

export function nextOffset(offset: number, count: number, total: unknown): string | undefined {
  const knownTotal = typeof total === 'number' && Number.isSafeInteger(total) && total >= 0 ? total : undefined;
  if (count === 0 || (knownTotal !== undefined ? offset + count >= knownTotal : count < PAGE_SIZE)) return;
  return String(offset + count);
}

/** Use raw item counts, not filtered/normalized counts. Never trust a next-page URL. */
export function nextPage(page: number, count: number, total: unknown): string | undefined {
  const knownTotal = typeof total === 'number' && Number.isSafeInteger(total) && total >= 0 ? total : undefined;
  if (count === 0 || (knownTotal !== undefined ? (page - 1) * PAGE_SIZE + count >= knownTotal : count < PAGE_SIZE)) return;
  return String(page + 1);
}
