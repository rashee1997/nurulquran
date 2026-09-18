/**
 * Tiny toast store.
 *
 * The app reported saves in three different ways before this existed: a local "saved" badge
 * inside one settings card, a green panel that only the backup controls could use, and — for the
 * reader's own preferences and the reciter picker — nothing at all, so a setting could be applied
 * with no confirmation that it had been written. One store now backs every confirmation and
 * failure message.
 *
 * Deliberately plain: a module-level list with an external-store subscription, so any component
 * (including one that is not inside a provider) can report a result with a single function call,
 * and `useSyncExternalStore` re-renders only the toaster. Toasts are ephemeral UI, so nothing here
 * touches storage or telemetry.
 */

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

/** How long a toast stays before it slides away on its own. */
const DEFAULT_TTL_MS = 2600;
/** Failures matter more than confirmations, so they linger. */
const ERROR_TTL_MS = 5000;

let toasts: readonly Toast[] = [];
const listeners = new Set<(next: readonly Toast[]) => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();
let nextId = 1;

function emit(): void {
  for (const listener of listeners) listener(toasts);
}

function clearTimer(id: number): void {
  const timer = timers.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    timers.delete(id);
  }
}

/** Removes one toast, if it is still on screen. */
export function dismissToast(id: number): void {
  clearTimer(id);
  if (!toasts.some((toast) => toast.id === id)) return;
  toasts = toasts.filter((toast) => toast.id !== id);
  emit();
}

/**
 * Shows a message and returns its id.
 *
 * Repeating a message that is already on screen resets its timer instead of stacking a duplicate:
 * dragging the font-size slider settles into one write, and toggling the same switch twice should
 * not build a column of identical toasts.
 */
export function showToast(message: string, tone: ToastTone = 'success', ttlMs?: number): number {
  const ttl = ttlMs ?? (tone === 'error' ? ERROR_TTL_MS : DEFAULT_TTL_MS);
  const existing = toasts.find((toast) => toast.message === message && toast.tone === tone);
  if (existing) {
    clearTimer(existing.id);
    timers.set(
      existing.id,
      setTimeout(() => dismissToast(existing.id), ttl)
    );
    return existing.id;
  }

  const id = nextId++;
  toasts = [...toasts, { id, tone, message }];
  emit();
  timers.set(
    id,
    setTimeout(() => dismissToast(id), ttl)
  );
  return id;
}

/** Current toasts, newest last. Stable identity until the list actually changes. */
export function getToasts(): readonly Toast[] {
  return toasts;
}

/** Subscribes to the toast list; returns the unsubscribe function. */
export function subscribeToToasts(listener: (next: readonly Toast[]) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
