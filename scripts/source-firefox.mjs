// SPDX-License-Identifier: GPL-3.0-or-later
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as viteBuild } from 'vite';
import { createDeterministicZip, isSafePackagePath, readZipEntries, sha256 } from './release-helpers.mjs';
import {
  assertRequiredInputsIncluded, collectSourceFiles, GLOBAL_EXCLUSIONS,
  normalizeSourcePath, ROOT_FILE_PATTERNS, SOURCE_ROOTS,
} from './source-archive-helpers.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK_ONLY = process.argv.includes('--check');
const ALLOW_DIRTY = process.env.TRIDIJUMP_ALLOW_DIRTY_SOURCE === '1';
const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024;

function fail(message) { throw new Error(message); }
function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MiB`;
}

function git(args) {
  const result = spawnSync('git', ['-c', `safe.directory=${ROOT.replaceAll('\\', '/')}`, ...args], {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) fail(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

function run(command, args, cwd) {
  console.log(`> ${command} ${args.join(' ')}`);
  const useNpmCli = command === 'npm' && process.env.npm_execpath;
  const executable = useNpmCli ? process.execPath : command;
  const commandArguments = useNpmCli ? [process.env.npm_execpath, ...args] : args;
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, commandArguments, { cwd, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolvePromise() : reject(new Error(`${command} ${args.join(' ')} exited with status ${code}`)));
  });
}

async function listFiles(directory, base = directory) {
  const files = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) fail(`Rebuilt output contains a symbolic link: ${normalizeSourcePath(relative(base, path))}`);
    if (entry.isDirectory()) files.push(...await listFiles(path, base));
    else if (entry.isFile()) files.push({ path: normalizeSourcePath(relative(base, path)), hash: sha256(await readFile(path)) });
  }
  return files;
}

function compareBuilds(expected, actual) {
  const expectedMap = new Map(expected.map((file) => [file.path, file.hash]));
  const actualMap = new Map(actual.map((file) => [file.path, file.hash]));
  const differences = [];
  for (const path of new Set([...expectedMap.keys(), ...actualMap.keys()])) {
    if (!expectedMap.has(path)) differences.push(`${path}: only in source-archive rebuild`);
    else if (!actualMap.has(path)) differences.push(`${path}: missing from source-archive rebuild`);
    else if (expectedMap.get(path) !== actualMap.get(path)) differences.push(`${path}: content differs`);
  }
  return differences.sort((a, b) => a.localeCompare(b, 'en'));
}

async function discoverFirefoxBuildInputs() {
  const inputs = new Set();
  function record(id) {
    if (!id || id.startsWith('\0')) return;
    const clean = id.split('?')[0];
    const path = clean.startsWith('file:') ? fileURLToPath(clean) : resolve(clean);
    const relativePath = relative(ROOT, path);
    if (relativePath.startsWith('..') || resolve(path).toLowerCase().includes(`${sep}node_modules${sep}`.toLowerCase())) return;
    inputs.add(normalizeSourcePath(relativePath));
  }
  await viteBuild({
    root: ROOT, configFile: join(ROOT, 'vite.config.ts'), mode: 'firefox', logLevel: 'silent',
    plugins: [{ name: 'amo-source-build-input-discovery', moduleParsed(module) { record(module.id); } }],
    build: { write: false },
  });
  return [...inputs].sort((a, b) => a.localeCompare(b, 'en'));
}

async function extractArchive(archive, destination) {
  for (const entry of readZipEntries(archive)) {
    if (!isSafePackagePath(entry.path)) fail(`Unsafe source archive path: ${entry.path}`);
    const path = resolve(destination, ...entry.path.split('/'));
    if (!path.startsWith(`${resolve(destination)}${sep}`)) fail(`Source archive path escapes extraction root: ${entry.path}`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, entry.data);
  }
}

async function main() {
  const packageJson = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  const version = packageJson.version;
  const commit = git(['rev-parse', 'HEAD']);
  const dirty = Boolean(git(['status', '--porcelain=v1', '--untracked-files=all']));
  if (dirty && !ALLOW_DIRTY) fail('AMO source packaging requires a clean working tree. Commit the intended changes, or set TRIDIJUMP_ALLOW_DIRTY_SOURCE=1 only for local development validation.');
  if (dirty) console.warn('WARNING: creating a development source archive from an uncommitted working tree. Release automation does not allow this.');

  console.log('AMO source roots:');
  for (const root of SOURCE_ROOTS) console.log(`  ${root}/**`);
  console.log('Root build/config rules:');
  for (const pattern of ROOT_FILE_PATTERNS) console.log(`  ${pattern}`);
  console.log('Explicit/global exclusions:');
  for (const pattern of GLOBAL_EXCLUSIONS) console.log(`  ${pattern}`);

  await run('npm', ['run', 'build:firefox'], ROOT);
  const expectedBuild = await listFiles(join(ROOT, 'dist-firefox'));
  const sourceFiles = await collectSourceFiles(ROOT);
  const requiredInputs = await discoverFirefoxBuildInputs();
  assertRequiredInputsIncluded(requiredInputs, sourceFiles.map((file) => file.path));

  const sourceBytes = sourceFiles.reduce((total, file) => total + file.size, 0);
  const manifest = {
    formatVersion: 1,
    project: 'tridiJump',
    version,
    gitCommit: commit,
    sourceWorkingTreeClean: !dirty,
    includedTopLevelRoots: SOURCE_ROOTS,
    rootFilePatterns: ROOT_FILE_PATTERNS,
    exclusions: GLOBAL_EXCLUSIONS,
    fileCount: sourceFiles.length + 1,
    sourceFileBytes: sourceBytes,
    buildCommand: 'npm run build:firefox',
  };
  const entries = await Promise.all(sourceFiles.map(async (file) => ({ path: file.path, data: await readFile(file.absolutePath) })));
  entries.push({ path: 'SOURCE-ARCHIVE-MANIFEST.json', data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`) });
  const archive = createDeterministicZip(entries);
  if (archive.length >= MAX_ARCHIVE_BYTES) fail(`AMO source archive is ${humanSize(archive.length)}; it must remain below 200 MiB.`);

  console.log(`Files included: ${entries.length}`);
  console.log(`Uncompressed source size: ${humanSize(entries.reduce((total, entry) => total + entry.data.length, 0))}`);
  console.log(`Archive size: ${humanSize(archive.length)}`);
  console.log('Largest included files:');
  for (const entry of [...entries].sort((a, b) => b.data.length - a.data.length).slice(0, 10)) {
    console.log(`  ${humanSize(entry.data.length).padStart(10)}  ${entry.path}`);
  }

  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'tridijump-amo-source-'));
  try {
    await extractArchive(archive, temporaryDirectory);
    await run('npm', ['ci', '--include=dev'], temporaryDirectory);
    await run('npm', ['run', 'build:firefox'], temporaryDirectory);
    const rebuilt = await listFiles(join(temporaryDirectory, 'dist-firefox'));
    const differences = compareBuilds(expectedBuild, rebuilt);
    if (differences.length) fail(`Firefox build from AMO source archive is not reproducible:\n- ${differences.join('\n- ')}`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
  console.log('Firefox clean rebuild from source archive: PASS');
  console.log('Firefox output reproducibility: PASS');

  const archiveHash = sha256(archive);
  const archiveName = `tridiJump-v${version}-source.zip`;
  if (!CHECK_ONLY) {
    await mkdir(join(ROOT, 'release'), { recursive: true });
    await writeFile(join(ROOT, 'release', archiveName), archive);
  }
  console.log(`Source ZIP: ${CHECK_ONLY ? '(check only) ' : ''}release/${archiveName}`);
  console.log(`SHA-256: ${archiveHash}`);
}

try { await main(); }
catch (error) { console.error(`AMO source packaging failed: ${error.message}`); process.exitCode = 1; }
