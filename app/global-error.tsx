'use client';

import React, { useEffect } from 'react';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Root fallback for errors thrown by the root layout itself. It must render its own
 * `<html>`/`<body>` because it replaces the whole document tree.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error('Root layout error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          background: '#f8faf8',
          color: '#111a15',
          padding: '24px',
        }}
      >
        <div style={{ maxWidth: '32rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            NurulQuran could not start
          </h1>
          <p style={{ fontSize: '0.875rem', lineHeight: 1.6, color: '#52665a' }}>
            The app failed while loading its shell. Your saved progress on this device is unaffected.
          </p>
          {error.digest && (
            <p style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: '#52665a' }}>
              Reference: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '1.25rem',
              padding: '0.65rem 1.25rem',
              borderRadius: '0.75rem',
              border: 'none',
              background: '#059669',
              color: '#ffffff',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
