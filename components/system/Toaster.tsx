'use client';

import React, { useSyncExternalStore } from 'react';
import { Check, AlertCircle, Info, X } from 'lucide-react';
import { dismissToast, getToasts, subscribeToToasts, type ToastTone } from '@/lib/ui/toast';

/**
 * Renders the toast stack.
 *
 * It is mounted once in the root layout, so a save made anywhere in the app — the reader's
 * preferences panel, the reciter picker, the settings form — reports its result through the same
 * surface instead of each screen inventing its own badge.
 *
 * The stack sits below the header and above the sticky recitation player (`AudioBar` sits at the
 * bottom of the viewport), which is why it is anchored top-right: a bottom-centred toast would be
 * covered by the player on a phone.
 */

const TONE_CLASS: Record<ToastTone, string> = {
  success: 'bg-success-subtle border-success/40 text-success-strong',
  error: 'bg-danger-subtle border-danger/40 text-danger-strong',
  info: 'bg-info-subtle border-info/40 text-info-strong',
};

const TONE_ICON: Record<ToastTone, React.ElementType> = {
  success: Check,
  error: AlertCircle,
  info: Info,
};

export const Toaster: React.FC = () => {
  const toasts = useSyncExternalStore(subscribeToToasts, getToasts, getToasts);
  if (toasts.length === 0) return null;

  return (
    <div
      id="toaster"
      role="status"
      aria-live="polite"
      className="fixed top-20 right-3 sm:right-6 z-[60] flex flex-col items-stretch gap-2 w-[min(20rem,calc(100vw-1.5rem))] pointer-events-none"
    >
      {toasts.map((toast) => {
        const Icon = TONE_ICON[toast.tone];
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-2 rounded-xl border px-3 py-2.5 shadow-lg backdrop-blur-md animate-in slide-in-from-top-2 fade-in duration-200 ${TONE_CLASS[toast.tone]}`}
          >
            <Icon className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span className="flex-1 text-xs font-semibold leading-snug">{toast.message}</span>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="shrink-0 p-0.5 rounded-md opacity-70 hover:opacity-100 transition-opacity"
              aria-label="Dismiss message"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
