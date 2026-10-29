import type { Beat, Metadata, Settings, Template } from '../types';
import { generate } from './metadata';
export interface MetadataProvider {
  id: string;
  label: string;
  generate(
    beat: Beat,
    settings: Settings,
    templates: Template[],
    signal?: AbortSignal,
  ): Promise<Metadata>;
}
export const templateProvider: MetadataProvider = {
  id: 'templates',
  label: 'Template-based (local, not AI)',
  async generate(beat, settings, templates, signal) {
    signal?.throwIfAborted();
    return generate(beat, settings, templates);
  },
};
export interface PublishProgress {
  stage: string;
  fraction: number;
}
export interface PublishingResult {
  supported: boolean;
  userReported: boolean;
  videoId?: string;
  url?: string;
  publishedAt?: string;
  error?: { code: string; message: string };
}
export interface PublishingProvider {
  id: string;
  authentication: 'none' | 'unsupported';
  validate(metadata: Metadata): string[];
  publish(
    metadata: Metadata,
    onProgress: (progress: PublishProgress) => void,
    signal?: AbortSignal,
  ): Promise<PublishingResult>;
}
export const manualPublisher: PublishingProvider = {
  id: 'manual-local',
  authentication: 'none',
  validate: (m) => (m.title.trim() ? [] : ['A title is required']),
  async publish() {
    return {
      supported: false,
      userReported: false,
      error: {
        code: 'UNSUPPORTED',
        message:
          'Network publishing is unavailable. Export files and publish manually; record your confirmation separately.',
      },
    };
  },
};
// Optional local runtimes (for example llama.cpp server) are deliberately not connected.
// A future adapter must enforce loopback, timeouts, cancellation, validated output and template fallback.
