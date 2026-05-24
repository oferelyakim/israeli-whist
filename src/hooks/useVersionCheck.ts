import { useEffect, useState } from 'react';

export function useVersionCheck(): boolean {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/version.json', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { version: string };
        if (data.version !== __APP_VERSION__) {
          setUpdateAvailable(true);
        }
      } catch {
        // Network unavailable — silently ignore
      }
    };
    check();
  }, []);

  return updateAvailable;
}
