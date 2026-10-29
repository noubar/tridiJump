// SPDX-License-Identifier: GPL-3.0-or-later
export const CONVERTER_VERSION = '1';
export const FORMAT_VERSION = 1;
export const RETRIEVAL_DATE = '2026-10-28';
export const SOURCES = {
  oewn: {
    name: 'Open English WordNet', version: '2025 core',
    url: 'https://github.com/globalwordnet/english-wordnet/releases/download/2025-edition/english-wordnet-2025-json.zip',
    file: 'english-wordnet-2025-json.zip',
    sha256: '7d749f6e2c39e6970e4997839dcf6e42fd281f3c2fae0171d2192bae8cfa4b51',
    license: 'CC-BY-4.0 with the underlying Princeton WordNet license notice',
  },
  ding: {
    name: 'Ding German-English Dictionary', version: '1.9',
    url: 'https://ftp.tu-chemnitz.de/pub/Local/urz/ding/ding-1.9.tar.gz',
    file: 'ding-1.9.tar.gz',
    sha256: '69a6c81fcf785a286c053a352f3201cc8671c72851615c4b707a434309b098e5',
    license: 'GPL-2.0-or-later',
  },
} as const;
