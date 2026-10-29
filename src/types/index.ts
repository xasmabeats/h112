export const statuses = [
  'Idea',
  'Producing',
  'Mixing',
  'Mastering',
  'Ready',
  'Scheduled',
  'Published',
] as const;
export type Status = (typeof statuses)[number];
export const genres = ['Drill', 'Dark Trap', 'Supertrap'];
export interface Metadata {
  title: string;
  description: string;
  tags: string;
  hashtags: string;
  filename: string;
  pinnedComment: string;
}
export interface Beat {
  id: string;
  title: string;
  genre: string;
  bpm: number;
  key: string;
  mood: string;
  artists: string;
  tags: string[];
  productionNotes: string;
  customNotes: string;
  createdAt: string;
  updatedAt: string;
  status: Status;
  plannedDate: string;
  actualDate: string;
  youtubeUrl: string;
  artwork: string;
  metadata: Metadata | null;
  deletedAt?: string;
  audioId?: string;
  artworkId?: string;
}
export const templateKinds = [
  'title',
  'description',
  'tags',
  'hashtags',
  'licensing',
  'pinnedComment',
] as const;
export type TemplateKind = (typeof templateKinds)[number];
export interface Template {
  id: string;
  name: string;
  kind: TemplateKind;
  content: string;
  isDefault: boolean;
}
export interface Settings {
  id: 'preferences';
  producer: string;
  defaultGenre: string;
  defaultTemplate: string;
  schedule: string;
  contact: string;
  socials: string;
  licensing: string;
  appearance: 'comfortable' | 'compact';
}
