// SPDX-License-Identifier: GPL-3.0-or-later
import { clearCredentials, credentialsConfigured, saveCredentials } from '../providers/credentials';
import type { CredentialField } from '../providers/credentials';

/** One local form per implemented provider; stored secrets are never populated. */
export function initializeCredentialSettings(root: HTMLElement, providerId: string, fields: readonly CredentialField[]) {
  const form = document.createElement('form');
  form.autocomplete = 'off';
  const inputs = new Map<string, HTMLInputElement>();
  for (const field of fields) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.id = `credential-${providerId}-${field.name}`;
    input.type = field.secret ? 'password' : 'text';
    input.required = true;
    input.autocomplete = 'off';
    input.spellcheck = false;
    label.htmlFor = input.id;
    label.textContent = field.label;
    form.append(label, input);
    inputs.set(field.name, input);
  }
  const save = document.createElement('button');
  save.type = 'submit';
  save.textContent = 'Save credentials';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Remove credentials';
  remove.className = 'secondary';
  const status = document.createElement('p');
  status.role = 'status';
  status.setAttribute('aria-live', 'polite');
  form.append(save, document.createTextNode(' '), remove, status);
  root.append(form);

  function busy(value: boolean) {
    save.disabled = value;
    remove.disabled = value;
    for (const input of inputs.values()) input.disabled = value;
  }
  function clearInputs() { for (const input of inputs.values()) input.value = ''; }
  busy(true);
  const ready = credentialsConfigured(providerId, fields).then((configured) => {
    status.textContent = configured ? 'Configured locally.' : 'Not configured.';
  }, () => { status.textContent = 'Configuration could not be read. Extension local storage may be unavailable.'; })
    .finally(() => busy(false));

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (save.disabled) return;
    const values = Object.fromEntries([...inputs].map(([name, input]) => [name, input.value]));
    busy(true);
    // Clear even on failure: never leave a submitted secret displayed in the form.
    clearInputs();
    void saveCredentials(providerId, fields, values).then(() => {
      status.textContent = 'Configured locally. Return to Results and search again.';
    }, () => { status.textContent = 'Credentials could not be saved. Complete all fields and check extension local storage.'; })
      .finally(() => busy(false));
  });
  remove.addEventListener('click', () => {
    if (remove.disabled) return;
    busy(true);
    clearInputs();
    void clearCredentials(providerId).then(() => { status.textContent = 'Not configured. Local credentials removed.'; },
      () => { status.textContent = 'Credentials could not be removed from extension local storage.'; })
      .finally(() => busy(false));
  });
  return ready;
}
