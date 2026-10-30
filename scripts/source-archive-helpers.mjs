// SPDX-License-Identifier: GPL-3.0-or-later
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { detectSecretCategories, isSafePackagePath } from './release-helpers.mjs';

export const SOURCE_ROOTS = Object.freeze([
  'src', 'public', 'assets', 'scripts', 'manifests', 'tests', 'docs',
  'licenses', 'lexical-source', 'providers',
]);

export const ROOT_FILE_PATTERNS = Object.freeze([
  'package.json', 'package-lock.json',
  'tsconfig*.json', 'vite.config.*', 'vitest.config.*',
  'eslint.config.*', 'prettier.config.*',
  'README*', 'LICENSE*', 'COPYING*', 'THIRD_PARTY*', 'NOTICE*',
  'CHANGELOG*', 'PRIVACY*', '.nvmrc', '.node-version', '.tool-versions',
]);

export const GLOBAL_EXCLUSIONS = Object.freeze([
  '**/node_modules/**', '**/.git/**', '**/release/**', '**/dist/**',
  '**/dist-*/**', '**/coverage/**', '**/tmp/**', '**/temp/**',
  '**/.idea/**', '**/.vscode/**', '**/.env', '**/.env.*', '**/*.log',
  '**/.DS_Store', '**/Thumbs.db', '**/*.tsbuildinfo', '**/*.map',
  '**/*.pem', '**/*.p12', '**/*.pfx', '**/*.key',
  'assets/demo/screenshots/**', 'src/screenshots/**',
  'scripts/screenshots.mjs', 'tests/screenshot-fixture.test.ts',
]);

const PRIVATE_KEY_NAMES = new Set(['id_rsa', 'id_ed25519']);

export function normalizeSourcePath(path) {
  return path.split(sep).join('/').replace(/^\.\//, '');
}

function wildcardPattern(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

export function matchesRootFile(name) {
  return !name.includes('/') && ROOT_FILE_PATTERNS.some((pattern) => wildcardPattern(pattern).test(name));
}

export function exclusionReason(path) {
  const normalized = normalizeSourcePath(path);
  const lower = normalized.toLowerCase();
  const parts = lower.split('/');
  const base = parts.at(-1) ?? '';
  if (lower === 'assets/demo/screenshots' || lower.startsWith('assets/demo/screenshots/')) return 'screenshot/demo assets';
  if (lower === 'src/screenshots' || lower.startsWith('src/screenshots/')
    || lower === 'scripts/screenshots.mjs' || lower === 'tests/screenshot-fixture.test.ts') return 'screenshot-only tooling';
  if (parts.some((part) => part === 'node_modules' || part === '.git' || part === 'release'
    || part === 'dist' || part.startsWith('dist-') || part === 'coverage'
    || part === 'tmp' || part === 'temp' || part === '.idea' || part === '.vscode')) return 'generated or local directory';
  if (base === '.env' || base.startsWith('.env.') || base === '.ds_store' || base === 'thumbs.db') return 'local or environment file';
  if (base.endsWith('.log') || base.endsWith('.tsbuildinfo') || base.endsWith('.map')) return 'generated file';
  if (/\.(?:pem|p12|pfx|key)$/i.test(base) || PRIVATE_KEY_NAMES.has(base)) return 'credential/private key file';
  return undefined;
}

function assertInsideRoot(root, path) {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(path);
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${sep}`)) {
    throw new Error(`Source path escapes repository root: ${resolvedPath}`);
  }
}

async function scanSecret(path, relativePath) {
  const text = await readFile(path, 'utf8');
  // Explicitly marked test values are source fixtures, not credentials. Realistic
  // unmarked values still fail the same scan in tests and production sources.
  const scanned = /(?:FAKE|TEST_ONLY|TEST-|test-only|DO_NOT_USE)/i.test(text)
    ? text.replace(/(['"`])(?:(?!\1).)*(?:FAKE|TEST_ONLY|TEST-|test-only|DO_NOT_USE)(?:(?!\1).)*\1/gi, '"[test fixture]"')
    : text;
  const categories = detectSecretCategories(scanned);
  if (/\bAKIA[0-9A-Z]{16}\b/.test(scanned)) categories.push('AWS access key');
  if (/\bgh[pousr]_[A-Za-z0-9]{30,}\b/.test(scanned)) categories.push('GitHub token');
  if (/\bxox[baprs]-[A-Za-z0-9-]{20,}\b/.test(scanned)) categories.push('Slack token');
  if (categories.length) throw new Error(`Source archive secret scan failed for ${relativePath}: ${[...new Set(categories)].join(', ')}`);
}

export async function collectSourceFiles(repositoryRoot) {
  const root = resolve(repositoryRoot);
  const files = [];
  async function includeFile(path, relativePath) {
    if (!isSafePackagePath(relativePath)) throw new Error(`Unsafe source archive path: ${relativePath}`);
    await scanSecret(path, relativePath);
    const information = await stat(path);
    files.push({ absolutePath: path, path: relativePath, size: information.size });
  }
  async function walk(directory, relativeDirectory) {
    assertInsideRoot(root, directory);
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((first, second) => first.name.localeCompare(second.name, 'en'));
    for (const entry of entries) {
      const relativePath = normalizeSourcePath(`${relativeDirectory}/${entry.name}`);
      if (exclusionReason(relativePath)) continue;
      const path = resolve(directory, entry.name);
      assertInsideRoot(root, path);
      if (entry.isSymbolicLink()) throw new Error(`Source archive refuses symbolic link: ${relativePath}`);
      if (entry.isDirectory()) await walk(path, relativePath);
      else if (entry.isFile()) await includeFile(path, relativePath);
    }
  }

  const rootEntries = await readdir(root, { withFileTypes: true });
  const rootMap = new Map(rootEntries.map((entry) => [entry.name, entry]));
  for (const sourceRoot of SOURCE_ROOTS) {
    const entry = rootMap.get(sourceRoot);
    if (!entry) continue;
    if (entry.isSymbolicLink()) throw new Error(`Source archive refuses symbolic link: ${sourceRoot}`);
    if (!entry.isDirectory()) throw new Error(`Approved source root is not a directory: ${sourceRoot}`);
    await walk(resolve(root, sourceRoot), sourceRoot);
  }
  for (const entry of rootEntries.sort((first, second) => first.name.localeCompare(second.name, 'en'))) {
    if (!entry.isFile() || !matchesRootFile(entry.name) || exclusionReason(entry.name)) continue;
    await includeFile(resolve(root, entry.name), entry.name);
  }
  return files.sort((first, second) => first.path.localeCompare(second.path, 'en'));
}

export function assertRequiredInputsIncluded(requiredPaths, includedPaths) {
  const included = new Set([...includedPaths].map(normalizeSourcePath));
  const missing = [...new Set([...requiredPaths].map(normalizeSourcePath))]
    .filter((path) => !included.has(path)).sort((first, second) => first.localeCompare(second, 'en'));
  if (missing.length) {
    throw new Error(`SOURCE ARCHIVE CONFIGURATION INCOMPLETE\n\nRequired build input is outside approved source roots:\n${missing.join('\n')}`);
  }
}
