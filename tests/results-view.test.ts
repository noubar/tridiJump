// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
import html from '../src/results/index.html?raw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelResult } from '../src/shared/model-result';
import type { Provider } from '../src/providers/provider';
import { createModelCard, safeModelUrl } from '../src/results/card';
import { createResultsView } from '../src/results/view';

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
function change(selector: string, value: string) {
  const select = query<HTMLSelectElement>(selector);
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)![1]!;
});
afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('progressive results UI', () => {
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
    expect(query('#result-count').textContent).toContain('2 of 2 models');
    expect(query('#result-count').textContent).toContain('0 sources searching');
    view.cancel();
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
    expect(card.querySelectorAll('script,img,svg')).toHaveLength(0);
    expect(card.textContent).not.toContain('Hidden creator');
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
});
