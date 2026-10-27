// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest';
import { MAX_QUERY_LENGTH, normalizeQuery, readSearch } from '../src/search/query';
import { initializeSearchForm } from '../src/search/form';

describe('search handoff', () => {
  it('preserves special characters and Unicode in encoded query parameters', () => {
    const query = 'gear & bolt + café #1? <script>alert("x")</script> 🛠';
    const params = new URLSearchParams({ q: query, expanded: '1' });
    expect(readSearch(`?${params}`)).toEqual({ query, expanded: true });
  });

  it('uses the preference for a fresh page, and explicit URL state for a search', () => {
    expect(readSearch('', true)).toEqual({ query: '', expanded: true });
    expect(readSearch('?q=bolt', true)).toEqual({ query: 'bolt', expanded: false });
    expect(readSearch('?q=bolt&expanded=1')).toEqual({ query: 'bolt', expanded: true });
    expect(readSearch('?q=bolt&expanded=false', true).expanded).toBe(false);
  });

  it('trims and bounds incoming queries, including direct URLs', () => {
    expect(normalizeQuery('   ')).toBe('');
    expect(readSearch('?q=%20bolt%20').query).toBe('bolt');
    expect(normalizeQuery('x'.repeat(1000))).toHaveLength(MAX_QUERY_LENGTH);
  });

  it('rejects whitespace on submit and clears the error when typing resumes', () => {
    const input = {
      value: '   ', maxLength: 0,
      addEventListener: vi.fn(), setCustomValidity: vi.fn(), reportValidity: vi.fn(),
    };
    const expanded = { checked: false };
    const form = {
      elements: { namedItem: (name: string) => name === 'q' ? input : expanded },
      addEventListener: vi.fn(),
    };
    initializeSearchForm(form as unknown as HTMLFormElement, true);
    expect(expanded.checked).toBe(true);
    expect(input.maxLength).toBe(MAX_QUERY_LENGTH);
    const submit = form.addEventListener.mock.calls[0]![1];
    const event = { preventDefault: vi.fn() };
    submit(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(input.setCustomValidity).toHaveBeenLastCalledWith('Enter a search query.');
    input.addEventListener.mock.calls[0]![1]();
    expect(input.setCustomValidity).toHaveBeenLastCalledWith('');
    input.value = '  bolt & nut  ';
    event.preventDefault.mockClear();
    submit(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(input.value).toBe('bolt & nut');
  });
});
