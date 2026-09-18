import React from 'react';
import { Loader2, AlertCircle, SearchX, WifiOff, RotateCcw } from 'lucide-react';

type StatePanelVariant = 'loading' | 'empty' | 'offline' | 'error';

interface StatePanelProps {
  variant: StatePanelVariant;
  /** Primary sentence describing the state. */
  title: string;
  /** One line of guidance under the title. */
  description?: string;
  /** Primary action label; renders a real button when provided. */
  actionLabel?: string;
  onAction?: () => void;
  /** Fallback content height so the parent reserves space (CLS < 0.1). */
  minHeight?: string;
  className?: string;
}

const VARIANT_META: Record<StatePanelVariant, { icon: React.ElementType; tone: string; live: 'polite' | 'assertive' }> = {
  loading: { icon: Loader2, tone: 'text-primary', live: 'polite' },
  empty: { icon: SearchX, tone: 'text-muted-foreground', live: 'polite' },
  offline: { icon: WifiOff, tone: 'text-warning-strong', live: 'assertive' },
  error: { icon: AlertCircle, tone: 'text-danger-strong', live: 'assertive' },
};

/**
 * Unified empty / loading / offline / error surface.
 *
 * Offline-first products fail in ways a bare "No matches" string cannot explain. This
 * primitive gives every async surface one vocabulary: a reserved-height region (no layout
 * shift when content resolves), a status role so assistive tech hears the state change,
 * and a real focusable action when there is something to do about it.
 */
export function StatePanel({
  variant,
  title,
  description,
  actionLabel,
  onAction,
  minHeight = 'min-h-[12rem]',
  className = '',
}: StatePanelProps): React.JSX.Element {
  const { icon: Icon, tone, live } = VARIANT_META[variant];
  const isLoading = variant === 'loading';

  return (
    <div
      role="status"
      aria-live={live}
      aria-busy={isLoading}
      className={`flex flex-col items-center justify-center text-center gap-2 px-6 py-10 rounded-2xl border border-border bg-surface ${minHeight} ${className}`}
    >
      <Icon
        className={`w-8 h-8 ${tone} ${isLoading ? 'animate-spin' : ''}`}
        aria-hidden="true"
      />
      <p className="text-sm font-bold text-foreground">{title}</p>
      {description && <p className="text-xs text-muted-foreground max-w-xs">{description}</p>}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold shadow-md transition-colors"
        >
          {!isLoading && variant !== 'empty' && <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />}
          {actionLabel}
        </button>
      )}
    </div>
  );
}
