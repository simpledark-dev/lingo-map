'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // In dev, skip registering AND actively unregister any old worker
    // that's still alive in the browser from prior visits. Without
    // this, edits to /sw.js or APP_VERSION would silently keep
    // serving the stale cached bundle on localhost — which is exactly
    // what bit us when localhost showed "v0.1.0" while the source had
    // already moved past it. Production keeps the SW for offline
    // support and faster repeat visits.
    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const r of regs) r.unregister();
      }).catch(() => { /* registrations API may be locked down — ignore */ });
      return;
    }
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW registration failed — not critical for the app
    });
  }, []);

  return null;
}
