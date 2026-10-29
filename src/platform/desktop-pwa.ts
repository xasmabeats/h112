// Desktop assets are bundled. The native target must never register a web service worker.
export function useRegisterSW() {
  return {
    needRefresh: [false] as const,
    offlineReady: [false] as const,
    updateServiceWorker: async (_reload?: boolean) => {},
  };
}
