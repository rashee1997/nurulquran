'use client';

import React, { useCallback, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * How many modals are currently open, and the body overflow to restore once none are.
 *
 * Module scope, because the lock belongs to the document rather than to any one dialog.
 */
let openModalCount = 0;
let savedBodyOverflow = '';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name of the dialog; announced when it opens. */
  label: string;
  /** Rendered inside the header next to the label; leave undefined for a plain title. */
  title?: React.ReactNode;
  children: React.ReactNode;
  /** Sheet variant: docks to the viewport edge (used by drawers and the reader's Tafseer sheet). */
  variant?: 'centered' | 'sheet-right' | 'sheet-bottom';
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
  /** Set only when this dialog renders its own heading, which is then its accessible name. */
  const labelledBy = title !== undefined && !hideHeader ? titleId : undefined;

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

    /*
     * Scroll lock is reference-counted across every open modal.
     *
     * Each modal used to save and restore `body.style.overflow` independently. With two dialogs
     * open at once — the command palette opening a confirm sheet, the reader's Tafseer sheet over
     * a drawer — unwinding them out of order restored the wrong value, and closing the outer one
     * first left the page permanently unscrollable. The count makes the lock release exactly when
     * the last dialog goes away.
     */
    if (openModalCount === 0) {
      savedBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    openModalCount += 1;

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

      openModalCount = Math.max(0, openModalCount - 1);
      if (openModalCount === 0) {
        document.body.style.overflow = savedBodyOverflow;
        savedBodyOverflow = '';
      }

      restoreFocusRef.current?.focus?.();
    };
  }, [open, onClose, getFocusable]);

  if (!open || typeof document === 'undefined') return null;

  const position =
    variant === 'sheet-right'
      ? 'fixed inset-y-0 right-0 h-full w-full sm:w-[440px] max-h-none rounded-none rounded-l-2xl border-l animate-in slide-in-from-right duration-200'
      : variant === 'sheet-bottom'
        ? // Bottom sheet: full width and edge-docked on small screens, a centred dialog from
          // `sm` up, where a bottom sheet would waste vertical space. One entrance animation is
          // used at every width — stacking a second `animate-in` at `sm` would leave two
          // competing sets of enter variables on the same element. It is a transform/opacity
          // animation, so it stays on the compositor.
          'relative w-full max-h-[92vh] rounded-t-3xl border-t animate-in slide-in-from-bottom duration-200 sm:max-w-5xl sm:rounded-2xl sm:border'
        : 'relative w-full max-w-lg max-h-[85vh] rounded-2xl animate-in fade-in zoom-in-95 duration-200';

  return createPortal(
    <div
      className={`fixed inset-0 z-100 flex bg-black/40 backdrop-blur-xs animate-in fade-in duration-150 ${
        variant === 'sheet-right'
          ? 'justify-end p-0'
          : variant === 'sheet-bottom'
            ? 'items-end justify-center p-0 sm:items-center sm:p-4'
            : 'items-center justify-center p-4'
      }`}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        // Never both: `aria-labelledby` wins and an accompanying `aria-label` is invalid, so the
        // name is supplied by exactly one of them.
        aria-label={labelledBy ? undefined : label}
        aria-labelledby={labelledBy}
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
