import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { NativeSnapshot } from '../types/desktop';
import { isDesktop, platform } from './index';
import { syncNative } from '../lib/releases';
import { errorText } from '../components/ui';
const NativeContext = createContext<{
  snapshot: NativeSnapshot | null;
  error: string;
  refresh: () => Promise<void>;
}>({ snapshot: null, error: '', refresh: async () => {} });
export const useNative = () => useContext(NativeContext);
export function NativeProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<NativeSnapshot | null>(null),
    [error, setError] = useState('');
  async function refresh() {
    if (!isDesktop()) return;
    const next = await platform.snapshot();
    await syncNative(next);
    setSnapshot(next);
    setError('');
  }
  useEffect(() => {
    if (!isDesktop()) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = await platform.snapshot();
        if (stopped) return;
        await syncNative(next);
        if (!stopped) {
          setSnapshot(next);
          setError('');
        }
      } catch (e) {
        if (!stopped) setError(errorText(e));
      }
      if (!stopped) timer = setTimeout(() => void poll(), 600);
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);
  return (
    <NativeContext.Provider value={{ snapshot, error, refresh }}>{children}</NativeContext.Provider>
  );
}
