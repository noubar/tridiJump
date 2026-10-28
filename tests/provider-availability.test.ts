// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { providerAvailability } from '../src/providers/availability';

describe('provider classification and native fallbacks', () => {
  it('accounts for all six providers without presenting unconfirmed free access as available aggregation', () => {
    expect(providerAvailability.map((source) => source.id).sort()).toEqual([
      'cults3d', 'makerworld', 'myminifactory', 'printables', 'thangs', 'thingiverse',
    ]);
    for (const source of providerAvailability) {
      expect(source.classification).toBe('D');
      expect(source.reason).not.toBe('');
    }
  });

  it.each(providerAvailability)('encodes native search only for $name without credentials or executable URLs', (source) => {
    const query = 'café / part ? # + & <script> "';
    const url = new URL(source.searchUrl(query));
    expect(url.protocol).toBe('https:');
    expect(url.username).toBe('');
    expect(url.password).toBe('');
    expect(url.hash).toBe('');
    if (source.id === 'thangs') {
      expect(decodeURIComponent(url.pathname.slice('/search/'.length))).toBe(query);
      expect(url.searchParams.get('scope')).toBe('thangs');
    } else {
      const parameter = source.id === 'myminifactory' ? 'query' : source.id === 'makerworld' ? 'keyword' : 'q';
      expect(url.searchParams.get(parameter)).toBe(query);
    }
    for (const parameter of ['apiKey', 'key', 'token', 'access_token', 'password']) expect(url.searchParams.has(parameter)).toBe(false);
  });
});
