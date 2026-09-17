import React from 'react';

interface RouteSkeletonProps {
  /** Accessible description of what is loading. */
  label: string;
  /** Number of content rows to sketch out. */
  rows?: number;
  /** Renders the wide chapter banner used by the reader routes. */
  withBanner?: boolean;
}

/**
 * Route-level loading placeholder.
 *
 * Skeletons mirror the real layout (banner, ayah cards) so the first paint does not
 * jump when the content arrives, and the whole thing is hidden from assistive tech
 * behind a single polite status message.
 */
export function RouteSkeleton({ label, rows = 4, withBanner = false }: RouteSkeletonProps) {
  return (
    <div className="max-w-3xl mx-auto w-full space-y-4" aria-busy="true">
      <p role="status" className="sr-only">
        {label}
      </p>

      {withBanner && (
        <div className="w-full rounded-3xl border border-border bg-surface-muted h-48 animate-pulse" />
      )}

      <div className="space-y-4">
        {Array.from({ length: rows }).map((_, index) => (
          <div
            key={index}
            className="p-5 rounded-2xl border border-border bg-card space-y-4"
            aria-hidden="true"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-surface-muted animate-pulse" />
              <div className="h-3 w-24 rounded-full bg-surface-muted animate-pulse" />
            </div>
            <div className="h-6 w-full rounded-lg bg-surface-muted animate-pulse" />
            <div className="h-6 w-4/5 rounded-lg bg-surface-muted animate-pulse ml-auto" />
            <div className="h-3 w-3/4 rounded-full bg-surface-muted animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
