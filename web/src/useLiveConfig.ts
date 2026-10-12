import { useEffect, useState } from 'react';
import { loadLiveConfig, proxyHealthy } from './lib/liveProxy';

export interface LiveConfig {
  /** Adresa vlastní proxy (NHL, extraliga, NBL); undefined = vypnuto. */
  proxyUrl?: string;
  /** Proxy odpověděla na /health. */
  healthy: boolean;
}

/** Jednou načte `live-config.json`; prázdná adresa nebo chyba = proxy vypnutá, bez dalších dotazů a hlášek. */
export function useLiveConfig(): LiveConfig {
  const [cfg, setCfg] = useState<LiveConfig>({ healthy: false });
  useEffect(() => {
    let alive = true;
    void loadLiveConfig().then((proxyUrl) => {
      if (!alive || !proxyUrl) return;
      setCfg({ proxyUrl, healthy: false });
      void proxyHealthy(proxyUrl).then((healthy) => { if (alive && healthy) setCfg({ proxyUrl, healthy }); });
    });
    return () => { alive = false; };
  }, []);
  return cfg;
}
