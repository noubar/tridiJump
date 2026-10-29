// SPDX-License-Identifier: GPL-3.0-or-later
import './screenshot.css';
import { markScreenshotReady } from './mode';

export async function renderScreenshotPopup(): Promise<void> {
  document.documentElement.dataset.theme = 'light';
  document.body.classList.add('screenshot-mode');
  const form = document.querySelector<HTMLFormElement>('#search-form')!;
  form.addEventListener('submit', (event) => event.preventDefault());
  (form.elements.namedItem('q') as HTMLInputElement).value = 'benchy';
  document.querySelector('#repository-count')!.textContent = '4 aggregated repositories · 2 direct-search repositories';
  await markScreenshotReady('popup');
}
