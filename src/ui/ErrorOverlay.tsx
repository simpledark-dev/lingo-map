'use client';

import { useEffect, useState } from 'react';

// Catches uncaught runtime errors and unhandled promise rejections,
// then displays them as a full-screen overlay. The point: on an iPhone
// with no Mac nearby, a black screen tells you nothing — this lets the
// device itself show the JS error so we can diagnose iOS-Safari-only
// failures (PixiJS worker init, OffscreenCanvas missing, WebGL2 quirk,
// etc.) without remote-debugging.
export function ErrorOverlay() {
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const append = (msg: string) => {
      setErrors((prev) => (prev.length >= 6 ? prev : [...prev, msg]));
    };
    const onError = (e: ErrorEvent) => {
      const where = e.filename ? ` @ ${e.filename}:${e.lineno}:${e.colno}` : '';
      append(`Error: ${e.message}${where}`);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      const msg = reason instanceof Error
        ? `${reason.name}: ${reason.message}\n${reason.stack ?? ''}`
        : typeof reason === 'string' ? reason : JSON.stringify(reason);
      append(`Unhandled rejection: ${msg}`);
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  if (errors.length === 0) return null;
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(20, 0, 0, 0.95)',
        color: '#ffb4b4',
        fontFamily: 'monospace',
        fontSize: 11,
        padding: 16,
        overflowY: 'auto',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        WebkitUserSelect: 'text',
        userSelect: 'text',
      }}
    >
      <div style={{ fontSize: 14, marginBottom: 8, color: '#ffeaea' }}>
        Runtime error ({errors.length})
      </div>
      {errors.map((e, i) => (
        <div
          key={i}
          style={{
            marginBottom: 12,
            paddingBottom: 8,
            borderBottom: '1px solid rgba(255,180,180,0.2)',
          }}
        >
          {e}
        </div>
      ))}
      <div style={{ fontSize: 10, opacity: 0.6, marginTop: 12 }}>
        Tap-and-hold to copy. Send these to me.
      </div>
    </div>
  );
}
