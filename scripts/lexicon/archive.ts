// SPDX-License-Identifier: GPL-3.0-or-later
import { gunzipSync, inflateRawSync } from 'node:zlib';

function findEndOfCentralDirectory(data: Buffer): number {
  const minimum = Math.max(0, data.length - 65_557);
  for (let offset = data.length - 22; offset >= minimum; offset--) {
    if (data.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error('Invalid ZIP: end-of-central-directory record not found.');
}

/** Extract selected entries from a conventional, non-encrypted ZIP archive. */
export function readZipEntries(data: Buffer, wanted: ReadonlySet<string>): Map<string, Buffer> {
  const end = findEndOfCentralDirectory(data);
  const count = data.readUInt16LE(end + 10);
  let offset = data.readUInt32LE(end + 16);
  const result = new Map<string, Buffer>();
  for (let index = 0; index < count; index++) {
    if (data.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid ZIP central directory.');
    const method = data.readUInt16LE(offset + 10);
    const compressedSize = data.readUInt32LE(offset + 20);
    const size = data.readUInt32LE(offset + 24);
    const nameLength = data.readUInt16LE(offset + 28);
    const extraLength = data.readUInt16LE(offset + 30);
    const commentLength = data.readUInt16LE(offset + 32);
    const localOffset = data.readUInt32LE(offset + 42);
    const name = data.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    if (wanted.has(name)) {
      if (data.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`Invalid ZIP local header for ${name}.`);
      const localNameLength = data.readUInt16LE(localOffset + 26);
      const localExtraLength = data.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = data.subarray(start, start + compressedSize);
      const content = method === 0 ? Buffer.from(compressed)
        : method === 8 ? inflateRawSync(compressed)
          : undefined;
      if (!content) throw new Error(`Unsupported ZIP compression method ${method} for ${name}.`);
      if (content.length !== size) throw new Error(`ZIP size mismatch for ${name}.`);
      result.set(name, content);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  for (const name of wanted) if (!result.has(name)) throw new Error(`ZIP entry not found: ${name}`);
  return result;
}

/** Extract selected regular files from a gzip-compressed ustar archive. */
export function readTarGzipEntries(data: Buffer, wantedSuffixes: ReadonlySet<string>): Map<string, Buffer> {
  const tar = gunzipSync(data);
  const result = new Map<string, Buffer>();
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/s, '');
    const rawSize = header.subarray(124, 136).toString('ascii').replace(/\0.*$/s, '').trim();
    const size = Number.parseInt(rawSize || '0', 8);
    if (!Number.isFinite(size)) throw new Error(`Invalid TAR size for ${name}.`);
    const start = offset + 512;
    for (const suffix of wantedSuffixes) {
      if (name === suffix || name.endsWith(`/${suffix}`)) result.set(suffix, Buffer.from(tar.subarray(start, start + size)));
    }
    offset = start + Math.ceil(size / 512) * 512;
  }
  for (const suffix of wantedSuffixes) if (!result.has(suffix)) throw new Error(`TAR entry not found: ${suffix}`);
  return result;
}
