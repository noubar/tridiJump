// SPDX-License-Identifier: GPL-3.0-or-later
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { delimiter, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_DIRECTORY = join(ROOT, 'assets', 'demo', 'screenshots');
const VIEWPORT = { width: 1280, height: 800 };
const TARGET = process.argv.slice(2).find((value) => !value.startsWith('--')) ?? 'all';
const BUILD_ONLY = process.argv.includes('--build-only');
const EXPECTED = {
  printables: 'aggregated', thingiverse: 'aggregated', myminifactory: 'aggregated', cults3d: 'aggregated',
  makerworld: 'direct-search', thangs: 'direct-search',
};
const PAGES = [
  { id: 'results', url: 'src/results/index.html', file: '01-supported-repositories-1280x800.png' },
  { id: 'popup', url: 'src/popup/index.html', file: '02-popup-1280x800.png' },
  { id: 'settings', url: 'src/settings/index.html', file: '03-settings-1280x800.png' },
];
const MIME = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain' };

function fail(message) { throw new Error(message); }
async function exists(path) { try { await access(path); return true; } catch { return false; } }
function sha256(data) { return createHash('sha256').update(data).digest('hex'); }

function run(executable, args, options = {}) {
  console.log(`> ${executable} ${args.join(' ')}`);
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, { cwd: ROOT, stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolvePromise() : reject(new Error(`${executable} exited with status ${code}`)));
  });
}

function pngDimensions(data, label) {
  if (data.length < 24 || data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || data.subarray(12, 16).toString() !== 'IHDR') fail(`${label} is not a valid PNG.`);
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

async function validateFixture() {
  const fixture = JSON.parse(await readFile(join(FIXTURE_DIRECTORY, 'demo-results.json'), 'utf8'));
  if (!Array.isArray(fixture) || fixture.length !== 6) fail('Screenshot fixture must contain exactly six entries.');
  const ids = fixture.map((item) => item.providerId);
  if (new Set(ids).size !== 6 || Object.keys(EXPECTED).some((id) => !ids.includes(id))) fail('Every supported provider must appear exactly once.');
  for (const item of fixture) {
    if (EXPECTED[item.providerId] !== item.mode) fail(`${item.providerId} has an incorrect screenshot mode.`);
    if (typeof item.thumbnail !== 'string' || !/^Demo-[A-Za-z0-9]+\.png$/.test(item.thumbnail)) fail(`${item.providerId} has an unsafe thumbnail path.`);
    if (JSON.stringify(item).match(/https?:\/\//i)) fail(`${item.providerId} fixture contains a remote URL.`);
    const image = await readFile(join(FIXTURE_DIRECTORY, item.thumbnail));
    const dimensions = pngDimensions(image, item.thumbnail);
    if (dimensions.width !== 1448 || dimensions.height !== 1086) fail(`${item.thumbnail} must remain uncropped at 1448x1086.`);
  }
  console.log('✓ Fixture: six unique providers, four aggregated, two direct search, all artwork local');
  return fixture;
}

async function findOnPath(names) {
  const directories = (process.env.PATH ?? '').split(delimiter);
  const extensions = process.platform === 'win32' ? ['', '.exe', '.cmd'] : [''];
  for (const directory of directories) for (const name of names) for (const extension of extensions) {
    const candidate = join(directory, `${name}${extension}`);
    if (await exists(candidate)) return candidate;
  }
}

async function findBrowser(target) {
  const envName = target === 'chrome' ? 'TRIDIJUMP_CHROME_PATH' : 'TRIDIJUMP_FIREFOX_PATH';
  const configured = process.env[envName];
  if (configured && await exists(configured)) return configured;
  const programFiles = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean);
  const candidates = target === 'chrome'
    ? [...programFiles.map((base) => join(base, 'Google', 'Chrome', 'Application', 'chrome.exe')),
      ...programFiles.map((base) => join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'))]
    : [...programFiles.map((base) => join(base, 'Mozilla Firefox', 'firefox.exe')),
      ...(process.env.LOCALAPPDATA ? [join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'firefox.exe')] : [])];
  for (const candidate of candidates) if (await exists(candidate)) return candidate;
  const found = await findOnPath(target === 'chrome' ? ['google-chrome', 'chromium', 'chromium-browser', 'chrome', 'msedge'] : ['firefox']);
  if (found) return found;
  fail(`${target} browser executable was not found. Set ${envName} to its executable path.`);
}

async function build(target) {
  const vite = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!await exists(vite)) fail('Vite is not installed. Run npm ci first.');
  await run(process.execPath, [vite, 'build', '--mode', `screenshots-${target}`]);
  await validateScreenshotBuild(target);
}

async function validateScreenshotBuild(target) {
  const root = join(ROOT, 'dist-screenshots', target);
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(path);
    }
  }
  await visit(root);
  if (files.some((path) => ['background.js', 'manifest.json'].includes(relative(root, path).split(sep).join('/')))) {
    fail(`${target} screenshot build contains an extension background or manifest entry.`);
  }
  const demoFiles = files.filter((path) => /^Demo-[A-Za-z0-9]+-[A-Za-z0-9_-]+\.png$/.test(path.split(sep).at(-1) ?? ''));
  if (demoFiles.length !== 6) fail(`${target} screenshot build must contain exactly six generated demo images.`);
  const executableText = (await Promise.all(files.filter((path) => extname(path) === '.js')
    .map((path) => readFile(path, 'utf8')))).join('\n');
  if (/https?:\/\/(?:api\.printables\.com|cults3d\.com|www\.myminifactory\.com|api\.thingiverse\.com|makerworld\.com|thangs\.com)/i.test(executableText)) {
    fail(`${target} screenshot build contains a live provider destination.`);
  }
  const resourceText = (await Promise.all(files.filter((path) => ['.html', '.css'].includes(extname(path)))
    .map((path) => readFile(path, 'utf8')))).join('\n');
  if (/(?:src\s*=|url\s*\()["']?https?:\/\//i.test(resourceText)) fail(`${target} screenshot build contains a remote page resource.`);
  console.log(`OK ${target}: dedicated screenshot entries only; no extension background or live provider destination`);
}

function startServer(directory, ready) {
  const root = resolve(directory);
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/__tridijump_screenshot_ready' && request.method === 'POST') {
        const page = url.searchParams.get('page'); const token = url.searchParams.get('token');
        if (!page || !token) { response.writeHead(400).end(); return; }
        ready.add(`${page}:${token}`); response.writeHead(204).end(); return;
      }
      if (request.method !== 'GET') { response.writeHead(405).end(); return; }
      const pathname = decodeURIComponent(url.pathname === '/' ? '/src/results/index.html' : url.pathname);
      const candidate = resolve(root, `.${pathname}`);
      if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) { response.writeHead(403).end(); return; }
      const info = await stat(candidate);
      if (!info.isFile()) { response.writeHead(404).end(); return; }
      const content = await readFile(candidate);
      response.writeHead(200, { 'Content-Type': MIME[extname(candidate)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(content);
    } catch { response.writeHead(404).end(); }
  });
  return new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolvePromise(server));
  });
}

async function capture(target, browser, server, page, outputDirectory, ready) {
  const address = server.address();
  if (!address || typeof address === 'string') fail('Screenshot server did not expose a TCP port.');
  const token = randomBytes(16).toString('hex');
  const url = `http://127.0.0.1:${address.port}/${page.url}?captureToken=${token}`;
  const output = join(outputDirectory, page.file);
  const profile = await mkdtemp(join(tmpdir(), `tridijump-${target}-`));
  try {
    const args = target === 'chrome'
      ? ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
        '--disable-background-networking', '--disable-component-update', '--disable-sync', '--metrics-recording-only',
        `--user-data-dir=${profile}`, `--window-size=${VIEWPORT.width},${VIEWPORT.height}`, '--virtual-time-budget=3000',
        `--screenshot=${output}`, url]
      : ['--headless', '--no-remote', '--profile', profile, `--window-size=${VIEWPORT.width},${VIEWPORT.height}`, '--screenshot', output, url];
    await run(browser, args);
    if (!ready.has(`${page.id}:${token}`)) fail(`${target} ${page.id} page did not report screenshot readiness; no image is accepted.`);
    const image = await readFile(output);
    const dimensions = pngDimensions(image, output);
    if (dimensions.width !== VIEWPORT.width || dimensions.height !== VIEWPORT.height) fail(`${page.file} is ${dimensions.width}x${dimensions.height}, expected 1280x800.`);
    console.log(`✓ ${target}: ${page.file}`);
    return { path: relative(ROOT, output).split(sep).join('/'), page: page.id, target, ...dimensions, bytes: image.length, sha256: sha256(image) };
  } finally {
    // Browser profiles live outside the repository and contain no release files.
    const { rm } = await import('node:fs/promises');
    await rm(profile, { recursive: true, force: true });
  }
}

async function main() {
  if (!['all', 'chrome', 'firefox'].includes(TARGET)) fail('Use screenshots.mjs with all, chrome, or firefox.');
  const targets = TARGET === 'all' ? ['chrome', 'firefox'] : [TARGET];
  const fixture = await validateFixture();
  const generated = [];
  for (const target of targets) {
    await build(target);
    if (BUILD_ONLY) continue;
    const browser = await findBrowser(target);
    const outputDirectory = join(ROOT, 'release', 'screenshots', target);
    await mkdir(outputDirectory, { recursive: true });
    const ready = new Set();
    const server = await startServer(join(ROOT, 'dist-screenshots', target), ready);
    try {
      for (const page of PAGES) generated.push(await capture(target, browser, server, page, outputDirectory, ready));
    } finally { await new Promise((resolvePromise) => server.close(resolvePromise)); }
  }
  if (!BUILD_ONLY) {
    const git = process.platform === 'win32' ? 'git.exe' : 'git';
    const collect = (args) => new Promise((resolvePromise, reject) => {
      const child = spawn(git, ['-c', `safe.directory=${ROOT.replaceAll('\\', '/')}`, ...args], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
      let output = ''; child.stdout.on('data', (chunk) => { output += chunk; });
      child.once('error', reject); child.once('exit', (code) => code === 0 ? resolvePromise(output.trim()) : reject(new Error(`git ${args.join(' ')} failed`)));
    });
    const commit = await collect(['rev-parse', 'HEAD']);
    const dirty = Boolean(await collect(['status', '--porcelain=v1', '--untracked-files=all']));
    const manifest = {
      sourceCommit: commit, sourceWorkingTreeClean: !dirty, fixtureVersion: 1,
      screenshotBuildMode: 'dedicated-build-entry', viewport: VIEWPORT,
      providers: fixture.map(({ providerId, mode }) => ({ providerId, mode })),
      localFixturesUsed: true, noLiveNetwork: true, remoteThumbnailsRejected: true, files: generated,
    };
    const manifestPath = join(ROOT, 'release', 'screenshots', 'manifest.json');
    await mkdir(dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(`✓ Screenshot manifest: ${relative(ROOT, manifestPath)}`);
  }
}

try { await main(); }
catch (error) { console.error(`Screenshot generation failed: ${error.message}`); process.exitCode = 1; }
