// SPDX-License-Identifier: GPL-3.0-or-later
import { expect, it } from 'vitest';
import { normalizeSketchfabPage, sketchfabSearchUrl } from '../src/providers/sketchfab';

const live = import.meta.env.MODE === 'live' ? it : it.skip;

live('anonymous Sketchfab public search smoke test', async () => {
  const response = await fetch(sketchfabSearchUrl('benchy'), { headers: { Accept: 'application/json' } });
  expect(response.status).toBe(200);
  const page = normalizeSketchfabPage(await response.json(), 'benchy');
  expect(page.results.length).toBeGreaterThan(0);
  expect(page.results[0]?.url).toMatch(/^https:\/\/(?:www\.)?sketchfab\.com\/3d-models\//);
  console.info(JSON.stringify({ httpStatus: response.status, normalized: page.results.length,
    hasNextPage: Boolean(page.nextCursor), firstTitle: page.results[0]?.title,
    hasThumbnail: Boolean(page.results[0]?.thumbnail), canonicalUrl: page.results[0]?.url }));
});
