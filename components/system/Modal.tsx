'use client';

import React, { useCallback, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name of the dialog; announced when it opens. */
  label: string;
  /** Rendered inside the header next to the label; leave undefined for a plain title. */
  title?: React.ReactNode;
  children: React.ReactNode;
  /** Sheet variant: docks to the viewport edge (used by drawers). */
  variant?: 'centered' | 'sheet-right';
  /** Hide the built-in header (custom header inside content). */
  hideHeader?: boolean;
  /** Extra class on the scrollable content pane. */
  contentClassName?: string;
}

/**
 * Accessible modal dialog primitive.
 *
 * Implements the WAI-ARIA dialog pattern as used by Radix: portal to `document.body`,
 * `role="dialog"` + `aria-modal`, focus moved into the dialog on open and restored to
 * the previously focused element on close, Tab cycling trapped inside while open,
 * Esc closes, and background scroll is locked. Every overlay surface in the app
 * (achievements, tutor, palette-style sheets, replay drawer) renders through this so
 * none of them can silently skip focus management again.
 */
export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  label,
  title,
  children,
  variant = 'centered',
  hideHeader = false,
  contentClassName = '',
}) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  /** Element to restore focus to when the dialog closes. */
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  const getFocusable = useCallback((root: HTMLElement): HTMLElement[] => {
    const nodes = root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    return Array.from(nodes).filter((el) => el.offsetParent !== null || el === document.activeElement);
  }, []);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    // Move focus in on the next frame so the portal content is mounted.
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const close = panel.querySelector<HTMLElement>('[data-modal-close]');
      (close ?? panel).focus();
    });

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = getFocusable(panel);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, [open, onClose, getFocusable]);

  if (!open || typeof document === 'undefined') return null;

  const position =
    variant === 'sheet-right'
      ? 'fixed inset-y-0 right-0 h-full w-full sm:w-[440px] max-h-none rounded-none rounded-l-2xl border-l animate-in slide-in-from-right duration-200'
      : 'relative w-full max-w-lg max-h-[85vh] rounded-2xl animate-in fade-in zoom-in-95 duration-200';

  return createPortal(
    <div
      className={`fixed inset-0 z-100 flex bg-black/40 backdrop-blur-xs animate-in fade-in duration-150 ${
        variant === 'sheet-right' ? 'justify-end p-0' : 'items-center justify-center p-4'
      }`}
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-labelledby={title !== undefined && !hideHeader ? titleId : undefined}
        tabIndex={-1}
        className={`flex flex-col overflow-hidden bg-card border border-border shadow-2xl outline-hidden ${position}`}
        onClick={(event) => event.stopPropagation()}
      >
        {!hideHeader && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-surface shrink-0">
            <h2 id={titleId} className="text-base font-bold text-foreground">
              {title ?? label}
            </h2>
            <button
              type="button"
              data-modal-close
              onClick={onClose}
              aria-label={`Close ${label}`}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        )}
        <div className={`flex-1 overflow-y-auto scroll-contained ${contentClassName}`}>{children}</div>
      </div>
    </div>,
    document.body
  );
};
