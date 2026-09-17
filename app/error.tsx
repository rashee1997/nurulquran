'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';

interface AppErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Segment-level error boundary.
 *
 * Without this, a thrown error inside any route replaced the entire app with Next's
 * default screen — including the reader, where a single failed network fetch used to
 * take the whole page down with no way back.
 */
export default function AppError({ error, reset }: AppErrorProps) {
  useEffect(() => {
    console.error('Unhandled route error:', error);
  }, [error]);

  return (
    <div className="max-w-xl mx-auto my-16 p-8 rounded-3xl bg-card border border-border text-center space-y-4 shadow-lg">
      <AlertTriangle className="w-9 h-9 mx-auto text-warning" aria-hidden="true" />

      <div className="space-y-1.5">
        <h1 className="text-xl font-bold text-foreground">Something went wrong on this page</h1>
        <p className="text-sm text-muted-foreground">
          Your saved progress is stored on this device and has not been affected. You can retry this
          page, or continue from the dashboard.
        </p>
      </div>

      {error.digest && (
        <p className="text-[11px] font-mono text-muted-foreground">Reference: {error.digest}</p>
      )}

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
        <button
          type="button"
          onClick={reset}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold shadow-md active:scale-95 transition-all"
        >
          <RotateCcw className="w-4 h-4" aria-hidden="true" />
          <span>Try again</span>
        </button>

        <Link
          href="/dashboard"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-surface border border-border hover:bg-surface-hover text-foreground text-xs font-bold transition-colors"
        >
          <Home className="w-4 h-4" aria-hidden="true" />
          <span>Back to dashboard</span>
        </Link>
      </div>
    </div>
  );
}
