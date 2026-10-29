// SPDX-License-Identifier: GPL-3.0-or-later
import './screenshot.css';
import { markScreenshotReady } from './mode';
import { screenshotTiles, validateScreenshotTiles } from './fixture';

export async function renderScreenshotSettings(): Promise<void> {
  validateScreenshotTiles();
  document.documentElement.dataset.theme = 'light';
  document.body.classList.add('screenshot-mode');
  document.querySelector('#repository-availability')!.replaceChildren(...screenshotTiles.map((tile) => {
    const item = document.createElement('li');
    const label = document.createElement('label');
    label.className = 'check';
    const input = document.createElement('input');
    input.type = 'checkbox'; input.checked = true;
    label.append(input, document.createTextNode(tile.providerName));
    const note = document.createElement('span');
    note.className = 'hint';
    note.textContent = tile.mode === 'aggregated' ? 'Enabled · Aggregated search' : 'Enabled · Direct search only';
    item.append(label, note);
    return item;
  }));
  const setup = document.querySelector<HTMLElement>('[aria-labelledby="setup-heading"]')!;
  setup.classList.add('screenshot-provider-grid');
  for (const id of ['cults3d', 'myminifactory', 'thingiverse']) {
    const section = document.querySelector<HTMLElement>(`#provider-${id}`)!;
    const heading = section.querySelector('h3')!;
    const status = document.createElement('p');
    status.textContent = 'Status: Setup required';
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Credentials are stored locally and sent only to this provider.';
    section.replaceChildren(heading, status, hint);
  }
  (document.querySelector('#expanded-default') as HTMLInputElement).checked = true;
  (document.querySelector('#history-enabled') as HTMLInputElement).checked = false;
  document.querySelector<HTMLFormElement>('#settings-form')!.addEventListener('submit', (event) => event.preventDefault());
  await markScreenshotReady('settings');
}
