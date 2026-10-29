// SPDX-License-Identifier: GPL-3.0-or-later
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compareAllowlist,
  createDeterministicZip,
  detectSecretCategories,
  forbiddenPackagePath,
  isChromeVersion,
  isSafePackagePath,
  readZipEntries,
  sha256,
  validateManifest,
} from './release-helpers.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK_ONLY = process.argv.includes('--check');
const APPROVED_PERMISSIONS = ['storage'];
const APPROVED_HOST_PERMISSIONS = [
  'https://cults3d.com/*',
  'https://www.myminifactory.com/*',
  'https://api.thingiverse.com/*',
  'https://api.printables.com/*',
];
const TEXT_EXTENSIONS = new Set(['.css', '.html', '.js', '.json', '.md', '.txt', '.xml']);

let failedStep = 'Initialization';
let temporaryDirectory;

function fail(message, fix) {
  const error = new Error(message);
  error.fix = fix;
  throw error;
}

function pass(message) { console.log(`✓ ${message}`); }

function executable(name) { return process.platform === 'win32' && ['npm', 'npx'].includes(name) ? `${name}.cmd` : name; }

function run(command, args, options = {}) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const result = spawnSync(executable(command), args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    ...options,
  });
  if (result.error) fail(`Could not run ${command}: ${result.error.message}`, `Install ${command} and try again.`);
  if (!options.allowFailure && result.status !== 0) fail(`${command} ${args.join(' ')} exited with status ${result.status}.`, 'Review the command output, fix the failure, and run the release again.');
  return result;
}

function git(args, options = {}) {
  return run('git', ['-c', `safe.directory=${ROOT.replaceAll('\\', '/')}`, ...args], options);
}

async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { fail(`Could not parse ${relative(ROOT, path)}: ${error.message}`, 'Repair the JSON file and try again.'); }
}

async function listFiles(directory, base = directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) fail(`Production output contains a symbolic link: ${relative(base, path)}`, 'Remove the symbolic link from production output.');
    if (entry.isDirectory()) files.push(...await listFiles(path, base));
    else if (entry.isFile()) files.push({ path, relativePath: relative(base, path).split(sep).join('/') });
  }
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'en'));
}

async function discoverOutputDirectory() {
  const candidates = [];
  for (const configName of ['vite.config.ts', 'vite.config.js', 'vite.config.mjs']) {
    try {
      const config = await readFile(join(ROOT, configName), 'utf8');
      const match = config.match(/\boutDir\s*:\s*['"]([^'"]+)['"]/);
      if (match) candidates.push(resolve(ROOT, match[1]));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  candidates.push(join(ROOT, 'dist'));
  for (const candidate of [...new Set(candidates)]) {
    try {
      if ((await stat(join(candidate, 'manifest.json'))).isFile()) return candidate;
    } catch { /* Try the next candidate. */ }
  }
  fail('No built extension directory containing manifest.json was found.', 'Check Vite output configuration and the production build.');
}

function manifestResourcePaths(manifest) {
  const paths = new Set();
  const add = (value) => { if (typeof value === 'string' && value) paths.add(value); };
  add(manifest.background?.service_worker);
  add(manifest.action?.default_popup);
  add(manifest.options_ui?.page);
  add(manifest.options_page);
  add(manifest.side_panel?.default_path);
  for (const value of Object.values(manifest.icons ?? {})) add(value);
  for (const value of Object.values(manifest.action?.default_icon ?? {})) add(value);
  for (const script of manifest.content_scripts ?? []) {
    for (const value of script.js ?? []) add(value);
    for (const value of script.css ?? []) add(value);
  }
  for (const value of Object.values(manifest.chrome_url_overrides ?? {})) add(value);
  return [...paths];
}

async function inspectPackage(directory, expectedVersion, label) {
  const files = await listFiles(directory);
  const pathSet = new Set(files.map((file) => file.relativePath));
  const manifest = await readJson(join(directory, 'manifest.json'));
  const errors = validateManifest(manifest, expectedVersion);
  errors.push(...compareAllowlist(manifest.permissions, APPROVED_PERMISSIONS, 'permission'));
  errors.push(...compareAllowlist(manifest.host_permissions, APPROVED_HOST_PERMISSIONS, 'host permission'));
  for (const resource of manifestResourcePaths(manifest)) {
    if (!isSafePackagePath(resource) || !pathSet.has(resource)) errors.push(`Manifest resource is missing or unsafe: ${resource}`);
  }
  for (const required of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'lexical-data/provenance.json']) {
    if (!pathSet.has(required)) errors.push(`Required release file is missing: ${required}`);
  }
  if (!files.some((file) => file.relativePath.startsWith('lexical-data/synonyms/') && file.relativePath.endsWith('.json'))) errors.push('Packaged synonym data is missing');
  if (!files.some((file) => file.relativePath.startsWith('lexical-data/translations/en/') && file.relativePath.endsWith('.json'))) errors.push('Packaged English translation data is missing');
  if (!files.some((file) => file.relativePath.startsWith('lexical-data/translations/de/') && file.relativePath.endsWith('.json'))) errors.push('Packaged German translation data is missing');

  for (const file of files) {
    const forbidden = forbiddenPackagePath(file.relativePath);
    if (forbidden) errors.push(`${file.relativePath}: ${forbidden}`);
    const extension = file.relativePath.slice(file.relativePath.lastIndexOf('.')).toLowerCase();
    if (TEXT_EXTENSIONS.has(extension)) {
      const text = await readFile(file.path, 'utf8');
      if (/\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0)\b/i.test(text) && ['.js', '.html', '.css'].includes(extension)) {
        errors.push(`${file.relativePath}: development destination`);
      }
      for (const category of detectSecretCategories(text)) errors.push(`${file.relativePath}: potential credential (${category})`);
    }
  }
  if (errors.length) fail(`${label} inspection failed:\n- ${errors.join('\n- ')}`, 'Remove unexpected files or values, or deliberately review and update the release baseline.');
  return { files, manifest };
}

async function fileHashes(files) {
  return new Map(await Promise.all(files.map(async (file) => [file.relativePath, sha256(await readFile(file.path))])));
}

function compareHashes(first, second) {
  const differences = [];
  for (const path of new Set([...first.keys(), ...second.keys()])) {
    if (!first.has(path)) differences.push(`${path} only in second build`);
    else if (!second.has(path)) differences.push(`${path} only in first build`);
    else if (first.get(path) !== second.get(path)) differences.push(`${path} content differs`);
  }
  return differences;
}

function auditProductionFindings(audit, packageLock) {
  const production = [];
  for (const [name, finding] of Object.entries(audit.vulnerabilities ?? {})) {
    if (!['high', 'critical'].includes(finding.severity)) continue;
    const nodes = Array.isArray(finding.nodes) ? finding.nodes : [];
    if (nodes.length === 0 || nodes.some((node) => packageLock.packages?.[node]?.dev !== true)) production.push(`${name} (${finding.severity})`);
  }
  return production;
}

async function extractArchive(entries, target) {
  for (const entry of entries) {
    const destination = resolve(target, ...entry.path.split('/'));
    if (!destination.startsWith(`${resolve(target)}${sep}`)) fail(`Unsafe archive path: ${entry.path}`, 'Repair the ZIP writer path handling.');
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, entry.data);
  }
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
}

async function main() {
  failedStep = 'Version consistency';
  const packageJson = await readJson(join(ROOT, 'package.json'));
  const packageLock = await readJson(join(ROOT, 'package-lock.json'));
  const sourceManifest = await readJson(join(ROOT, 'public', 'manifest.json'));
  const version = packageJson.version;
  if (!isChromeVersion(version)) fail(`package.json version is not Chrome-compatible: ${version}`, 'Use one to four dot-separated integers from 0 through 65535.');
  const conflicts = [];
  if (packageLock.version !== version) conflicts.push(`package-lock.json top-level version: ${packageLock.version}`);
  if (packageLock.packages?.['']?.version !== version) conflicts.push(`package-lock.json root package version: ${packageLock.packages?.['']?.version}`);
  if (sourceManifest.version !== version) conflicts.push(`public/manifest.json version: ${sourceManifest.version}`);
  if (conflicts.length) fail(`Version mismatch with package.json ${version}:\n- ${conflicts.join('\n- ')}`, 'Update versions intentionally with npm, commit them, and retry.');

  failedStep = 'Git preflight';
  const branch = git(['branch', '--show-current'], { capture: true }).stdout.trim();
  const commit = git(['rev-parse', 'HEAD'], { capture: true }).stdout.trim();
  const status = git(['status', '--porcelain=v1', '--untracked-files=all'], { capture: true }).stdout.trim();
  console.log('='.repeat(64));
  console.log('tridiJump Release Builder');
  console.log(`Version: ${version}`);
  console.log(`Commit: ${commit}`);
  console.log('='.repeat(64));
  if (status) fail(`Release aborted: working tree is not clean.\n${status}`, 'Commit all intended source changes before creating a release.');
  pass('Git worktree clean');
  git(['diff', '--check']);
  pass('git diff --check');

  failedStep = 'Tag conflict check';
  const tag = `v${version}`;
  if (git(['tag', '--list', tag], { capture: true }).stdout.trim()) fail(`Local tag ${tag} already exists.`, 'Choose the intended next version; the release command will not overwrite tags.');
  pass(`Tag ${tag} is available`);
  pass('Version consistency');

  failedStep = 'Tests';
  run('npm', ['test']);
  pass('Tests');
  failedStep = 'Typecheck';
  run('npm', ['run', 'typecheck']);
  pass('Typecheck');
  failedStep = 'First production build';
  run('npm', ['run', 'build']);
  git(['diff', '--check']);
  const firstOutput = await discoverOutputDirectory();
  const firstInspection = await inspectPackage(firstOutput, version, 'First production build');
  const firstHashes = await fileHashes(firstInspection.files);
  pass(`Production build and package inspection (${firstInspection.files.length} files)`);

  failedStep = 'npm audit';
  const auditResult = run('npm', ['audit', '--json'], { capture: true, allowFailure: true });
  let audit;
  try { audit = JSON.parse(auditResult.stdout); }
  catch { fail('npm audit did not return valid JSON.', 'Review npm audit output and npm registry connectivity.'); }
  const counts = audit.metadata?.vulnerabilities ?? {};
  const productionFindings = auditProductionFindings(audit, packageLock);
  console.log(`npm audit findings: ${counts.total ?? 0} total; ${counts.high ?? 0} high; ${counts.critical ?? 0} critical`);
  if (productionFindings.length) fail(`High/critical production vulnerabilities:\n- ${productionFindings.join('\n- ')}`, 'Review and update affected dependencies manually; this command never runs npm audit fix.');
  if (auditResult.status !== 0 && (counts.total ?? 0) === 0) fail(`npm audit failed with status ${auditResult.status}.`, 'Review npm audit output and registry connectivity.');
  pass('npm audit policy');

  failedStep = 'Reproducibility check';
  run('npm', ['run', 'build']);
  const finalOutput = await discoverOutputDirectory();
  const finalInspection = await inspectPackage(finalOutput, version, 'Final production build');
  const finalHashes = await fileHashes(finalInspection.files);
  const differences = compareHashes(firstHashes, finalHashes);
  if (differences.length) fail(`Production output is not reproducible:\n- ${differences.join('\n- ')}`, 'Remove nondeterministic build inputs and try again.');
  git(['diff', '--check']);
  pass('Reproducible dist: PASS');

  let archivePath = '(check only; no artifact written)';
  let archiveSize = 0;
  let archiveHash = '(check only)';
  if (!CHECK_ONLY) {
    failedStep = 'ZIP creation and verification';
    const archiveName = `tridiJump-v${version}-chrome.zip`;
    const archiveEntries = await Promise.all(finalInspection.files.map(async (file) => ({ path: file.relativePath, data: await readFile(file.path) })));
    const archive = createDeterministicZip(archiveEntries);
    const parsedEntries = readZipEntries(archive);
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'tridijump-release-'));
    await extractArchive(parsedEntries, temporaryDirectory);
    const extracted = await inspectPackage(temporaryDirectory, version, 'Extracted ZIP');
    const extractedHashes = await fileHashes(extracted.files);
    const archiveDifferences = compareHashes(finalHashes, extractedHashes);
    if (archiveDifferences.length) fail(`ZIP contents differ from the validated final build:\n- ${archiveDifferences.join('\n- ')}`, 'Repair archive creation before releasing.');
    const releaseDirectory = join(ROOT, 'release');
    await mkdir(releaseDirectory, { recursive: true });
    archivePath = join(releaseDirectory, archiveName);
    archiveHash = sha256(archive);
    archiveSize = archive.length;
    await writeFile(archivePath, archive);
    await writeFile(join(releaseDirectory, 'SHA256SUMS'), `${archiveHash}  ${archiveName}\n`, 'utf8');
    await writeFile(join(releaseDirectory, 'SOURCE-COMMIT.txt'), `${commit}\n`, 'utf8');
    pass('Release package created and extracted ZIP verified');
    pass('SHA-256 generated and source commit recorded');
  }

  console.log(`\n${'='.repeat(64)}`);
  console.log(`tridiJump v${version} release ${CHECK_ONLY ? 'checks passed' : 'package ready'}`);
  console.log('='.repeat(64));
  console.log(`Commit: ${commit}`);
  console.log(`Branch: ${branch || '(detached HEAD)'}`);
  console.log('Tests: PASS');
  console.log('Typecheck: PASS');
  console.log('Build: PASS');
  console.log(`npm audit: PASS (${counts.total ?? 0} findings; no high/critical production findings)`);
  console.log('Manifest: MV3');
  console.log(`Permissions: ${APPROVED_PERMISSIONS.join(', ')}`);
  console.log(`Host permissions: ${APPROVED_HOST_PERMISSIONS.join(', ')}`);
  console.log('Reproducibility: PASS');
  console.log(`Release ZIP: ${CHECK_ONLY ? archivePath : relative(ROOT, archivePath).split(sep).join('/')}`);
  if (!CHECK_ONLY) {
    console.log(`Size: ${archiveSize} bytes (${humanSize(archiveSize)})`);
    console.log(`SHA-256: ${archiveHash}`);
    console.log('Source record: release/SOURCE-COMMIT.txt');
    console.log('Checksum record: release/SHA256SUMS');
  }
  console.log(`\n${'='.repeat(64)}`);
  console.log('MANUAL STEPS REMAINING');
  console.log('='.repeat(64));
  console.log('1. Extract and smoke-test the exact ZIP in Chromium.');
  console.log('2. Capture/update store screenshots if UI changed.');
  console.log('3. Ensure the public privacy-policy URL works.');
  console.log(`4. Create tag: git tag -a ${tag} ${commit} -m "tridiJump ${tag}"`);
  console.log('5. Push the commit and tag.');
  console.log('6. Create the GitHub release.');
  console.log('7. Upload the verified ZIP to browser stores.');
  console.log('\nREADY FOR MANUAL SMOKE TEST');
}

try {
  await main();
} catch (error) {
  console.error(`\nFAILED STEP: ${failedStep}`);
  console.error(`REASON: ${error.message}`);
  if (error.fix) console.error(`HOW TO FIX: ${error.fix}`);
  process.exitCode = 1;
} finally {
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
}
