// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from 'vitest';
import { providerAvailability } from '../src/providers/availability';
import { saveCredentials } from '../src/providers/credentials';
import { mockExtensionStorage } from './helpers/extension-storage';

afterEach(() => vi.unstubAllGlobals());

describe('provider classification and native fallbacks', () => {
  it('keeps user credential values out of provider metadata and field declarations after saving', async () => {
    mockExtensionStorage();
    const before = JSON.stringify(providerAvailability);
    const markers: string[] = [];
    for (const source of providerAvailability) {
      // No auth payload, header, user identity or credential values belong here.
      expect(Object.keys(source).sort()).toEqual([
        'id', 'name', 'classification', 'mode', 'tier', 'reason', 'searchUrl',
        ...(source.id === 'smithsonian' ? ['defaultEnabled'] : []),
        ...('createProvider' in source ? ['createProvider'] : []),
      ].sort());
      if (!('createProvider' in source)) continue;
      const provider = source.createProvider();
      const fields = provider.credentialFields;
      if (!fields?.length) continue;
      const definitions = JSON.stringify(fields);
      const values = Object.fromEntries(fields.map((field) => {
        const value = `FAKE-USER-VALUE-${source.id}-${field.name}`;
        markers.push(value); // Includes the user's non-password nickname.
        return [field.name, value];
      }));
      await saveCredentials(provider.id, fields, values);
      expect(JSON.stringify(provider.credentialFields)).toBe(definitions);
      for (const marker of markers) expect(definitions).not.toContain(marker);
    }
    const after = JSON.stringify(providerAvailability);
    expect(after).toBe(before);
    for (const marker of markers) expect(after).not.toContain(marker);
  });

  it('defines credential fields as inert packaged descriptions without executable/authentication hooks', () => {
    for (const source of providerAvailability) {
      if (!('createProvider' in source)) continue;
      for (const field of (source.createProvider().credentialFields ?? [])) {
        expect(Object.keys(field).sort()).toEqual(['label', 'name', 'secret']);
        expect(typeof field.name).toBe('string');
        expect(typeof field.label).toBe('string');
        expect(typeof field.secret).toBe('boolean');
      }
    }
  });

  it('connects two anonymous and four user-key APIs, retaining two fallbacks', () => {
    expect(providerAvailability.map((source) => source.id).sort()).toEqual([
      'cults3d', 'makerworld', 'myminifactory', 'printables', 'sketchfab', 'smithsonian', 'thangs', 'thingiverse',
    ]);
    for (const source of providerAvailability) {
      expect(source.classification).toBe(['printables', 'sketchfab'].includes(source.id) ? 'A' : ['cults3d', 'myminifactory', 'thingiverse', 'smithsonian'].includes(source.id) ? 'B' : 'D');
      expect(source.mode).toBe(source.classification === 'D' ? 'direct-search' : 'remote-api');
      expect(source.tier).toBe(source.id === 'smithsonian' ? 'specialist' : 'general');
      expect('defaultEnabled' in source ? source.defaultEnabled : true).toBe(source.id !== 'smithsonian');
      if ('createProvider' in source) {
        expect(source.createProvider().id).toBe(source.id);
        if (source.classification === 'B') expect(source.createProvider().credentialFields?.length).toBeGreaterThan(0);
        else expect(source.createProvider().credentialFields).toBeUndefined();
      }
      expect(source.reason).not.toBe('');
    }
  });

  it.each(providerAvailability)('encodes native search only for $name without credentials or executable URLs', (source) => {
    const query = 'café / part ? # + & <script> "';
    const url = new URL(source.searchUrl(query));
    expect(url.protocol).toBe('https:');
    expect(url.username).toBe('');
    expect(url.password).toBe('');
    expect(url.hash).toBe('');
    if (source.id === 'thangs') {
      expect(decodeURIComponent(url.pathname.slice('/search/'.length))).toBe(query);
      expect(url.searchParams.get('scope')).toBe('thangs');
    } else {
      const parameter = source.id === 'myminifactory' ? 'query' : source.id === 'makerworld' ? 'keyword' : source.id === 'smithsonian' ? 'edan_q' : 'q';
      expect(url.searchParams.get(parameter)).toBe(query);
    }
    for (const parameter of ['apiKey', 'key', 'token', 'access_token', 'password']) expect(url.searchParams.has(parameter)).toBe(false);
  });
});
