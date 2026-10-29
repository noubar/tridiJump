// SPDX-License-Identifier: GPL-3.0-or-later
import { createHash } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

const ZIP_UTF8_FLAG = 0x0800;
const ZIP_METHOD_DEFLATE = 8;
const ZIP_DOS_DATE_1980_01_01 = 0x0021;

export function isChromeVersion(version) {
  if (typeof version !== 'string' || !/^(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,3}$/.test(version)) return false;
  return version.split('.').every((part) => Number(part) <= 65535);
}

export function validateManifest(manifest, expectedVersion) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return ['manifest must be an object'];
  if (manifest.manifest_version !== 3) errors.push('manifest_version must be 3');
  if (manifest.version !== expectedVersion) errors.push(`manifest version must be ${expectedVersion}`);
  if (typeof manifest.name !== 'string' || manifest.name.trim() === '') errors.push('manifest name must be non-empty');
  if (typeof manifest.description !== 'string' || manifest.description.trim() === '') errors.push('manifest description must be non-empty');
  for (const field of ['permissions', 'host_permissions']) {
    if (!Array.isArray(manifest[field]) || !manifest[field].every((value) => typeof value === 'string')) {
      errors.push(`${field} must be an array of strings`);
    }
  }
  return errors;
}

export function compareAllowlist(actual, approved, label) {
  if (!Array.isArray(actual) || !actual.every((value) => typeof value === 'string')) {
    return [`${label} must be an array of strings`];
  }
  const actualSet = new Set(actual);
  const approvedSet = new Set(approved);
  const errors = [];
  if (actualSet.size !== actual.length) errors.push(`${label} contains duplicates`);
  for (const value of actualSet) if (!approvedSet.has(value)) errors.push(`Unexpected ${label}: ${value}`);
  for (const value of approvedSet) if (!actualSet.has(value)) errors.push(`Missing approved ${label}: ${value}`);
  return errors;
}

export function isSafePackagePath(relativePath) {
  if (typeof relativePath !== 'string' || relativePath === '' || relativePath.includes('\\') || relativePath.includes('\0')) return false;
  if (relativePath.startsWith('/') || /^[A-Za-z]:/.test(relativePath)) return false;
  const parts = relativePath.split('/');
  return parts.every((part) => part !== '' && part !== '.' && part !== '..');
}

export function forbiddenPackagePath(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/');
  const parts = normalized.toLowerCase().split('/');
  const base = parts.at(-1) ?? '';
  if (parts.some((part) => ['node_modules', '.git', 'tests', 'test', 'fixtures'].includes(part))) return 'development directory';
  if (parts.some((part) => ['screenshot', 'screenshots'].includes(part))
    || normalized.toLowerCase().includes('assets/demo/')
    || /^demo-.*\.png$/i.test(base)
    || /(?:demo-results|screenshot-bootstrap|screenshot-entry)/i.test(base)) return 'screenshot/demo tooling';
  if (base === '.env' || base.startsWith('.env.')) return 'environment file';
  if (base.endsWith('.map')) return 'source map';
  if (/\.(tmp|temp|bak|orig|swp)$/.test(base) || base.endsWith('~')) return 'temporary file';
  if (/^(vite|vitest|eslint|prettier|tsconfig)(\.|$)/.test(base)) return 'developer configuration';
  if (/\.(pem|p12|pfx|key)$/.test(base) || base === 'id_rsa' || base === 'id_ed25519') return 'credential/private key file';
  return undefined;
}

export function detectSecretCategories(text) {
  const categories = [];
  const checks = [
    ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ['bearer token', /authorization\s*[:=]\s*["']?bearer\s+[A-Za-z0-9._~+\/-]{20,}["']?/i],
    ['basic credential', /authorization\s*[:=]\s*["']?basic\s+[A-Za-z0-9+/]{20,}={0,2}["']?/i],
    ['assigned secret', /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\b\s*[:=]\s*["'][A-Za-z0-9._~+\/-]{20,}["']/i],
    ['environment secret', /^\s*(?:API_KEY|ACCESS_TOKEN|CLIENT_SECRET|PASSWORD)\s*=\s*[^\s#]{16,}\s*$/im],
  ];
  for (const [category, pattern] of checks) if (pattern.test(text)) categories.push(category);
  return categories;
}

export function containsScreenshotTooling(text) {
  return /(?:__tridijump_screenshot_ready|Screenshot fixture must contain|Benchy Calibration Collection|screenshot-mode|renderScreenshot(?:Popup|Results|Settings))/i.test(text);
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  return value >>> 0;
});

export function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function createDeterministicZip(entries) {
  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path, 'en'));
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const seen = new Set();

  for (const entry of sorted) {
    if (!isSafePackagePath(entry.path)) throw new Error(`Unsafe ZIP path: ${entry.path}`);
    if (seen.has(entry.path)) throw new Error(`Duplicate ZIP path: ${entry.path}`);
    seen.add(entry.path);
    const name = Buffer.from(entry.path, 'utf8');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const compressed = deflateRawSync(data, { level: 9 });
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(ZIP_UTF8_FLAG, 6);
    local.writeUInt16LE(ZIP_METHOD_DEFLATE, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(ZIP_DOS_DATE_1980_01_01, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(ZIP_UTF8_FLAG, 8);
    central.writeUInt16LE(ZIP_METHOD_DEFLATE, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(ZIP_DOS_DATE_1980_01_01, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(sorted.length, 8);
  end.writeUInt16LE(sorted.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

export function readZipEntries(archive) {
  let endOffset = -1;
  for (let index = archive.length - 22; index >= Math.max(0, archive.length - 65557); index -= 1) {
    if (archive.readUInt32LE(index) === 0x06054b50) { endOffset = index; break; }
  }
  if (endOffset < 0) throw new Error('ZIP end record not found');
  const count = archive.readUInt16LE(endOffset + 10);
  let offset = archive.readUInt32LE(endOffset + 16);
  const entries = [];
  const seen = new Set();
  for (let index = 0; index < count; index += 1) {
    if (archive.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid ZIP central directory');
    const method = archive.readUInt16LE(offset + 10);
    const checksum = archive.readUInt32LE(offset + 16);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const size = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const path = archive.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    if (!isSafePackagePath(path)) throw new Error(`Unsafe ZIP path: ${path}`);
    if (seen.has(path)) throw new Error(`Duplicate ZIP path: ${path}`);
    seen.add(path);
    if (archive.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`Invalid local ZIP entry: ${path}`);
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = archive.subarray(dataOffset, dataOffset + compressedSize);
    const data = method === 8 ? inflateRawSync(compressed) : method === 0 ? Buffer.from(compressed) : undefined;
    if (!data) throw new Error(`Unsupported ZIP compression method ${method}: ${path}`);
    if (data.length !== size || crc32(data) !== checksum) throw new Error(`ZIP integrity check failed: ${path}`);
    entries.push({ path, data });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
