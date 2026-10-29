import Dexie, { type EntityTable } from 'dexie';
import type { Beat, Template, Settings } from '../types';
import type {
  ManagedMedia,
  ReleaseDraft,
  RenderJob,
  ExportRecord,
  HistoryEvent,
} from '../types/desktop';
export type AppDatabase = Dexie & {
  beats: EntityTable<Beat, 'id'>;
  templates: EntityTable<Template, 'id'>;
  settings: EntityTable<Settings, 'id'>;
  media: EntityTable<ManagedMedia, 'id'>;
  releases: EntityTable<ReleaseDraft, 'id'>;
  jobs: EntityTable<RenderJob, 'id'>;
  exports: EntityTable<ExportRecord, 'id'>;
  events: EntityTable<HistoryEvent, 'id'>;
};
export function createDatabase(name = 'xasma-release-manager') {
  const database = new Dexie(name) as AppDatabase;

  database.version(1).stores({
    beats: 'id,title,genre,status,plannedDate,updatedAt,*tags',
    templates: 'id,kind',
    settings: 'id',
  });
  database.version(2).stores({
    beats: 'id,title,genre,status,plannedDate,updatedAt,*tags',
    templates: 'id,kind',
    settings: 'id',
    media: 'id,kind',
    releases: 'id,beatId,updatedAt',
    jobs: 'id,request.releaseId,request.beatId,state,updatedAt',
    exports: 'id,releaseId,jobId,beatId',
    events: 'id,beatId,releaseId,jobId,type,status,at',
  });

  return database;
}
export const db = createDatabase();
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
  await db.transaction('rw', db.beats, db.events, async () => {
    const previous = await db.beats.get(beat.id);
    const at = new Date().toISOString();
    const saved = { ...beat, title: beat.title.trim(), updatedAt: at };
    if (previous) {
      const { updatedAt: _old, ...oldFields } = previous;
      const { updatedAt: _new, ...newFields } = saved;
      if (JSON.stringify(oldFields) === JSON.stringify(newFields)) return;
    }

    await db.beats.put(saved);
    const type = !previous
      ? 'beat_created'
      : previous.status !== beat.status
        ? 'production_status'
        : JSON.stringify(previous.metadata) !== JSON.stringify(beat.metadata)
          ? 'metadata_saved'
          : 'beat_updated';
    await db.events.add({
      id: crypto.randomUUID(),
      beatId: beat.id,
      type,
      status: beat.status,
      at,
      detail: type === 'metadata_saved' ? 'Metadata saved' : saved.title,
    });
  });
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

export async function removeBeat(id: string) {
  await db.transaction('rw', db.beats, db.events, async () => {
    const beat = await db.beats.get(id);
    if (!beat) return;
    const at = new Date().toISOString();
    await db.beats.update(id, { deletedAt: at, updatedAt: at });
    await db.events.add({
      id: crypto.randomUUID(),
      beatId: id,
      type: 'beat_deleted',
      at,
      detail: 'Removed from active library; retained for release provenance and backup recovery.',
    });
  });
}
