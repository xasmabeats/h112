import type { Beat, Metadata, Settings, Template } from '../types';
export function generate(
  beat: Beat,
  settings: Settings,
  templates: Template[],
  titleId = '',
): Metadata {
  const values: Record<string, string> = {
    beatTitle: beat.title,
    genre: beat.genre,
    bpm: String(beat.bpm),
    key: beat.key,
    mood: beat.mood,
    artists: beat.artists,
    producer: settings.producer,
    year: String(new Date().getFullYear()),
    licensing: settings.licensing,
    contact: settings.contact,
    socials: settings.socials,
  };
  const render = (content: string, hashtag = false) =>
    content.replace(/\{(\w+)\}/g, (match, key: string) => {
      if (!Object.hasOwn(values, key)) return match;
      return hashtag ? values[key].replace(/[^\p{L}\p{N}_]/gu, '') : values[key];
    });
  const pick = (kind: Template['kind']) =>
    render(
      (kind === 'title'
        ? templates.find(
            (t) => t.kind === 'title' && t.id === (titleId || settings.defaultTemplate),
          )
        : undefined
      )?.content ||
        templates.find((t) => t.kind === kind && t.isDefault)?.content ||
        templates.find((t) => t.kind === kind)?.content ||
        '',
      kind === 'hashtags',
    );
  return {
    title: pick('title'),
    description: pick('description'),
    tags: [pick('tags'), ...beat.tags].filter(Boolean).join(', '),
    hashtags: pick('hashtags')
      .split(/[,\s]+/)
      .map((s) => s.replace(/[^\p{L}\p{N}_]/gu, ''))
      .filter(Boolean)
      .map((s) => `#${s}`)
      .join(' '),
    filename:
      `${beat.title}-${beat.bpm}-${beat.key}`
        .normalize('NFKD')
        .replace(/[^a-zA-Z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase() + '.wav',
    pinnedComment: pick('pinnedComment'),
  };
}
