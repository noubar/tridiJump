// SPDX-License-Identifier: GPL-3.0-or-later
import { registerPrintablesHandler } from './providers/printables-background';
import { printablesRuntime } from './providers/printables-messages';

const runtime = printablesRuntime();
if (runtime) registerPrintablesHandler(runtime);
