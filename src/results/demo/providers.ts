// SPDX-License-Identifier: GPL-3.0-or-later
// Removable demo boundary: synthetic data and simulated latency, never a live repository.
import type { Provider } from '../../providers/provider';
import type { ModelResult } from '../../shared/model-result';

const cube = new URL('./assets/cube.svg', import.meta.url).href;
const vase = new URL('./assets/vase.svg', import.meta.url).href;
const ring = new URL('./assets/ring.svg', import.meta.url).href;

const workshop: ModelResult[] = [
  { title: 'Faceted planter', url: 'https://example.com/?demo=planter', providerId: 'demo-workshop', thumbnail: vase, isFree: true, price: { amount: 0, currency: 'EUR' }, formats: ['stl', '3mf'], createdAt: '2026-09-12', downloads: 420, rating: 4.8, popularity: 90 },
  { title: 'Modular storage box', url: 'https://example.com/?demo=box', providerId: 'demo-workshop', thumbnail: cube, price: { amount: 3.5, currency: 'EUR' }, formats: ['stl'], createdAt: '2026-10-01', downloads: 120, rating: 4.2, popularity: 60 },
  { title: 'Simple desk organizer', url: 'https://example.com/?demo=organizer', providerId: 'demo-workshop' },
];
const shelf: ModelResult[] = [
  { title: 'Twisted pencil cup', url: 'https://example.com/?demo=cup', providerId: 'demo-shelf', thumbnail: vase, isFree: true, price: { amount: 0, currency: 'EUR' }, formats: ['stl'], createdAt: '2026-10-15', downloads: 82, rating: 4.6, popularity: 200 },
  { title: 'Cable guide ring', url: 'https://example.com/?demo=ring', providerId: 'demo-shelf', thumbnail: ring, price: { amount: 1.25, currency: 'EUR' }, formats: ['3mf', 'step'], createdAt: '2026-08-20', downloads: 830, rating: 4.9, popularity: 500 },
  { title: 'Pocket puzzle', url: 'https://example.com/?demo=puzzle', providerId: 'demo-shelf', thumbnail: cube, isFree: false },
];

function demoProvider(id: string, delay: number, results: ModelResult[], fail = false): Provider {
  return {
    id,
    search(_query, signal) {
      return new Promise((resolve, reject) => {
        if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
        const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
        const timer = setTimeout(() => {
          signal?.removeEventListener('abort', abort);
          if (fail) reject(new Error('Simulated demo failure'));
          else resolve(results.map((result) => ({ ...result })));
        }, delay);
        signal?.addEventListener('abort', abort, { once: true });
      });
    },
  };
}

export const demoSources = [
  { name: 'Demo Workshop', provider: demoProvider('demo-workshop', 300, workshop) },
  { name: 'Demo Model Shelf', provider: demoProvider('demo-shelf', 1_100, shelf) },
  { name: 'Demo Offline', provider: demoProvider('demo-offline', 700, [], true) },
];
