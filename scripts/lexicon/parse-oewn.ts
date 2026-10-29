// SPDX-License-Identifier: GPL-3.0-or-later
import { addSense } from './model.ts';
import type { LexicalIndex } from './model.ts';

interface OewnSynset { members?: unknown; partOfSpeech?: unknown }
interface OewnSense { synset?: unknown }
interface OewnEntry { n?: { sense?: OewnSense[] } }

const SYNSET_FILES = ['noun.artifact.json', 'noun.object.json', 'noun.shape.json'] as const;
const ENTRY_FILES = ['0', ...'abcdefghijklmnopqrstuvwxyz'].map((value) => `entries-${value}.json`);

export const OEWN_REQUIRED_FILES = [...SYNSET_FILES, ...ENTRY_FILES] as const;

export interface OewnConversion {
  index: LexicalIndex;
  selectedSynsets: number;
}

/** Build a concrete-noun same-synset index. No graph relations are read. */
export function convertOewn(files: ReadonlyMap<string, string>): OewnConversion {
  const synsets = new Map<string, { members: string[]; priority: number }>();
  SYNSET_FILES.forEach((name, priority) => {
    const parsed = JSON.parse(files.get(name) ?? '') as Record<string, OewnSynset>;
    for (const [id, value] of Object.entries(parsed)) {
      if (value.partOfSpeech !== 'n' || !Array.isArray(value.members)) continue;
      const members = value.members.filter((member): member is string => typeof member === 'string');
      if (members.length > 1) synsets.set(id, { members, priority });
    }
  });

  const index: LexicalIndex = new Map();
  for (const name of ENTRY_FILES) {
    const parsed = JSON.parse(files.get(name) ?? '') as Record<string, OewnEntry>;
    for (const [lemma, entry] of Object.entries(parsed)) {
      const ranked = (entry.n?.sense ?? []).map((sense, order) => ({
        order,
        synset: typeof sense.synset === 'string' ? synsets.get(sense.synset) : undefined,
      })).filter((value): value is { order: number; synset: { members: string[]; priority: number } } => Boolean(value.synset))
        .sort((left, right) => left.synset.priority - right.synset.priority || left.order - right.order);
      for (const value of ranked.slice(0, 4)) addSense(index, lemma, value.synset.members);
    }
  }
  return { index, selectedSynsets: synsets.size };
}
