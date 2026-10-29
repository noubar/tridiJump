// SPDX-License-Identifier: GPL-3.0-or-later
import { LexicalEngine } from './lexical-engine';

const engine = new LexicalEngine();

/** Original first, followed by at most three offline lexical alternatives. */
export function expandQuery(input: string): Promise<string[]> {
  return engine.expand(input);
}
