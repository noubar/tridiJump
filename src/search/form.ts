// SPDX-License-Identifier: GPL-3.0-or-later
import { MAX_QUERY_LENGTH, normalizeQuery } from './query';

/** DOM wiring for entry pages; query helpers remain independent of the UI. */
export function initializeSearchForm(form: HTMLFormElement, expandedDefault: boolean) {
  const input = form.elements.namedItem('q') as HTMLInputElement;
  const expanded = form.elements.namedItem('expanded') as HTMLInputElement;
  input.maxLength = MAX_QUERY_LENGTH;
  expanded.checked = expandedDefault;
  input.addEventListener('input', () => input.setCustomValidity(''));
  form.addEventListener('submit', (event) => {
    input.value = normalizeQuery(input.value);
    if (!input.value) {
      event.preventDefault();
      input.setCustomValidity('Enter a search query.');
      input.reportValidity();
    }
  });
}
