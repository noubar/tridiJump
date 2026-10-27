// SPDX-License-Identifier: GPL-3.0-or-later
import type { ModelResult } from '../shared/model-result';
import { priceLabel } from './result-options';

/** Untrusted links must be absolute HTTP(S), without misleading user credentials. */
export function safeModelUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url.href;
  } catch { /* Unusable URL: render without an active link. */ }
  return undefined;
}

function safeImageUrl(value: string): string | undefined {
  const remote = safeModelUrl(value);
  if (remote) return remote;
  try {
    const url = new URL(value, window.location.href);
    if (window.location.protocol === 'chrome-extension:' && url.protocol === 'chrome-extension:'
      && url.host === window.location.host) return url.href;
  } catch { /* Omit unsafe or malformed thumbnails. */ }
  return undefined;
}

export function createModelCard(result: ModelResult, providerName: string): HTMLElement {
  const card = document.createElement('article');
  card.className = 'model-card';
  const url = safeModelUrl(result.url);
  const content = document.createElement(url ? 'a' : 'div');
  content.className = 'model-card-content';
  if (content instanceof HTMLAnchorElement && url) {
    content.href = url;
    content.target = '_blank';
    content.rel = 'noopener noreferrer';
  }
  const preview = document.createElement('div');
  preview.className = 'model-preview';
  const placeholder = document.createElement('span');
  placeholder.textContent = 'No preview';
  preview.append(placeholder);
  const thumbnail = result.thumbnail && safeImageUrl(result.thumbnail);
  if (thumbnail) {
    const image = document.createElement('img');
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.src = thumbnail;
    placeholder.hidden = true;
    image.addEventListener('error', () => { image.remove(); placeholder.hidden = false; }, { once: true });
    preview.append(image);
  }
  const title = document.createElement('h3');
  title.textContent = result.title;
  const source = document.createElement('p');
  source.className = 'model-source';
  source.textContent = providerName;
  content.append(preview, title, source);
  const label = priceLabel(result);
  if (label) {
    const badge = document.createElement('span');
    badge.className = 'price-badge';
    badge.textContent = label;
    content.append(badge);
  }
  if (!url) {
    const unavailable = document.createElement('p');
    unavailable.className = 'hint';
    unavailable.textContent = 'Model link unavailable';
    content.append(unavailable);
  }
  card.append(content);
  return card;
}
