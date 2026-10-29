import Dexie, { type EntityTable } from 'dexie';
import type { Beat, Template, Settings } from '../types';
export const db = new Dexie('xasma-release-manager') as Dexie & {
  beats: EntityTable<Beat, 'id'>;
  templates: EntityTable<Template, 'id'>;
  settings: EntityTable<Settings, 'id'>;
};
db.version(1).stores({
  beats: 'id,title,genre,status,plannedDate,updatedAt,*tags',
  templates: 'id,kind',
  settings: 'id',
});
export const defaults: Settings = {
  id: 'preferences',
  producer: 'XASMA',
  defaultGenre: 'Drill',
  defaultTemplate: '',
  schedule: '',
  contact: '',
  socials: '',
  licensing: '',
  appearance: 'comfortable',
};
export const starters: Template[] = [
  {
    id: 'title-drill',
    name: 'Drill · artist type beat',
    kind: 'title',
    content: '{artists} Type Beat — "{beatTitle}" | {genre} {year}',
    isDefault: true,
  },
  {
    id: 'title-dark',
    name: 'Dark Trap · minimal',
    kind: 'title',
    content: '{beatTitle} — Dark Trap Instrumental | {producer}',
    isDefault: false,
  },
  {
    id: 'title-super',
    name: 'Supertrap · producer cut',
    kind: 'title',
    content: '{beatTitle} | Supertrap Type Beat {year} • {producer}',
    isDefault: false,
  },
  {
    id: 'desc',
    name: 'Release description',
    kind: 'description',
    content:
      '{beatTitle}\nProduced by {producer}\n\n{genre} • {bpm} BPM • {key}\nMood: {mood}\n\n{licensing}\n{contact}\n{socials}',
    isDefault: true,
  },
  {
    id: 'tags',
    name: 'Core tags',
    kind: 'tags',
    content: '{genre}, {mood}, {artists}, {producer}, type beat, instrumental',
    isDefault: true,
  },
  {
    id: 'hash',
    name: 'Genre hashtags',
    kind: 'hashtags',
    content: '#{genre} #{producer} #typebeat',
    isDefault: true,
  },
  {
    id: 'license',
    name: 'Licensing reminder',
    kind: 'licensing',
    content: 'Add your own licensing terms before publishing.',
    isDefault: false,
  },
  {
    id: 'pin',
    name: 'Pinned comment',
    kind: 'pinnedComment',
    content: '{beatTitle} — produced by {producer}\n{contact}',
    isDefault: true,
  },
];
export async function initialize() {
  await db.transaction('rw', db.settings, db.templates, async () => {
    if (!(await db.settings.get('preferences'))) {
      await db.settings.add(defaults);
      await db.templates.bulkAdd(starters);
    }
  });
}
export function newBeat(genre = 'Drill'): Beat {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: '',
    genre,
    bpm: 140,
    key: '',
    mood: '',
    artists: '',
    tags: [],
    productionNotes: '',
    customNotes: '',
    createdAt: now,
    updatedAt: now,
    status: 'Idea',
    plannedDate: '',
    actualDate: '',
    youtubeUrl: '',
    artwork: '',
    metadata: null,
  };
}
export async function saveBeat(beat: Beat) {
  if (!beat.title.trim()) throw new Error('A beat title is required.');
  if (!Number.isFinite(beat.bpm) || beat.bpm < 1 || beat.bpm > 400)
    throw new Error('BPM must be between 1 and 400.');
  await db.beats.put({ ...beat, title: beat.title.trim(), updatedAt: new Date().toISOString() });
}
export async function changeStatus(beat: Beat, status: Beat['status']) {
  if (status === 'Published' && !window.confirm(`Confirm “${beat.title}” is published?`)) return;
  await saveBeat({
    ...beat,
    status,
    actualDate: status === 'Published' ? beat.actualDate || localDate(new Date()) : beat.actualDate,
  });
}
export function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
