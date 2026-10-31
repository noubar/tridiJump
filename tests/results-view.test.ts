// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
import html from '../src/results/index.html?raw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelResult } from '../src/shared/model-result';
import type { Provider } from '../src/providers/provider';
import { createModelCard, safeModelUrl } from '../src/results/card';
import { createResultsView } from '../src/results/view';
import { mockExtensionStorage } from './helpers/extension-storage';
import { cultsCredentialFields } from '../src/providers/cults3d';
import { saveCredentials } from '../src/providers/credentials';
import { createCultsProvider } from '../src/providers/cults3d';
import fixture from './fixtures/cults3d/search.json';
import { SetupRequired } from '../src/providers/credentials';

const model = (title: string, providerId = 'a', metadata: Partial<ModelResult> = {}): ModelResult => ({
  title, providerId, url: `https://example.test/${encodeURIComponent(title)}`, ...metadata,
});

function provider(id: string, delay: number, results: ModelResult[], fail = false): Provider {
  return { id, search: () => new Promise((resolve, reject) => setTimeout(() => {
    if (fail) reject(new Error('<img src=x onerror=alert(1)>'));
    else resolve(results);
  }, delay)) };
}
const query = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const titles = () => [...document.querySelectorAll('.model-card h3')].map((node) => node.textContent);
const providerFetches = (request: ReturnType<typeof vi.fn>) => request.mock.calls.filter(([url]) => /^https?:\/\//u.test(String(url)));
function change(selector: string, value: string) {
  const select = query<HTMLSelectElement>(selector);
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)![1]!;
});
afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('progressive results UI', () => {
  it('keeps secondary information collapsed and exposes an accessible Expanded Search switch', () => {
    expect(query<HTMLDetailsElement>('.search-secondary details').open).toBe(false);
    expect(query<HTMLDetailsElement>('.sort-help').open).toBe(false);
    expect(query<HTMLDetailsElement>('#provider-status-details').open).toBe(false);
    expect(query<HTMLInputElement>('#expanded').type).toBe('checkbox');
    expect(query<HTMLLabelElement>('label[for="expanded"]').textContent).toContain('Expanded search');
    expect(query<HTMLButtonElement>('.tooltip-button').getAttribute('aria-describedby')).toBe('expanded-help');
    expect(query('#expanded-help').getAttribute('role')).toBe('tooltip');
    expect(query('#expanded-help').textContent).toContain('English and German');
  });

  it('distinguishes setup, failure, timeout and disabled states and preserves setup action focus', async () => {
    const disabled = vi.fn();
    const view = createResultsView(query('main'), [
      { name: 'Needs setup', provider: { id: 'setup', search: async () => { throw new SetupRequired(); } },
        searchUrl: (value) => `https://example.test/search?q=${encodeURIComponent(value)}` },
      { name: 'Failed source', provider: provider('failed', 5, [], true) },
      { name: 'Slow source', provider: { id: 'slow', search: () => new Promise(() => {}) } },
      { name: 'Disabled source', provider: { id: 'disabled', search: disabled } },
    ]);
    view.search('cap & bolt', new Set(['disabled']));
    await vi.advanceTimersByTimeAsync(0);
    const setup = query('#provider-status [data-status="setup-required"]');
    expect(query<HTMLDetailsElement>('#provider-status-details').open).toBe(true);
    expect(setup.textContent).toContain('Setup required');
    expect(setup.getAttribute('role')).not.toBe('alert');
    const [configure, direct] = setup.querySelectorAll('a');
    expect(configure?.textContent).toBe('Configure');
    expect(configure?.getAttribute('href')).toBe('../settings/index.html#provider-setup');
    expect(direct?.textContent).toBe('Search directly');
    expect(new URL(direct!.href).searchParams.get('q')).toBe('cap & bolt');
    expect(direct?.rel).toBe('noopener noreferrer');
    expect(direct?.target).toBe('_blank');
    configure!.focus();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(query('#provider-status [data-status="failed"]').textContent).toContain('Failed source: failed');
    expect(query('#provider-status [data-status="timed-out"]').textContent).toContain('Slow source: timed-out');
    expect(query('#provider-status [data-status="disabled"]').textContent).toContain('Disabled source: disabled');
    expect(document.activeElement).toBe(configure);
    expect(setup.querySelector('a')).toBe(configure);
    expect(disabled).not.toHaveBeenCalled();
    view.cancel();
  });

  it('omits an unsafe native fallback while retaining Configure', async () => {
    const view = createResultsView(query('main'), [{ name: 'Setup',
      provider: { id: 'setup', search: async () => { throw new SetupRequired(); } },
      searchUrl: () => 'javascript:alert(1)' }]);
    view.search('cap');
    await vi.advanceTimersByTimeAsync(0);
    const links = query('#provider-status').querySelectorAll('a');
    expect(links).toHaveLength(1);
    expect(links[0]?.textContent).toBe('Configure');
    view.cancel();
  });

  it('routes an available unconfigured authenticated adapter to Settings without a failed state', async () => {
    mockExtensionStorage();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const view = createResultsView(query('main'), [{ name: 'Cults3D', provider: createCultsProvider() }]);
    view.search('gear');
    await vi.advanceTimersByTimeAsync(0);
    expect(query('#provider-status').textContent).toContain('Cults3D: Setup required');
    expect(query('#provider-status').textContent).not.toContain('failed');
    expect(query<HTMLAnchorElement>('#provider-status a').getAttribute('href')).toBe('../settings/index.html#provider-cults3d');
    expect(query('#empty-state').textContent).toContain('Configure repositories in Settings');
    expect(providerFetches(fetchMock)).toHaveLength(0);
    view.cancel();
  });

  it.each([false, true])('checks unconfigured providers once per search with Expanded Search=%s and never fetches', async (expandedMode) => {
    vi.resetModules();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { data, local } = mockExtensionStorage();
    // Isolate this authenticated-provider scenario; anonymous Printables is tested separately.
    data['tridijump.repositories'] = { printables: false, sketchfab: false, smithsonian: false };
    const credentialKeys = ['tridijump.credentials.cults3d', 'tridijump.credentials.myminifactory', 'tridijump.credentials.thingiverse'];
    window.history.replaceState(null, '', `/src/results/index.html?q=gear${expandedMode ? '&expanded=1' : ''}`);
    await import('../src/results/main');
    expect(query<HTMLInputElement>('#query').value).toBe('gear');
    expect(query<HTMLInputElement>('#expanded').checked).toBe(expandedMode);
    await vi.advanceTimersByTimeAsync(0);
    expect(providerFetches(fetchMock)).toHaveLength(0);
    expect(local.get.mock.calls.map(([key]) => key).filter((key) => key.startsWith('tridijump.credentials.')).sort()).toEqual(credentialKeys);
    expect(titles()).toHaveLength(0);
    expect(query('#provider-status').textContent).toContain('Cults3D: Setup required');
    expect(query('#provider-status').textContent).toContain('MyMiniFactory: Setup required');
    expect(query('#provider-status').textContent).toContain('Thingiverse: Setup required');
    const setupLinks = query('#provider-status').querySelectorAll<HTMLAnchorElement>('[data-status="setup-required"] a');
    expect([...setupLinks].filter((link) => link.textContent === 'Search directly')).toHaveLength(3);
    expect(query('#provider-status').textContent).not.toContain('failed');
    expect(query('#fallback-status').textContent).toContain('Thangs: direct search only');
    expect(query('#empty-state').textContent).toContain('Configure repositories in Settings');
    expect(document.querySelectorAll('#native-searches a')).toHaveLength(5);
    expect(new URL(query<HTMLAnchorElement>('[data-provider-id="cults3d"]').href).searchParams.get('q')).toBe('gear');
    expect(document.querySelector('#api-key')).toBeNull();
    query<HTMLInputElement>('#query').value = '  bolt & <tag>  ';
    query<HTMLFormElement>('#search-form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(new URLSearchParams(window.location.search).get('q')).toBe('bolt & <tag>');
    await vi.advanceTimersByTimeAsync(0);
    expect(query('#search-summary').textContent).toContain('bolt & <tag>');
    expect(query('#search-summary').querySelector('tag')).toBeNull();
    expect(titles()).toEqual([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(new URL(query<HTMLAnchorElement>('[data-provider-id="cults3d"]').href).searchParams.get('q')).toBe('bolt & <tag>');
    expect(titles()).toEqual([]);
    expect(providerFetches(fetchMock)).toHaveLength(0);
    // A new explicit user search may check again, but the toggle must not fan
    // out configuration work or requests for a setup-required provider.
    expect(local.get.mock.calls.filter(([key]) => key.startsWith('tridijump.credentials.'))).toHaveLength(6);
    for (const key of credentialKeys) expect(local.get.mock.calls.filter(([requested]) => requested === key)).toHaveLength(2);
    window.dispatchEvent(new Event('pagehide'));
  });

  it('rechecks saved credentials on a new Expanded Search after setup-required without retrying other unconfigured APIs', async () => {
    vi.resetModules();
    const { data, local } = mockExtensionStorage();
    // Isolate this authenticated-provider scenario; anonymous Printables is tested separately.
    data['tridijump.repositories'] = { printables: false, sketchfab: false, smithsonian: false };
    const fetchMock = vi.fn(async (url: string) => /^https?:\/\//u.test(url)
      ? new Response(JSON.stringify(fixture))
      : new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    window.history.replaceState(null, '', '/src/results/index.html?q=cap&expanded=1');
    await import('../src/results/main');
    await vi.advanceTimersByTimeAsync(0);
    expect(query('#provider-status').textContent).toContain('Cults3D: Setup required');
    expect(local.get.mock.calls.filter(([key]) => key.startsWith('tridijump.credentials.'))).toHaveLength(3);
    expect(providerFetches(fetchMock)).toHaveLength(0);
    await saveCredentials('cults3d', cultsCredentialFields, { nickname: 'test-user', apiKey: 'FAKE-EXPANDED-SETUP-KEY' });
    query<HTMLFormElement>('#search-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(providerFetches(fetchMock)).toHaveLength(1);
    expect(local.get.mock.calls.filter(([key]) => key.startsWith('tridijump.credentials.'))).toHaveLength(6);
    expect(query('#provider-status').textContent).toContain('Cults3D: success');
    expect(document.querySelector('#provider-status [data-status="success"] a')).toBeNull();
    expect(query('#provider-status').textContent).toContain('MyMiniFactory: Setup required');
    expect(query('#provider-status').textContent).toContain('Thingiverse: Setup required');
    expect(titles()).toHaveLength(2);
    window.dispatchEvent(new Event('pagehide'));
  });

  it('inserts a fast provider immediately, preserves its card node/focus, and appends a slower provider', async () => {
    const view = createResultsView(query('main'), [
      { name: 'A', provider: provider('a', 300, [model('First')]) },
      { name: 'B', provider: provider('b', 700, [model('Second', 'b')]) },
    ]);
    view.search('gear');
    expect(titles()).toEqual([]);
    await vi.advanceTimersByTimeAsync(300);
    expect(titles()).toEqual(['First']);
    expect(query('#provider-status').textContent).toContain('B: searching');
    const card = query('.model-card');
    query<HTMLAnchorElement>('.model-card a').focus();
    const focused = document.activeElement;
    await vi.advanceTimersByTimeAsync(400);
    expect(titles()).toEqual(['First', 'Second']);
    expect(query('.model-card')).toBe(card);
    expect(document.activeElement).toBe(focused);
    expect(query('#result-count').textContent).toBe('2 results');
    expect(query('#result-count').textContent).not.toContain('searching');
    view.cancel();
  });

  it('feeds the real Cults adapter through production orchestration into clickable cards when configured', async () => {
    vi.resetModules();
    const { data, local } = mockExtensionStorage();
    // Isolate this authenticated-provider scenario; anonymous Printables is tested separately.
    data['tridijump.repositories'] = { printables: false, sketchfab: false, smithsonian: false };
    await saveCredentials('cults3d', cultsCredentialFields, { nickname: 'test-user', apiKey: 'FAKE-PRODUCTION-PATH' });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture)));
    vi.stubGlobal('fetch', fetchMock);
    window.history.replaceState(null, '', '/src/results/index.html?q=planter');
    await import('../src/results/main');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(local.get).toHaveBeenCalled();
    expect(titles()).toEqual(['Synthetic free planter', 'Synthetic paid box']);
    expect(query('#provider-status').textContent).toContain('Cults3D: success');
    expect(query<HTMLAnchorElement>('.model-card a').href).toBe(fixture.data.creationsSearchBatch.results[0]!.url);
    expect(query<HTMLAnchorElement>('.model-card a').target).toBe('_blank');
    expect(document.body.innerHTML).not.toContain('FAKE-PRODUCTION-PATH');
    expect(new URL(query<HTMLAnchorElement>('[data-provider-id="cults3d"]').href).searchParams.get('q')).toBe('planter');
    window.dispatchEvent(new Event('pagehide'));
  });

  it('filters repositories while another provider is still loading and retains the selection on arrival', async () => {
    const view = createResultsView(query('main'), [
      { name: 'A', provider: provider('a', 10, [model('A')]) },
      { name: 'B', provider: provider('b', 100, [model('B', 'b')]) },
    ]);
    view.search('gear');
    await vi.advanceTimersByTimeAsync(10);
    const checkbox = query<HTMLInputElement>('#repository-options input[value="b"]');
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));
    await vi.advanceTimersByTimeAsync(90);
    expect(titles()).toEqual(['A']);
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    expect(titles()).toEqual(['A', 'B']);
  });

  it('moves search-disabled providers into a collapsed section and restores them after Settings enables them', async () => {
    const view = createResultsView(query('main'), [
      { name: 'A', provider: provider('a', 10, [model('A')]) },
      { name: 'B', provider: provider('b', 10, [model('B', 'b')]) },
    ]);
    view.search('gear', new Set(['b']));
    await vi.advanceTimersByTimeAsync(10);
    expect(document.querySelectorAll('#repository-options input')).toHaveLength(1);
    const section = query<HTMLDetailsElement>('#disabled-repository-section');
    expect(section.hidden).toBe(false);
    expect(section.open).toBe(false);
    expect(section.querySelector('summary')!.textContent).toBe('Disabled repositories (1)');
    const disabled = query<HTMLInputElement>('#disabled-repository-options input[value="b"]');
    expect(disabled.disabled).toBe(true);
    expect(disabled.checked).toBe(false);
    expect(query('#provider-status').textContent).toContain('B: disabled');
    expect(titles()).toEqual(['A']);

    view.search('gear', new Set());
    expect(section.hidden).toBe(true);
    const restored = query<HTMLInputElement>('#repository-options input[value="b"]');
    expect(restored.disabled).toBe(false);
    expect(restored.checked).toBe(true);
    await vi.advanceTimersByTimeAsync(10);
    expect(titles()).toEqual(['A', 'B']);
  });

  it('filters free/paid and available formats, excluding unknown values only when filtered', async () => {
    const view = createResultsView(query('main'), [{ name: 'A', provider: provider('a', 10, [
      model('Free', 'a', { isFree: true, formats: ['stl'] }),
      model('Paid', 'a', { price: { amount: 2, currency: 'EUR' }, formats: ['3mf'] }),
      model('Unknown'),
    ]) }]);
    view.search('gear');
    expect(query<HTMLSelectElement>('#format').disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(10);
    expect(query<HTMLSelectElement>('#format').disabled).toBe(false);
    change('#price', 'free'); expect(titles()).toEqual(['Free']);
    change('#price', 'paid'); expect(titles()).toEqual(['Paid']);
    change('#price', 'all'); change('#format', 'stl'); expect(titles()).toEqual(['Free']);
    change('#format', ''); expect(titles()).toEqual(['Free', 'Paid', 'Unknown']);
  });

  it('updates sorting availability and sorts without inventing missing metadata', async () => {
    const view = createResultsView(query('main'), [{ name: 'A', provider: provider('a', 10, [
      model('Unknown'), model('Low', 'a', { price: { amount: 1, currency: 'EUR' }, downloads: 0 }),
      model('High', 'a', { price: { amount: 5, currency: 'EUR' }, downloads: 100 }),
    ]) }]);
    view.search('gear');
    await vi.advanceTimersByTimeAsync(10);
    expect(query<HTMLOptionElement>('#sort option[value="latest"]').disabled).toBe(true);
    expect(query<HTMLOptionElement>('#sort option[value="downloads"]').disabled).toBe(false);
    change('#sort', 'downloads'); expect(titles()).toEqual(['High', 'Low', 'Unknown']);
    change('#sort', 'price-asc'); expect(titles()).toEqual(['Low', 'High', 'Unknown']);
    change('#sort', 'best'); expect(titles()).toEqual(['Unknown', 'Low', 'High']);
    expect(query<HTMLSelectElement>('#format').disabled).toBe(true);
  });

  it('resets old cards on a new query and safely displays one provider failure', async () => {
    const view = createResultsView(query('main'), [
      { name: 'A', provider: provider('a', 10, [model('A')]) },
      { name: 'Bad', provider: provider('bad', 20, [], true) },
    ]);
    view.search('old');
    await vi.advanceTimersByTimeAsync(20);
    expect(titles()).toEqual(['A']);
    expect(query('#provider-status').textContent).toContain('<img src=x onerror=alert(1)>');
    expect(query('#provider-status').querySelector('img')).toBeNull();
    view.search('new');
    expect(titles()).toEqual([]);
    await vi.advanceTimersByTimeAsync(20);
    expect(titles()).toEqual(['A']);
  });

  it('resets an unavailable sort honestly when a second currency arrives', async () => {
    const view = createResultsView(query('main'), [
      { name: 'EUR', provider: provider('a', 10, [model('One', 'a', { price: { amount: 1, currency: 'EUR' } }), model('Two', 'a', { price: { amount: 2, currency: 'EUR' } })]) },
      { name: 'USD', provider: provider('b', 100, [model('Three', 'b', { price: { amount: 3, currency: 'USD' } })]) },
    ]);
    view.search('gear');
    await vi.advanceTimersByTimeAsync(10);
    change('#sort', 'price-desc');
    expect(titles()).toEqual(['Two', 'One']);
    await vi.advanceTimersByTimeAsync(90);
    expect(query<HTMLSelectElement>('#sort').value).toBe('best');
    expect(query<HTMLOptionElement>('#sort option[value="price-desc"]').disabled).toBe(true);
    expect(titles()).toEqual(['One', 'Two', 'Three']);
  });
});

describe('safe, minimal model cards', () => {
  it('renders untrusted strings as text and opens only the original safe URL', () => {
    const title = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    const source = '<svg onload="alert(3)">';
    const card = createModelCard(model(title, 'a', { thumbnail: 'javascript:alert(1)', creator: 'Hidden creator', rating: 4.5 }), source);
    document.body.append(card);
    expect(card.querySelector('h3')!.textContent).toBe(title);
    expect(card.querySelector('.model-source')!.textContent).toBe(source);
    expect(card.querySelector('.model-creator')!.textContent).toBe('by Hidden creator');
    expect(card.querySelectorAll('script,img,svg')).toHaveLength(0);
    expect(card.textContent).toContain('Hidden creator');
    expect(card.querySelector('.price-badge')).toBeNull();
    const link = card.querySelector('a')!;
    expect(link.href).toBe(model(title).url);
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener noreferrer');
    expect(card.querySelector('[onerror],[onload]')).toBeNull();
  });

  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd', '//example.test/path', 'https://user:password@example.test/'])('rejects unsafe model links: %s', (url) => {
    expect(safeModelUrl(url)).toBeUndefined();
    expect(createModelCard(model('Unsafe', 'a', { url }), 'A').querySelector('a')).toBeNull();
  });

  it('shows thumbnails safely and falls back when they fail', () => {
    const card = createModelCard(model('Image', 'a', { thumbnail: 'https://example.test/image.png', isFree: true }), 'A');
    const image = card.querySelector('img')!;
    expect(image.src).toBe('https://example.test/image.png');
    expect(image.referrerPolicy).toBe('no-referrer');
    expect(card.querySelector('.price-badge')!.textContent).toBe('FREE');
    image.dispatchEvent(new Event('error'));
    expect(card.querySelector('img')).toBeNull();
    expect(card.querySelector<HTMLSpanElement>('.model-preview span')!.hidden).toBe(false);
  });

  it('does not invent price, format, or thumbnail metadata on a minimal result', () => {
    const card = createModelCard(model('Minimal'), 'A');
    expect(card.querySelector('img,.price-badge')).toBeNull();
    expect(card.textContent).toContain('No preview');
    expect(card.textContent).not.toContain('FREE');
  });

  it('allows packaged thumbnails from this extension but rejects other extension origins', () => {
    vi.stubGlobal('window', { location: { protocol: 'chrome-extension:', host: 'tridijump', href: 'chrome-extension://tridijump/src/results/index.html' } });
    const own = createModelCard(model('Local', 'a', { thumbnail: 'chrome-extension://tridijump/assets/model.svg' }), 'A');
    expect(own.querySelector('img')?.getAttribute('src')).toBe('chrome-extension://tridijump/assets/model.svg');
    const other = createModelCard(model('Other', 'a', { thumbnail: 'chrome-extension://another-extension/model.svg' }), 'A');
    expect(other.querySelector('img')).toBeNull();
    const inline = createModelCard(model('Inline', 'a', { thumbnail: 'data:image/svg+xml,<svg onload="alert(1)"/>' }), 'A');
    expect(inline.querySelector('img')).toBeNull();
  });
});
