// SPDX-License-Identifier: GPL-3.0-or-later
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compareAllowlist, createDeterministicZip, detectSecretCategories,
  forbiddenPackagePath, isChromeVersion, isSafePackagePath,
  readZipEntries, sha256, validateManifest,
} from './release-helpers.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK_ONLY = process.argv.includes('--check');
const REQUESTED_TARGET = process.argv.slice(2).find((value) => !value.startsWith('--')) ?? 'all';
const APPROVED_PERMISSIONS = ['storage'];
const APPROVED_HOST_PERMISSIONS = [
  'https://cults3d.com/*', 'https://www.myminifactory.com/*',
  'https://api.thingiverse.com/*', 'https://api.printables.com/*',
];
const FIREFOX_ID = 'tridijump@noubarprogram.extension';
const FIREFOX_MIN_VERSION = '140.0';
const FIREFOX_DATA = ['searchTerms', 'authenticationInfo'];
const TEXT_EXTENSIONS = new Set(['.css', '.html', '.js', '.json', '.md', '.txt', '.xml']);
const TARGETS = {
  chrome: { buildScript: 'build', outputDirectory: 'dist', sourceManifest: 'manifests/chrome.json' },
  firefox: { buildScript: 'build:firefox', outputDirectory: 'dist-firefox', sourceManifest: 'manifests/firefox.json' },
};

let failedStep = 'Initialization';
function fail(message, fix) { const error = new Error(message); error.fix = fix; throw error; }
function pass(message) { console.log(`✓ ${message}`); }

function run(command, args, options = {}) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const useNpmCli = command === 'npm' && process.env.npm_execpath;
  const executable = useNpmCli ? process.execPath : command;
  const commandArguments = useNpmCli ? [process.env.npm_execpath, ...args] : args;
  const result = spawnSync(executable, commandArguments, {
    cwd: ROOT, encoding: 'utf8', stdio: options.capture ? 'pipe' : 'inherit', ...options,
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

function manifestResourcePaths(manifest) {
  const paths = new Set();
  const add = (value) => { if (typeof value === 'string' && value) paths.add(value); };
  add(manifest.background?.service_worker);
  for (const value of manifest.background?.scripts ?? []) add(value);
  add(manifest.action?.default_popup); add(manifest.options_ui?.page);
  add(manifest.options_page); add(manifest.side_panel?.default_path);
  for (const value of Object.values(manifest.icons ?? {})) add(value);
  for (const value of Object.values(manifest.action?.default_icon ?? {})) add(value);
  for (const script of manifest.content_scripts ?? []) {
    for (const value of script.js ?? []) add(value);
    for (const value of script.css ?? []) add(value);
  }
  for (const value of Object.values(manifest.chrome_url_overrides ?? {})) add(value);
  return [...paths];
}

function targetManifestErrors(manifest, target) {
  const errors = [];
  if (target === 'chrome') {
    if (manifest.background?.service_worker !== 'background.js' || manifest.background?.type !== 'module') errors.push('Chrome must use the module background.js service worker');
    if (manifest.background?.scripts !== undefined) errors.push('Chrome manifest must not contain background.scripts');
    if (manifest.browser_specific_settings !== undefined) errors.push('Chrome manifest must not contain Firefox-specific settings');
  } else {
    if (manifest.background?.service_worker !== undefined) errors.push('Firefox manifest must not contain background.service_worker');
    if (JSON.stringify(manifest.background?.scripts) !== JSON.stringify(['background.js']) || manifest.background?.type !== 'module') errors.push('Firefox must use background.scripts with module background.js');
    const settings = manifest.browser_specific_settings;
    const gecko = settings?.gecko;
    if (gecko?.id !== FIREFOX_ID) errors.push(`Firefox Gecko ID must be ${FIREFOX_ID}`);
    if (gecko?.strict_min_version !== FIREFOX_MIN_VERSION) errors.push(`Firefox minimum version must be ${FIREFOX_MIN_VERSION}`);
    errors.push(...compareAllowlist(gecko?.data_collection_permissions?.required, FIREFOX_DATA, 'Firefox required data collection category'));
    if (gecko?.data_collection_permissions?.optional !== undefined) errors.push('Firefox optional data collection categories are not approved');
    if (settings?.gecko_android !== undefined) errors.push('Firefox Android support is not approved for this release');
  }
  return errors;
}

async function inspectPackage(directory, expectedVersion, target, label) {
  const files = await listFiles(directory);
  const pathSet = new Set(files.map((file) => file.relativePath));
  const manifest = await readJson(join(directory, 'manifest.json'));
  const errors = [...validateManifest(manifest, expectedVersion), ...targetManifestErrors(manifest, target)];
  errors.push(...compareAllowlist(manifest.permissions, APPROVED_PERMISSIONS, `${target} permission`));
  errors.push(...compareAllowlist(manifest.host_permissions, APPROVED_HOST_PERMISSIONS, `${target} host permission`));
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
    if (!TEXT_EXTENSIONS.has(extension)) continue;
    const text = await readFile(file.path, 'utf8');
    if (/\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0)\b/i.test(text) && ['.js', '.html', '.css'].includes(extension)) errors.push(`${file.relativePath}: development destination`);
    for (const category of detectSecretCategories(text)) errors.push(`${file.relativePath}: potential credential (${category})`);
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

async function buildTarget(target, version) {
  const config = TARGETS[target];
  const output = join(ROOT, config.outputDirectory);
  failedStep = `${target} first production build`;
  run('npm', ['run', config.buildScript]);
  const first = await inspectPackage(output, version, target, `${target} first production build`);
  const firstHashes = await fileHashes(first.files);
  pass(`${target} production inspection (${first.files.length} files)`);
  failedStep = `${target} reproducibility check`;
  run('npm', ['run', config.buildScript]);
  const final = await inspectPackage(output, version, target, `${target} final production build`);
  const finalHashes = await fileHashes(final.files);
  const differences = compareHashes(firstHashes, finalHashes);
  if (differences.length) fail(`${target} output is not reproducible:\n- ${differences.join('\n- ')}`, 'Remove nondeterministic build inputs and try again.');
  pass(`${target} reproducibility: PASS`);
  if (CHECK_ONLY) return { target, fileCount: final.files.length, manifest: final.manifest };
  failedStep = `${target} ZIP creation and verification`;
  const entries = await Promise.all(final.files.map(async (file) => ({ path: file.relativePath, data: await readFile(file.path) })));
  const archive = createDeterministicZip(entries);
  const parsedEntries = readZipEntries(archive);
  const temporaryDirectory = await mkdtemp(join(tmpdir(), `tridijump-${target}-`));
  try {
    await extractArchive(parsedEntries, temporaryDirectory);
    const extracted = await inspectPackage(temporaryDirectory, version, target, `${target} extracted ZIP`);
    const archiveDifferences = compareHashes(finalHashes, await fileHashes(extracted.files));
    if (archiveDifferences.length) fail(`${target} ZIP differs from its validated final build:\n- ${archiveDifferences.join('\n- ')}`, 'Repair archive creation before releasing.');
  } finally { await rm(temporaryDirectory, { recursive: true, force: true }); }
  pass(`${target} ZIP extracted and verified`);
  return { target, fileCount: final.files.length, manifest: final.manifest, archive, hash: sha256(archive), archiveName: `tridiJump-v${version}-${target}.zip` };
}

function printManualSteps(targets, tag, commit) {
  console.log(`\n${'='.repeat(68)}\nMANUAL SMOKE TESTS AND PUBLISHING\n${'='.repeat(68)}`);
  if (targets.includes('chrome')) {
    console.log('\nChrome: extract the Chrome ZIP; open chrome://extensions; enable Developer mode; Load unpacked; select the extracted folder.');
    console.log('Open popup, Results, and Settings. Search cap; test providers, Expanded Search, filters, sorting, Load More, history, theme, result navigation, and service-worker errors.');
  }
  if (targets.includes('firefox')) {
    console.log('\nFirefox: extract the Firefox ZIP; open about:debugging; choose This Firefox; Load Temporary Add-on; select manifest.json.');
    console.log('Open popup, Results, and Settings. Search cap; verify Printables and configured providers; test Expanded Search, filters, sorting, Load More, history, theme, result navigation, and background errors.');
  }
  console.log('\nHuman actions remaining:');
  console.log('1. Complete the smoke tests above against the exact ZIP files.');
  console.log('2. Capture/update store screenshots and verify the public privacy-policy URL.');
  console.log(`3. Create tag: git tag -a ${tag} ${commit} -m "tridiJump ${tag}"`);
  console.log('4. Push the commit and tag, create the GitHub release, and upload each package to its browser store.');
}

async function main() {
  if (!['all', ...Object.keys(TARGETS)].includes(REQUESTED_TARGET)) fail(`Unknown release target: ${REQUESTED_TARGET}`, 'Use all, chrome, or firefox.');
  const selectedTargets = REQUESTED_TARGET === 'all' ? Object.keys(TARGETS) : [REQUESTED_TARGET];
  failedStep = 'Version consistency';
  const packageJson = await readJson(join(ROOT, 'package.json'));
  const packageLock = await readJson(join(ROOT, 'package-lock.json'));
  const version = packageJson.version;
  if (!isChromeVersion(version)) fail(`package.json version is not browser-compatible: ${version}`, 'Use one to four dot-separated integers from 0 through 65535.');
  const conflicts = [];
  if (packageLock.version !== version) conflicts.push(`package-lock.json top-level version: ${packageLock.version}`);
  if (packageLock.packages?.['']?.version !== version) conflicts.push(`package-lock.json root package version: ${packageLock.packages?.['']?.version}`);
  for (const target of selectedTargets) {
    const manifest = await readJson(join(ROOT, TARGETS[target].sourceManifest));
    if (manifest.version !== version) conflicts.push(`${TARGETS[target].sourceManifest}: ${manifest.version}`);
    const errors = [...validateManifest(manifest, version), ...targetManifestErrors(manifest, target)];
    if (errors.length) conflicts.push(`${TARGETS[target].sourceManifest}: ${errors.join('; ')}`);
  }
  if (conflicts.length) fail(`Version or source-manifest mismatch with package.json ${version}:\n- ${conflicts.join('\n- ')}`, 'Repair the selected source manifest and version metadata, commit, and retry.');
  failedStep = 'Git preflight';
  const branch = git(['branch', '--show-current'], { capture: true }).stdout.trim();
  const commit = git(['rev-parse', 'HEAD'], { capture: true }).stdout.trim();
  const status = git(['status', '--porcelain=v1', '--untracked-files=all'], { capture: true }).stdout.trim();
  console.log(`${'='.repeat(68)}\ntridiJump Multi-Browser Release Builder\nTargets: ${selectedTargets.join(', ')}\nVersion: ${version}\nCommit: ${commit}\n${'='.repeat(68)}`);
  if (status) fail(`Release aborted: working tree is not clean.\n${status}`, 'Commit all intended source changes before creating a release.');
  pass('Git worktree clean');
  git(['diff', '--check']); pass('git diff --check');
  const tag = `v${version}`;
  if (git(['tag', '--list', tag], { capture: true }).stdout.trim()) fail(`Local tag ${tag} already exists.`, 'Choose the intended next version; the release command will not overwrite tags.');
  pass(`Tag ${tag} is available`); pass('Version and selected source manifests');
  failedStep = 'Shared tests'; run('npm', ['test']); pass('Shared tests');
  failedStep = 'Shared typecheck'; run('npm', ['run', 'typecheck']); pass('Shared typecheck');
  failedStep = 'npm audit';
  const auditResult = run('npm', ['audit', '--json'], { capture: true, allowFailure: true });
  let audit;
  try { audit = JSON.parse(auditResult.stdout); } catch { fail('npm audit did not return valid JSON.', 'Review npm audit output and npm registry connectivity.'); }
  const counts = audit.metadata?.vulnerabilities ?? {};
  const productionFindings = auditProductionFindings(audit, packageLock);
  console.log(`npm audit findings: ${counts.total ?? 0} total; ${counts.high ?? 0} high; ${counts.critical ?? 0} critical`);
  if (productionFindings.length) fail(`High/critical production vulnerabilities:\n- ${productionFindings.join('\n- ')}`, 'Review and update affected dependencies manually; this command never runs npm audit fix.');
  if (auditResult.status !== 0 && (counts.total ?? 0) === 0) fail(`npm audit failed with status ${auditResult.status}.`, 'Review npm audit output and registry connectivity.');
  pass('npm audit policy');
  const results = [];
  for (const target of selectedTargets) results.push(await buildTarget(target, version));
  git(['diff', '--check']); pass('Final git diff --check');
  if (!CHECK_ONLY) {
    failedStep = 'Release records';
    const releaseDirectory = join(ROOT, 'release');
    await mkdir(releaseDirectory, { recursive: true });
    for (const result of results) await writeFile(join(releaseDirectory, result.archiveName), result.archive);
    const checksums = results.map((result) => `${result.hash}  ${result.archiveName}`).join('\n');
    await writeFile(join(releaseDirectory, 'SHA256SUMS'), `${checksums}\n`, 'utf8');
    await writeFile(join(releaseDirectory, 'SOURCE-COMMIT.txt'), `${commit}\n`, 'utf8');
    pass('Release packages, checksums, and source commit recorded');
  }
  console.log(`\n${'='.repeat(68)}\ntridiJump v${version} ${selectedTargets.join(' + ')} release ${CHECK_ONLY ? 'checks passed' : 'packages ready'}\n${'='.repeat(68)}`);
  console.log(`Commit: ${commit}\nBranch: ${branch || '(detached HEAD)'}\nTests: PASS\nTypecheck: PASS\nnpm audit: PASS (${counts.total ?? 0} findings; no high/critical production findings)`);
  console.log(`Permissions: ${APPROVED_PERMISSIONS.join(', ')}\nHost permissions: ${APPROVED_HOST_PERMISSIONS.join(', ')}`);
  for (const result of results) {
    console.log(`\n${result.target}: manifest PASS; secret scan PASS; reproducibility PASS`);
    if (!CHECK_ONLY) console.log(`Release ZIP: release/${result.archiveName}\nSize: ${result.archive.length} bytes (${humanSize(result.archive.length)})\nSHA-256: ${result.hash}`);
  }
  if (!CHECK_ONLY) console.log('\nSource record: release/SOURCE-COMMIT.txt\nChecksum record: release/SHA256SUMS');
  printManualSteps(selectedTargets, tag, commit);
  console.log('\nREADY FOR MANUAL SMOKE TEST');
}

try { await main(); }
catch (error) {
  console.error(`\nFAILED STEP: ${failedStep}\nREASON: ${error.message}`);
  if (error.fix) console.error(`HOW TO FIX: ${error.fix}`);
  process.exitCode = 1;
}
