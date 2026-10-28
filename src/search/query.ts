// SPDX-License-Identifier: GPL-3.0-or-later
export const MAX_QUERY_LENGTH = 200;

export function normalizeQuery(value: string): string {
  // URL-based providers use encodeURIComponent, which throws on lone surrogates.
  const valid = value.trim().replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\ufffd');
  const bounded = valid.slice(0, MAX_QUERY_LENGTH);
  return /[\uD800-\uDBFF]$/.test(bounded) ? bounded.slice(0, -1) : bounded;
}

export function readSearch(search: string, expandedDefault = false) {
  const params = new URLSearchParams(search);
  return {
    query: normalizeQuery(params.get('q') ?? ''),
    expanded: params.has('q') ? params.get('expanded') === '1' : expandedDefault,
  };
}
