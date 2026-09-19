import * as React from 'react';

const MOBILE_BREAKPOINT = 768;

/**
 * Viewport-width media query, evaluated as an external store.
 *
 * The previous implementation read `window.innerWidth` in the `useState` initializer. React runs
 * that initializer again during hydration, so a mobile client computed `true` on its first client
 * render while the server HTML had been rendered with `false` — a hydration mismatch on any
 * subtree whose output depends on this hook. `useSyncExternalStore` avoids that by construction:
 * the server snapshot is a definite `false`, and the real value is only read once the store is
 * subscribed on the client.
 *
 * `(max-width: 767px)` is exactly equivalent to `innerWidth < 768`.
 */
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function query(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(QUERY);
}

function subscribe(callback: () => void): () => void {
  const mql = query();
  if (!mql) return () => {};
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function getSnapshot(): boolean {
  return query()?.matches ?? false;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useIsMobile(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
