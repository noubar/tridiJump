// SPDX-License-Identifier: GPL-3.0-or-later
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { delimiter, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VIEWPORT = { width: 1280, height: 800 };
const TARGET = process.argv.slice(2).find((value) => !value.startsWith('--')) ?? 'all';
const BUILD_ONLY = process.argv.includes('--build-only');
const DEMO_ASSET_DIRECTORY = join(ROOT, 'assets', 'demo', 'screenshots');
const DEMO_ASSETS = (await readdir(DEMO_ASSET_DIRECTORY))
  .filter((name) => /^Demo-[A-Za-z0-9-]+\.png$/.test(name)).sort();
const NEUTRAL_DEMO_ASSET = 'Demo-Neutral-Benchys.png';
if (!DEMO_ASSETS.includes(NEUTRAL_DEMO_ASSET)) fail(`Missing fallback artwork: ${NEUTRAL_DEMO_ASSET}`);
const DEMO_ARTWORK = Object.fromEntries(DEMO_ASSETS.map((name) => [
  name.replace(/^Demo-|\.png$/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase(), name,
]));
const PAGES = [
  { id: 'settings', url: 'src/settings/index.html', file: '03-settings-1280x800.png' },
  { id: 'results', url: 'src/results/index.html?q=benchy', file: '01-supported-repositories-1280x800.png' },
  { id: 'popup', url: 'src/popup/index.html', file: '02-popup-1280x800.png' },
];
const MIME = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain' };
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";

function fail(message) { throw new Error(message); }
async function exists(path) { try { await access(path); return true; } catch { return false; } }
function sha256(data) { return createHash('sha256').update(data).digest('hex'); }
function artworkKey(value) { return value.replace(/[^a-z0-9]/gi, '').toLowerCase(); }
export function demoArtworkFor(provider) {
  return DEMO_ARTWORK[artworkKey(provider.id)] ?? DEMO_ARTWORK[artworkKey(provider.name)] ?? NEUTRAL_DEMO_ASSET;
}

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

function productionDirectory(target) { return join(ROOT, target === 'firefox' ? 'dist-firefox' : 'dist'); }

async function build(target) {
  const vite = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!await exists(vite)) fail('Vite is not installed. Run npm ci first.');
  await run(process.execPath, [vite, 'build', ...(target === 'firefox' ? ['--mode', 'firefox'] : [])]);
  await validateProductionBuild(target);
}

async function validateProductionBuild(target) {
  const root = productionDirectory(target);
  for (const file of ['manifest.json', 'background.js', 'src/popup/index.html', 'src/results/index.html', 'src/settings/index.html']) {
    if (!await exists(join(root, ...file.split('/')))) fail(`${target} production build is missing ${file}.`);
  }
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(path);
    }
  }
  await visit(root);
  const executableText = (await Promise.all(files.filter((path) => ['.js', '.html', '.css'].includes(extname(path)))
    .map((path) => readFile(path, 'utf8')))).join('\n');
  if (/renderScreenshot|screenshot-mode|captureToken|__tridijump_screenshot_ready|Demo-Printables/i.test(executableText)) {
    fail(`${target} production build contains screenshot-only code.`);
  }
  console.log(`OK ${target}: ordinary production build; screenshot tooling absent`);
}

export function screenshotBootstrap(page, token, capturedProviders = []) {
  return `// Generated in memory by scripts/screenshots.mjs; never written to the extension build.
(() => {
  const page = ${JSON.stringify(page)};
  const token = ${JSON.stringify(token)};
  const capturedProviders = ${JSON.stringify(capturedProviders)};
  const artworkByKey = ${JSON.stringify(DEMO_ARTWORK)};
  const neutralArtwork = ${JSON.stringify(NEUTRAL_DEMO_ASSET)};
  const nativeFetch = globalThis.fetch.bind(globalThis);
  const values = {
    'tridijump.preferences': { theme: 'light', expandedDefault: false, historyEnabled: false },
    'tridijump.repositories': { smithsonian: true },
    'tridijump.history': [],
  };
  const local = {
    async get(key) {
      if (key == null) return { ...values };
      if (typeof key === 'string') return { [key]: values[key] };
      if (Array.isArray(key)) return Object.fromEntries(key.map((name) => [name, values[name]]));
      return Object.fromEntries(Object.entries(key).map(([name, fallback]) => [name, values[name] ?? fallback]));
    },
    async set(next) { Object.assign(values, next); },
    async remove(key) { for (const name of Array.isArray(key) ? key : [key]) delete values[name]; },
  };
  const runtime = {
    id: 'tridijump-screenshot-runtime',
    getURL(path) { return new URL(path, location.origin + '/').href; },
    async sendMessage(message) {
      if (message?.type === 'printables.search') return { ok: true, page: { results: [] } };
      return undefined;
    },
    onMessage: { addListener() {}, removeListener() {} },
  };
  const api = { storage: { local, onChanged: { addListener() {}, removeListener() {} } }, runtime };
  for (const name of ['browser', 'chrome']) {
    try { Object.defineProperty(globalThis, name, { value: api, configurable: true }); }
    catch { globalThis[name] = api; }
  }
  globalThis.fetch = async (input, init) => {
    const raw = typeof input === 'string' || input instanceof URL ? input : input.url;
    const url = new URL(raw, location.href);
    if (url.origin === location.origin) return nativeFetch(input, init);
    if (url.origin === 'https://api.sketchfab.com' && url.pathname === '/v3/search') {
      return new Response(JSON.stringify({ results: [], next: null, cursors: { next: null } }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.origin === 'https://api.si.edu' && url.pathname === '/openaccess/api/v1.0/search') {
      return new Response(JSON.stringify({ status: 200, response: { rowCount: 0, rows: [] } }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new TypeError('Screenshot capture blocks remote network requests.');
  };
  const normalizedKey = (value) => value.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const discoverRepositories = () => {
    const found = new Map(capturedProviders.map((provider) => [provider.id, { ...provider }]));
    const aggregated = new Set();
    for (const label of document.querySelectorAll('#repository-options label, #disabled-repository-options label')) {
      const input = label.querySelector('input');
      const id = input?.value || '';
      const name = label.textContent?.trim() || '';
      if (id && name) { aggregated.add(id); found.set(id, { id, name, mode: 'aggregated' }); }
    }
    for (const link of document.querySelectorAll('#native-searches a[data-provider-id]')) {
      const id = link.dataset.providerId || '';
      const name = link.textContent?.replace(/^Search directly on\\s+/, '').trim() || '';
      if (!id || !name) continue;
      const current = found.get(id);
      found.set(id, { id, name: current?.name || name, mode: aggregated.has(id) ? 'aggregated' : 'direct-search', url: link.href });
    }
    return [...found.values()];
  };
  const demoCard = (provider, index) => {
    const card = document.createElement('article'); card.className = 'model-card';
    card.dataset.screenshotDemo = provider.id;
    const content = document.createElement(provider.url ? 'a' : 'div'); content.className = 'model-card-content';
    if (provider.url) { content.href = provider.url; content.target = '_blank'; content.rel = 'noopener noreferrer'; }
    const preview = document.createElement('div'); preview.className = 'model-preview';
    const image = document.createElement('img'); image.alt = ''; image.loading = 'eager'; image.decoding = 'async';
    const asset = artworkByKey[normalizedKey(provider.id)] || artworkByKey[normalizedKey(provider.name)] || neutralArtwork;
    image.src = location.origin + '/__tridijump_screenshot_asset/' + asset; preview.append(image);
    const title = document.createElement('h3');
    title.textContent = index % 2 ? 'Classic 3D print test boat' : 'Benchy calibration demo';
    const source = document.createElement('p'); source.className = 'model-source'; source.textContent = provider.name;
    const badge = document.createElement('span'); badge.className = 'price-badge';
    badge.textContent = 'Demo result';
    content.append(preview, title, source, badge); card.append(content); return card;
  };
  let injectedDemoProviders;
  let popupSummaryInjected = false;
  const injectDynamicDemoCards = () => {
    if (injectedDemoProviders) return injectedDemoProviders;
    const providers = discoverRepositories();
    const cardProviders = providers.filter((provider) => provider.mode !== 'direct-search');
    const directProviders = providers.filter((provider) => provider.mode === 'direct-search' && provider.url);
    const originalGrid = document.querySelector('#results-grid');
    if (!cardProviders.length || !originalGrid) return;
    const grid = originalGrid.cloneNode(false); originalGrid.replaceWith(grid);
    grid.replaceChildren(...cardProviders.map(demoCard));
    const originalCount = document.querySelector('#result-count'); const count = originalCount.cloneNode(false);
    originalCount.replaceWith(count); count.textContent = cardProviders.length + ' demo results · ' + directProviders.length + ' direct-search repositories listed separately';
    const originalEmpty = document.querySelector('#empty-state'); const empty = originalEmpty.cloneNode(false);
    originalEmpty.replaceWith(empty); empty.hidden = true;
    const originalHelp = document.querySelector('#pagination-help'); const help = originalHelp.cloneNode(false);
    originalHelp.replaceWith(help); help.textContent = 'Generated demonstration results from repositories that support the unified grid.';
    const originalNativeSearches = document.querySelector('#native-searches');
    const nativeSearches = originalNativeSearches.cloneNode(false);
    const directIds = new Set(directProviders.map((provider) => provider.id));
    nativeSearches.replaceChildren(...[...originalNativeSearches.children].filter((item) => directIds.has(item.querySelector('a')?.dataset.providerId || '')).map((item) => item.cloneNode(true)));
    originalNativeSearches.replaceWith(nativeSearches); nativeSearches.hidden = directProviders.length === 0;
    const directSection = document.querySelector('#direct-search-section');
    directSection.hidden = directProviders.length === 0; directSection.open = directProviders.length > 0;
    document.querySelector('#provider-status-details').hidden = true;
    injectedDemoProviders = { providers, cardProviders, directProviders };
    return injectedDemoProviders;
  };
  const state = () => {
    if (page === 'popup') {
      const input = document.querySelector('#query');
      if (input) input.value = 'benchy';
      const summaryElement = document.querySelector('#repository-count');
      const productionSummary = summaryElement?.textContent?.trim() ?? '';
      if (!popupSummaryInjected && capturedProviders.length) {
        if (!summaryElement || !/ready without setup|repositories enabled|could not/i.test(productionSummary)) return;
        const aggregated = capturedProviders.filter((provider) => provider.mode === 'aggregated').length;
        const direct = capturedProviders.length - aggregated;
        popupSummaryInjected = true;
        summaryElement.textContent = aggregated + ' aggregated repositories · ' + direct + ' direct-search repositories';
      }
      const summary = summaryElement?.textContent?.trim() ?? '';
      return popupSummaryInjected && summary && !summary.includes('could not') ? { summary } : undefined;
    }
    if (page === 'settings') {
      const items = [...document.querySelectorAll('#repository-availability li')];
      if (!items.length || items.some((item) => item.querySelector('input')?.disabled)) return;
      return { providers: items.map((item) => {
        const input = item.querySelector('input');
        const name = item.querySelector('label')?.textContent?.trim() ?? '';
        const status = item.querySelector('.hint')?.textContent?.trim() ?? '';
        return { id: input?.id.replace(/^repository-/, '') ?? '', name, mode: status.includes('Direct search only') ? 'direct-search' : 'aggregated', enabled: input?.checked === true };
      }) };
    }
    const productionSummary = document.querySelector('#search-summary')?.textContent ?? '';
    const productionRepositories = document.querySelectorAll('#repository-options label, #disabled-repository-options label').length;
    if (!productionRepositories || !/benchy/i.test(productionSummary)) return;
    const injected = injectDynamicDemoCards();
    if (!injected) return;
    const { providers, cardProviders, directProviders } = injected;
    const cards = document.querySelectorAll('#results-grid .model-card').length;
    const images = [...document.querySelectorAll('#results-grid .model-card img')];
    for (const image of images) image.loading = 'eager';
    const imagesReady = images.length === cardProviders.length && images.every((image) => image.complete && image.naturalWidth > 0);
    const repositories = document.querySelectorAll('#repository-options label, #disabled-repository-options label').length;
    const directSearches = document.querySelectorAll('#native-searches a').length;
    return cards === cardProviders.length && directSearches === directProviders.length && imagesReady && repositories
      ? { cards, repositories, directSearches, demoProviders: providers } : undefined;
  };
  const started = Date.now();
  let finishing = false;
  const finish = async () => {
    if (finishing) return;
    let payload;
    try { payload = state(); }
    catch (error) {
      finishing = true;
      clearInterval(timer); observer?.disconnect();
      await nativeFetch('/__tridijump_screenshot_ready?page=' + encodeURIComponent(page) + '&token=' + encodeURIComponent(token), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      });
      return;
    }
    if (!payload && Date.now() - started < 10000) return;
    if (!payload) return;
    finishing = true;
    clearInterval(timer);
    observer?.disconnect();
    if (page === 'results') {
      await Promise.all([...document.querySelectorAll('#results-grid img')].map((image) => image.decode().catch(() => undefined)));
    }
    document.documentElement.dataset.screenshotReady = page;
    await nativeFetch('/__tridijump_screenshot_ready?page=' + encodeURIComponent(page) + '&token=' + encodeURIComponent(token), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
  };
  const observer = new MutationObserver(() => { void finish(); });
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  document.addEventListener('load', () => { void finish(); }, true);
  const timer = setInterval(() => { void finish(); }, 50);
  queueMicrotask(() => { void finish(); });
})();`;
}

function screenshotCss(page) {
  if (page === 'popup') return 'body.popup{width:auto;min-height:100vh;display:grid;place-items:center;padding:2rem}body.popup main{width:380px;padding:1.25rem;border:1px solid var(--border);border-radius:.8rem;background:var(--surface);box-shadow:0 1rem 3rem #0003}';
  if (page === 'settings') return 'body.settings{padding:.65rem 1rem;font-size:12px}body.settings main{max-width:74rem}body.settings .panel{margin-block:.45rem;padding:.65rem}body.settings #repository-availability{gap:.55rem 1rem}body.settings #provider-cults3d,body.settings #provider-myminifactory,body.settings #provider-thingiverse,body.settings #provider-smithsonian{display:none}body.settings #settings-form{max-width:none;display:grid;grid-template-columns:1fr 1fr;gap:.55rem}body.settings #settings-form fieldset{margin:0;padding:.65rem}body.settings #settings-form .panel{display:none}body.settings #settings-status{grid-column:1/-1}';
  return 'body.results{padding:.85rem;font-size:13px}body.results main{max-width:76rem}body.results .results-layout{grid-template-columns:13rem minmax(0,1fr);gap:.8rem;margin-top:.7rem}body.results .results-grid{grid-template-columns:repeat(6,minmax(0,1fr));gap:.55rem}body.results .model-card-content{padding-bottom:.55rem}body.results .model-card h3{font-size:.74rem;margin:.45rem .55rem .2rem}body.results .model-source{font-size:.7rem;margin:0 .55rem .4rem}body.results .price-badge{font-size:.68rem;margin-inline:.55rem;padding:.12rem .35rem}body.results #native-searches{font-size:.75rem;gap:.2rem .7rem;margin-bottom:.35rem}';
}

async function requestBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error('Screenshot readiness payload is too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function startServer(directory, ready) {
  const root = resolve(directory);
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/__tridijump_screenshot_ready' && request.method === 'POST') {
        const page = url.searchParams.get('page'); const token = url.searchParams.get('token');
        if (!page || !token) { response.writeHead(400).end(); return; }
        ready.set(`${page}:${token}`, JSON.parse(await requestBody(request)));
        response.writeHead(204).end(); return;
      }
      if (url.pathname === '/__tridijump_screenshot_bootstrap.js' && request.method === 'GET') {
        const page = url.searchParams.get('page'); const token = url.searchParams.get('token');
        if (!PAGES.some((value) => value.id === page) || !token) { response.writeHead(400).end(); return; }
        response.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store', 'Content-Security-Policy': CSP });
        const settingsProviders = [...ready.values()].find((value) => Array.isArray(value?.providers))?.providers ?? [];
        const resultProviders = [...ready.values()].find((value) => Array.isArray(value?.demoProviders))?.demoProviders ?? [];
        console.log(`Screenshot bootstrap ${page}: ${settingsProviders.length} settings providers, ${resultProviders.length} result providers`);
        response.end(screenshotBootstrap(page, token, page === 'results' ? settingsProviders : resultProviders)); return;
      }
      if (url.pathname === '/__tridijump_screenshot_delay.js' && request.method === 'GET') {
        setTimeout(() => {
          response.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store', 'Content-Security-Policy': CSP });
          response.end('// Capture-only load gate; never written to the extension build.\n');
        }, 3000);
        return;
      }
      if (url.pathname.startsWith('/__tridijump_screenshot_asset/') && request.method === 'GET') {
        const name = url.pathname.slice('/__tridijump_screenshot_asset/'.length);
        if (!DEMO_ASSETS.includes(name)) { response.writeHead(404).end(); return; }
        const content = await readFile(join(DEMO_ASSET_DIRECTORY, name));
        response.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'Content-Security-Policy': CSP });
        response.end(content); return;
      }
      if (request.method !== 'GET') { response.writeHead(405).end(); return; }
      const pathname = decodeURIComponent(url.pathname === '/' ? '/src/results/index.html' : url.pathname);
      const candidate = resolve(root, `.${pathname}`);
      if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) { response.writeHead(403).end(); return; }
      const info = await stat(candidate);
      if (!info.isFile()) { response.writeHead(404).end(); return; }
      let content = await readFile(candidate);
      if (extname(candidate) === '.html') {
        const page = PAGES.find((value) => pathname.endsWith(value.url.split('?')[0]))?.id;
        const token = url.searchParams.get('captureToken');
        if (page && token) {
          const source = `/__tridijump_screenshot_bootstrap.js?page=${encodeURIComponent(page)}&token=${encodeURIComponent(token)}`;
          const preloads = page === 'results' ? DEMO_ASSETS.map((name) =>
            `<link rel="preload" as="image" href="/__tridijump_screenshot_asset/${encodeURIComponent(name)}">`).join('') : '';
          const loadGate = page === 'results' ? '<script type="module" src="/__tridijump_screenshot_delay.js"></script>' : '';
          content = Buffer.from(content.toString('utf8').replace('</head>', `${preloads}<script src="${source}"></script>${loadGate}<style>${screenshotCss(page)}</style></head>`));
        }
      }
      response.writeHead(200, { 'Content-Type': MIME[extname(candidate)] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'Content-Security-Policy': CSP });
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
  const url = new URL(page.url, `http://127.0.0.1:${address.port}/`);
  url.searchParams.set('captureToken', token);
  const output = join(outputDirectory, page.file);
  const profile = await mkdtemp(join(tmpdir(), `tridijump-${target}-`));
  try {
    const args = target === 'chrome'
      ? ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
        '--disable-background-networking', '--disable-component-update', '--disable-sync', '--metrics-recording-only',
        '--disable-features=LazyImageLoading', '--run-all-compositor-stages-before-draw',
        `--user-data-dir=${profile}`, `--window-size=${VIEWPORT.width},${VIEWPORT.height}`, '--virtual-time-budget=30000',
        `--screenshot=${output}`, url.href]
      : ['--headless', '--no-remote', '--profile', profile, `--window-size=${VIEWPORT.width},${VIEWPORT.height}`, '--screenshot', output, url.href];
    await run(browser, args);
    const pageState = ready.get(`${page.id}:${token}`);
    if (!pageState) fail(`${target} ${page.id} page did not report production-render readiness; no image is accepted.`);
    if (pageState.error) fail(`${target} ${page.id} capture failed in the browser: ${pageState.error}`);
    const image = await readFile(output);
    const dimensions = pngDimensions(image, output);
    if (dimensions.width !== VIEWPORT.width || dimensions.height !== VIEWPORT.height) fail(`${page.file} is ${dimensions.width}x${dimensions.height}, expected 1280x800.`);
    console.log(`✓ ${target}: ${page.file}`);
    return { file: { path: relative(ROOT, output).split(sep).join('/'), page: page.id, target, ...dimensions, bytes: image.length, sha256: sha256(image) }, pageState };
  } finally {
    const { rm } = await import('node:fs/promises');
    await rm(profile, { recursive: true, force: true });
  }
}

async function main() {
  if (!['all', 'chrome', 'firefox'].includes(TARGET)) fail('Use screenshots.mjs with all, chrome, or firefox.');
  const targets = TARGET === 'all' ? ['chrome', 'firefox'] : [TARGET];
  const generated = [];
  for (const target of targets) {
    await build(target);
    if (BUILD_ONLY) continue;
    const browser = await findBrowser(target);
    const outputDirectory = join(ROOT, 'release', 'screenshots', target);
    await mkdir(outputDirectory, { recursive: true });
    const ready = new Map();
    const server = await startServer(productionDirectory(target), ready);
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
    const settings = generated.find((entry) => entry.file.page === 'settings')?.pageState;
    const manifest = {
      sourceCommit: commit, sourceWorkingTreeClean: !dirty, screenshotVersion: 2,
      screenshotBuildMode: 'ordinary-production-build', viewport: VIEWPORT,
      providers: settings?.providers ?? [], productionEntriesUsed: true,
      localStateInjectedAtServeTime: true, noLiveNetwork: true, remoteResourcesBlocked: true,
      files: generated.map((entry) => entry.file),
    };
    const manifestPath = join(ROOT, 'release', 'screenshots', 'manifest.json');
    await mkdir(dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(`✓ Screenshot manifest: ${relative(ROOT, manifestPath)}`);
  }
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  try { await main(); }
  catch (error) { console.error(`Screenshot generation failed: ${error.message}`); process.exitCode = 1; }
}
