// SPDX-License-Identifier: GPL-3.0-or-later
import './screenshot.css';
import { markScreenshotReady } from './mode';
import { screenshotTiles, validateScreenshotTiles } from './fixture';

function card(tile: (typeof screenshotTiles)[number]): HTMLElement {
  const article = document.createElement('article');
  article.className = 'model-card';
  article.dataset.providerId = tile.providerId;
  article.dataset.mode = tile.mode;
  const content = document.createElement('div');
  content.className = 'model-card-content';
  const preview = document.createElement('div');
  preview.className = 'model-preview';
  const image = document.createElement('img');
  image.alt = '';
  image.src = tile.thumbnail;
  preview.append(image);
  const title = document.createElement('h3');
  title.textContent = tile.title;
  const source = document.createElement('p');
  source.className = 'model-source';
  source.textContent = `${tile.providerName} · ${tile.mode === 'aggregated' ? tile.creator : 'Direct search'}`;
  const badge = document.createElement('span');
  badge.className = `price-badge${tile.mode === 'direct-search' ? ' direct-search-badge' : ''}`;
  badge.textContent = tile.mode === 'aggregated' ? 'Demo result' : 'Direct search';
  content.append(preview, title, source, badge);
  article.append(content);
  return article;
}

export async function renderScreenshotResults(): Promise<void> {
  validateScreenshotTiles();
  document.documentElement.dataset.theme = 'light';
  document.body.classList.add('screenshot-mode');
  const form = document.querySelector<HTMLFormElement>('#search-form')!;
  form.addEventListener('submit', (event) => event.preventDefault());
  (form.elements.namedItem('q') as HTMLInputElement).value = 'benchy';
  (form.elements.namedItem('expanded') as HTMLInputElement).checked = false;
  document.querySelector('#repository-options')!.replaceChildren(...screenshotTiles.map((tile) => {
    const label = document.createElement('label');
    label.className = 'check';
    const input = document.createElement('input');
    input.type = 'checkbox'; input.checked = true;
    label.append(input, document.createTextNode(tile.providerName));
    return label;
  }));
  const sort = document.querySelector<HTMLSelectElement>('#sort')!;
  sort.add(new Option('Best match', 'best'));
  document.querySelector('#result-count')!.textContent = '6 repositories · 4 aggregated · 2 direct search';
  document.querySelector('#search-summary')!.textContent = 'Results for “benchy” · Expanded search off';
  document.querySelector<HTMLElement>('#empty-state')!.hidden = true;
  document.querySelector('#results-grid')!.replaceChildren(...screenshotTiles.map(card));
  const images = [...document.images].filter((image) => image.closest('.model-card'));
  if (images.length !== 6 || images.some((image) => new URL(image.src).origin !== window.location.origin)) throw new Error('Screenshot cards must use exactly six same-origin images.');
  await Promise.all(images.map(async (image) => {
    if (!image.complete) {
      await new Promise<void>((resolve, reject) => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => reject(new Error('A screenshot image failed to load.')), { once: true });
      });
    }
    if (image.naturalWidth === 0) throw new Error('A screenshot image completed without usable pixels.');
    await image.decode();
  }));
  await markScreenshotReady('results');
}
