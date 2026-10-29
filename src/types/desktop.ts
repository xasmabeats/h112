import type { Metadata } from './index';
export interface ManagedMedia {
  id: string;
  kind: 'audio' | 'artwork';
  originalName: string;
  format: 'mp3' | 'wav' | 'png' | 'jpg';
  mime: string;
  bytes: number;
  duration: number | null;
  width: number | null;
  height: number | null;
  sha256: string;
  version: 1;
  createdAt: string;
  managed: true;
}
export interface RenderRequest {
  beatId: string;
  releaseId: string;
  audioId: string;
  artworkId: string;
  metadata: Metadata;
}
export const jobStates = [
  'Probing',
  'Preparing',
  'Encoding',
  'Validating',
  'Completed',
  'Cancelled',
  'Failed',
  'Interrupted',
] as const;
export type JobState = (typeof jobStates)[number];
export interface RenderJob {
  id: string;
  attempt: number;
  request: RenderRequest;
  audio: ManagedMedia;
  artwork: ManagedMedia;
  state: JobState;
  progress: number;
  createdAt: string;
  updatedAt: string;
  error: string | null;
  outputBytes: number | null;
  outputSha256: string | null;
}
export interface ReleaseDraft {
  id: string;
  beatId: string;
  name: string;
  audioId: string;
  artworkId: string;
  metadata: Metadata;
  ready: boolean;
  createdAt: string;
  updatedAt: string;
  manualPublication: null | { confirmedAt: string; userReported: true; url: string };
}
export interface ExportRecord {
  id: string;
  jobId: string;
  releaseId: string;
  beatId: string;
  createdAt: string;
  kind: 'video' | 'release-folder';
  destinationName: string;
  bytes: number;
}
export interface HistoryEvent {
  id: string;
  beatId: string;
  releaseId?: string;
  jobId?: string;
  type: string;
  status?: string;
  at: string;
  detail: string;
}
export interface NativeSnapshot {
  catalog: { media: ManagedMedia[]; jobs: RenderJob[]; exports: ExportRecord[] };
  mediaUrls: Record<string, string>;
  outputUrls: Record<string, string>;
  activeJobId: string | null;
  toolsReady: boolean;
}
export interface PreparedRestore {
  transactionId: string;
  metadataJson: string;
  mediaCount: number;
  includesGeneratedVideo: false;
}
