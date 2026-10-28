// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import popup from '../src/popup/index.html?raw';
import results from '../src/results/index.html?raw';
import { normalizeQuery } from '../src/search/query';
import { providerAvailability } from '../src/providers/availability';
import { mockExtensionStorage } from './helpers/extension-storage';

beforeEach(() => { vi.resetModules(); localStorage.clear(); });
afterEach(() => { window.dispatchEvent(new Event('pagehide')); document.body.replaceChildren(); vi.unstubAllGlobals(); });

it('does not split a Unicode character at the query bound and keeps all six native URLs encodable', () => {
  const input = 'a'.repeat(199) + '🧢';
  const query = normalizeQuery(input);
  expect(query).toBe('a'.repeat(199));
  for (const source of providerAvailability) {
    expect(() => source.searchUrl(query)).not.toThrow();
    expect(new URL(source.searchUrl(query)).protocol).toBe('https:');
  }
});

it.each(['cap\ud800 lid', '\udc00 holder'])('repairs malformed Unicode instead of breaking URL-based providers: %j', (input) => {
  const query = normalizeQuery(input);
  expect(query).toContain('\ufffd');
  for (const source of providerAvailability) expect(() => source.searchUrl(query)).not.toThrow();
});

it('first-run popup counts anonymous Printables as ready without reading nonexistent credentials', async () => {
  const storage = mockExtensionStorage();
  document.body.innerHTML = popup.match(/<body[^>]*>([\s\S]*)<\/body>/)![1]!;
  await import('../src/popup/main');
  await vi.waitFor(() => expect(document.querySelector('#repository-count')!.textContent).toContain('1 ready without setup'));
  expect(document.querySelector('#repository-count')!.textContent).toContain('0 of 3 API repositories configured');
  expect(storage.local.get.mock.calls.some(([key]) => key === 'tridijump.credentials.printables')).toBe(false);
});

it('all repositories disabled gives an actionable empty state without nonexistent native links or requests', async () => {
  const storage = mockExtensionStorage();
  storage.data['tridijump.repositories'] = Object.fromEntries(providerAvailability.map((source) => [source.id, false]));
  const request = vi.fn(); vi.stubGlobal('fetch', request);
  document.body.innerHTML = results.match(/<body[^>]*>([\s\S]*)<\/body>/)![1]!;
  window.history.replaceState(null, '', '/src/results/index.html?q=cap');
  await import('../src/results/main');
  await vi.waitFor(() => expect(document.querySelector('#empty-state')!.textContent).toContain('Enable a repository in Settings'));
  expect(document.querySelectorAll('#native-searches a')).toHaveLength(0);
  expect(request).not.toHaveBeenCalled();
});
