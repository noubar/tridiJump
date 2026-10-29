// SPDX-License-Identifier: GPL-3.0-or-later
export async function markScreenshotReady(page: string): Promise<void> {
  const token = new URLSearchParams(window.location.search).get('captureToken');
  if (!token || !/^[a-f0-9]{32}$/.test(token)) throw new Error('Screenshot capture token is missing or invalid.');
  const response = await fetch(`/__tridijump_screenshot_ready?page=${encodeURIComponent(page)}&token=${token}`, {
    method: 'POST', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
  });
  if (!response.ok) throw new Error('Screenshot capture readiness could not be recorded.');
  document.documentElement.dataset.screenshotReady = page;
}
