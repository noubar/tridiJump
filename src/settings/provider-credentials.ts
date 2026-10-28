// SPDX-License-Identifier: GPL-3.0-or-later
import { clearCredentials, credentialDisplay, saveCredentials } from '../providers/credentials';
import type { CredentialField } from '../providers/credentials';

/** Packaged field definitions only. Stored secrets never enter the display projection. */
export function initializeCredentialSettings(root: HTMLElement, providerId: string, fields: readonly CredentialField[], options: { allowSave?: boolean } = {}) {
  const summary = document.createElement('p');
  const status = document.createElement('p');
  status.role = 'status';
  status.setAttribute('aria-live', 'polite');
  const form = document.createElement('form');
  form.autocomplete = 'off';
  const inputs = new Map<string, HTMLInputElement>();
  for (const field of options.allowSave === false ? [] : fields) {
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
  function button(text: string, action: string) {
    const element = document.createElement('button');
    element.type = 'button'; element.textContent = text; element.dataset.action = action;
    return element;
  }
  const save = button('Save credentials', 'save'); save.type = 'submit';
  save.hidden = options.allowSave === false;
  const replace = button('Replace credentials', 'replace');
  const remove = button('Remove credentials', 'remove'); remove.className = 'secondary';
  const cancel = button('Cancel replacement', 'cancel'); cancel.className = 'secondary';
  form.append(save, document.createTextNode(' '), cancel);
  root.append(status, summary, replace, document.createTextNode(' '), remove, form);
  let configured = false;
  function show(value: boolean, publicValues?: Record<string, string>) {
    configured = value;
    form.hidden = configured || options.allowSave === false;
    replace.hidden = !configured || options.allowSave === false;
    remove.hidden = !configured;
    cancel.hidden = !configured;
    if (!configured) summary.textContent = '';
    else if (publicValues) summary.textContent = fields.map((field) =>
      `${field.label}: ${field.secret ? '\u2022'.repeat(8) : publicValues[field.name] ?? ''}`).join(' / ');
    status.textContent = configured ? 'Status: Configured locally.' : 'Status: Setup required. Not configured.';
  }
  function clearInputs() { for (const input of inputs.values()) input.value = ''; }
  function busy(value: boolean) {
    for (const button of [save, replace, remove, cancel]) button.disabled = value;
    for (const input of inputs.values()) input.disabled = value;
  }
  replace.addEventListener('click', () => { clearInputs(); form.hidden = false; inputs.values().next().value?.focus(); });
  cancel.addEventListener('click', () => { clearInputs(); show(configured); replace.focus(); });
  busy(true);
  const ready = credentialDisplay(providerId, fields).then((display) => show(display.configured, display.publicValues),
    () => { status.textContent = 'Configuration could not be read. Try reopening Settings.'; })
    .finally(() => busy(false));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (save.disabled || options.allowSave === false) return;
    const values = Object.fromEntries([...inputs].map(([name, input]) => [name, input.value]));
    busy(true);
    clearInputs();
    void saveCredentials(providerId, fields, values).then(() => {
      show(true, Object.fromEntries(fields.filter((field) => !field.secret).map((field) => [field.name, values[field.name]?.trim() ?? ''])));
    }, () => { status.textContent = 'Credentials could not be saved. Complete all fields and check extension local storage.'; })
      .finally(() => { busy(false); if (form.hidden) replace.focus(); });
  });
  remove.addEventListener('click', () => {
    if (remove.disabled) return;
    busy(true); clearInputs();
    void clearCredentials(providerId).then(() => { show(false); status.textContent += ' Local credentials removed.'; },
      () => { status.textContent = 'Credentials could not be removed from extension local storage.'; })
      .finally(() => { busy(false); if (!configured) inputs.values().next().value?.focus(); });
  });
  return ready;
}
