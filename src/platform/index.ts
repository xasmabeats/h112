import { invoke, isTauri, convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  ManagedMedia,
  RenderRequest,
  RenderJob,
  NativeSnapshot,
  ExportRecord,
  PreparedRestore,
} from '../types/desktop';
export const isDesktop = () => isTauri();
async function native<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isDesktop())
    throw new Error(
      'This operation requires the Windows desktop application. The web/PWA remains available for catalog management.',
    );
  return invoke<T>(command, args);
}
export const platform = {
  snapshot: () => native<NativeSnapshot>('desktop_snapshot'),
  pickMedia: (kind: 'audio' | 'artwork') => native<ManagedMedia | null>('pick_media', { kind }),
  relinkMedia: (mediaId: string) => native<ManagedMedia | null>('relink_media', { mediaId }),
  importDrop: (token: string) => native<ManagedMedia[]>('import_drop', { token }),
  startRender: (request: RenderRequest) => native<RenderJob>('start_render', { request }),
  cancelRender: (jobId: string) => native<void>('cancel_render', { jobId }),
  exportRelease: (jobId: string) => native<ExportRecord | null>('export_release', { jobId }),
  saveVideo: (jobId: string) => native<ExportRecord | null>('save_video', { jobId }),
  openOutputFolder: (jobId: string) => native<void>('open_output_folder', { jobId }),
  portableBackup: (metadataJson: string) => native<boolean>('portable_backup', { metadataJson }),
  prepareRestore: () => native<PreparedRestore | null>('prepare_restore'),
  promoteRestore: (transactionId: string) => native<void>('promote_restore', { transactionId }),
  finishRestore: (transactionId: string) => native<void>('finish_restore', { transactionId }),
  createRecovery: (metadataJson: string) => native<string>('create_recovery', { metadataJson }),
  assetUrl: (nativePath: string) => (isDesktop() ? convertFileSrc(nativePath) : ''),
  onDrop: async (callback: (token: string) => void, onError?: (message: string) => void) => {
    if (!isDesktop()) return () => {};
    const stopDrop = await listen<{ token: string }>('desktop-drop', (event) =>
      callback(event.payload.token),
    );
    try {
      const stopError = await listen<string>('desktop-drop-error', (event) =>
        onError?.(event.payload),
      );
      return () => {
        stopDrop();
        stopError();
      };
    } catch (error) {
      stopDrop();
      throw error;
    }
  },
};
