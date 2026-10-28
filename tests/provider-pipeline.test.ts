// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import settingsHtml from '../src/settings/index.html?raw';
import resultsHtml from '../src/results/index.html?raw';
import mmf from './fixtures/myminifactory/search.json';
import thingiverse from './fixtures/thingiverse/search.json';
import { mockExtensionStorage } from './helpers/extension-storage';

function page(html: string) { document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)![1]!; }
beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); localStorage.clear(); });
afterEach(() => { window.dispatchEvent(new Event('pagehide')); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

describe('actual Settings and Results entries (only extension storage and HTTP mocked)', () => {
  it('saves user configuration, searches cap, appends real-adapter cards progressively and retains native destinations', async () => {
    const { local, sync } = mockExtensionStorage();
    const fetchMock = vi.fn((endpoint: string) => {
      const url = new URL(endpoint);
      if (url.origin === 'https://www.myminifactory.com') {
        expect(url.searchParams.get('q')).toBe('cap');
        return new Promise<Response>((resolve) => setTimeout(() => resolve(new Response(JSON.stringify(mmf))), 300));
      }
      expect(url.origin).toBe('https://api.thingiverse.com');
      expect(decodeURIComponent(url.pathname)).toBe('/search/cap');
      return new Promise<Response>((resolve) => setTimeout(() => resolve(new Response(JSON.stringify(thingiverse))), 700));
    });
    vi.stubGlobal('fetch', fetchMock);
    page(settingsHtml);
    await import('../src/settings/main');
    await vi.advanceTimersByTimeAsync(0);
    // The production form exposes all implemented providers, including Cults.
    expect(document.querySelector<HTMLInputElement>('#credential-cults3d-apiKey')?.type).toBe('password');
    for (const [id, field, value] of [
      ['myminifactory', 'apiKey', 'FAKE-PIPELINE-MMF-KEY'],
      ['thingiverse', 'appToken', 'FAKE-PIPELINE-THINGIVERSE-TOKEN'],
    ]) {
      const input = document.querySelector<HTMLInputElement>(`#credential-${id}-${field}`)!;
      expect(input.type).toBe('password');
      input.value = value!;
      input.closest('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
      await vi.advanceTimersByTimeAsync(0);
      expect(input.value).toBe('');
      expect(input.closest('section')!.textContent).toContain('Configured locally');
    }
    expect(local.set).toHaveBeenCalledTimes(2);
    expect(sync.set).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled(); // Saving never sends credentials to a site.
    page(resultsHtml);
    window.history.replaceState(null, '', '/src/results/index.html?q=cap');
    await import('../src/results/main');
    await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelector('#provider-status')!.textContent).toContain('MyMiniFactory: searching');
    expect(document.querySelectorAll('.model-card')).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(300);
    expect(document.querySelectorAll('.model-card')).toHaveLength(2);
    expect(document.querySelector('#provider-status')!.textContent).toContain('Thingiverse: searching');
    expect(document.querySelector('#provider-status')!.textContent).toContain('Cults3D: Setup required');
    const first = document.querySelector('.model-card');
    await vi.advanceTimersByTimeAsync(400);
    expect(document.querySelectorAll('.model-card')).toHaveLength(4);
    expect(document.querySelector('.model-card')).toBe(first);
    expect(document.querySelector('#result-count')!.textContent).toContain('4 matching \u00b7 4 loaded');
    const links = [...document.querySelectorAll<HTMLAnchorElement>('.model-card a')];
    expect(links.map((link) => link.href)).toEqual([
      ...mmf.items.map((item) => item.url), ...thingiverse.hits.map((item) => item.public_url),
    ]);
    for (const link of links) { expect(link.target).toBe('_blank'); expect(link.rel).toBe('noopener noreferrer'); }
    expect(document.body.innerHTML).not.toContain('FAKE-PIPELINE');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(document.querySelectorAll('#native-searches a')).toHaveLength(6);
  });
});
