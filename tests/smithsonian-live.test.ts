// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { normalizeSmithsonianPage, smithsonianSearchUrl } from '../src/providers/smithsonian';

const apiKey = process.env.TRIDIJUMP_SMITHSONIAN_API_KEY;
const enabled = import.meta.env.MODE === 'live' && Boolean(apiKey);

describe('Smithsonian opt-in live search', () => {
  it.skipIf(!enabled)('returns normalized 3D Voyager records for a conservative query', async () => {
    const response = await fetch(smithsonianSearchUrl('apollo', apiKey!));
    expect(response.ok).toBe(true);
    const payload: unknown = await response.json();
    const page = normalizeSmithsonianPage(payload, 'apollo');
    expect(page.results.length).toBeGreaterThan(0);
    expect(page.results.every((result) => result.providerId === 'smithsonian')).toBe(true);
    expect(page.results.every((result) => result.url.startsWith('https://3d-api.si.edu/voyager/3d_package:'))).toBe(true);
    console.info({ endpoint: 'https://api.si.edu/openaccess/api/v1.0/search', status: response.status,
      normalizedResults: page.results.length, hasContinuation: Boolean(page.nextCursor),
      first: page.results[0] && { title: page.results[0].title, hasThumbnail: Boolean(page.results[0].thumbnail),
        license: page.results[0].license, formats: page.results[0].formats } });
  });
});
