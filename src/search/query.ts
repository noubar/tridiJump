// SPDX-License-Identifier: GPL-3.0-or-later
export const MAX_QUERY_LENGTH = 200;

export function normalizeQuery(value: string): string {
  return value.trim().slice(0, MAX_QUERY_LENGTH);
}

export function readSearch(search: string, expandedDefault = false) {
  const params = new URLSearchParams(search);
  return {
    query: normalizeQuery(params.get('q') ?? ''),
    expanded: params.has('q') ? params.get('expanded') === '1' : expandedDefault,
  };
}
