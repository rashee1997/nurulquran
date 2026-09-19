'use client';

/**
 * Service worker registration and the install-prompt bridge.
 *
 * `beforeinstallprompt` fires once, early, and only if the browser has not already
 * decided to show its own install UI — missing that event means there is nothing to
 * show later, so it is captured at module scope (before any component mounts) and
 * handed out through `getInstallPrompt`/`subscribeToInstallability`.
 */

/*
 * Unassertable browser-capability boundaries, quarantined in this one file.
 *
 * `BeforeInstallPromptEvent` is a non-standard Chromium event (no DOM lib declares it), and
 * `navigator.standalone` is an iOS-Safari-only property. Both are runtime-only shapes that
 * TypeScript cannot be told about without structural lying, so each is narrowed behind a
 * dedicated adapter with a runtime check rather than an inline cast at a call site.
 */

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<(installable: boolean) => void>();

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Runtime narrowing: only a real install prompt is accepted, anything else is dropped. */
function asInstallPromptEvent(event: Event): BeforeInstallPromptEvent | null {
  const candidate = event as Partial<BeforeInstallPromptEvent>;
  return typeof candidate.prompt === 'function' && candidate.userChoice instanceof Promise
    ? (candidate as BeforeInstallPromptEvent)
    : null;
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = asInstallPromptEvent(event);
    for (const listener of installListeners) listener(true);
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    for (const listener of installListeners) listener(false);
  });
}

export function isInstallable(): boolean {
  return deferredPrompt !== null;
}

export function subscribeToInstallability(listener: (installable: boolean) => void): () => void {
  installListeners.add(listener);
  return () => installListeners.delete(listener);
}

/** Shows the native install prompt. Resolves to whether the user accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  await deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  for (const listener of installListeners) listener(false);
  return outcome === 'accepted';
}

/** True once the app is running as an installed PWA (standalone display mode). */
export function isRunningStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  // iOS Safari exposes no display-mode query that matches; `navigator.standalone` is the only
  // signal, and it is not in any DOM lib — see the quarantine note at the top of this file.
  const iosStandalone = (navigator as { standalone?: boolean }).standalone;
  return iosStandalone === true;
}

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

/** Registers the service worker once. Safe to call from multiple components. */
export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return Promise.resolve(null);
  }
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      console.warn('Service worker registration failed:', error);
      return null;
    });
  }
  return registrationPromise;
}

let requestCounter = 0;
export function nextRequestId(): string {
  requestCounter += 1;
  return `dl-${Date.now()}-${requestCounter}`;
}

export interface DownloadProgressHandlers {
  onProgress?: (done: number, total: number) => void;
  onComplete?: () => void;
}

/**
 * Upper bound on a cache-warming run.
 *
 * The reply is the only thing that resolves the promise below, and a service worker can be
 * reclaimed by the browser mid-run — after which no `download-complete` ever arrives. Without a
 * bound the caller awaited forever and its `message` listener stayed subscribed, so a learner whose
 * download was interrupted by a browser restart saw a progress bar that never finished.
 */
const DOWNLOAD_REPLY_TIMEOUT_MS = 5 * 60_000;

/** Posts a cache-warming request to the active service worker and reports progress. */
export async function cacheUrlsViaServiceWorker(
  cacheName: 'audio' | 'scripture',
  urls: readonly string[],
  handlers: DownloadProgressHandlers = {}
): Promise<void> {
  const registration = await registerServiceWorker();
  const controller = navigator.serviceWorker?.controller;
  if (!registration || !controller) {
    // No active service worker (e.g. first load before it takes control): nothing to warm,
    // but this is not an error — the app still works online.
    handlers.onComplete?.();
    return;
  }

  const requestId = nextRequestId();
  await new Promise<void>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    /** Settles exactly once, releasing both the timer and the listener on every path. */
    const finish = (): void => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      navigator.serviceWorker.removeEventListener('message', onMessage);
      handlers.onComplete?.();
      resolve();
    };

    const onMessage = (event: MessageEvent): void => {
      const data = event.data as { type?: string; requestId?: string; done?: number; total?: number } | undefined;
      if (!data || data.requestId !== requestId) return;
      if (data.type === 'download-progress' && typeof data.done === 'number' && typeof data.total === 'number') {
        handlers.onProgress?.(data.done, data.total);
      }
      if (data.type === 'download-complete') finish();
    };

    timer = setTimeout(finish, DOWNLOAD_REPLY_TIMEOUT_MS);
    navigator.serviceWorker.addEventListener('message', onMessage);
    controller.postMessage({ type: 'cache-urls', cacheName, urls, requestId });
  });
}

/** Evicts URLs from a service-worker cache. */
export async function evictUrlsViaServiceWorker(cacheName: 'audio' | 'scripture', urls: readonly string[]): Promise<void> {
  await registerServiceWorker();
  navigator.serviceWorker?.controller?.postMessage({ type: 'evict', cacheName, urls });
}
