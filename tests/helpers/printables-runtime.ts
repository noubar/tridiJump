// SPDX-License-Identifier: GPL-3.0-or-later
import { vi } from 'vitest';
import { registerPrintablesHandler } from '../../src/providers/printables-background';
import type { MessageListener, PrintablesReply, PrintablesRuntime, PrintablesSearchMessage } from '../../src/providers/printables-messages';

/** Simulate Chrome's JSON message channel, running the real worker handler. */
export function mockPrintablesRuntime(register = true) {
  let listener: MessageListener | undefined;
  const sender = { id: 'test-extension', url: 'chrome-extension://test-extension/src/results/index.html?q=cap' };
  const runtime: PrintablesRuntime = {
    id: sender.id,
    getURL: (path) => `chrome-extension://test-extension/${path}`,
    sendMessage: vi.fn((message: PrintablesSearchMessage) => new Promise((resolve, reject) => {
      if (!listener) { reject(new Error('No background listener')); return; }
      const respond = (reply: PrintablesReply) => resolve(JSON.parse(JSON.stringify(reply)));
      if (!listener(JSON.parse(JSON.stringify(message)), sender, respond)) resolve(undefined);
    })),
    onMessage: { addListener: vi.fn((value: MessageListener) => { listener = value; }) },
  };
  const existing = (globalThis as typeof globalThis & { chrome?: object }).chrome;
  vi.stubGlobal('chrome', { ...existing, runtime });
  if (register) registerPrintablesHandler(runtime);
  return { runtime, sender, listener: () => listener! };
}
