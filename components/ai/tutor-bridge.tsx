'use client';

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

interface AiTutorContextValue {
  /** Whether the Study Assistant drawer is currently open. */
  isOpen: boolean;
  /**
   * Prompt queued for auto-submit the next time the drawer opens. Consumed once by the
   * panel, so a repeated click on the same ayah still re-triggers the message.
   */
  queuedPrompt: string | null;
  /** Opens the drawer; with a prompt, queues it for auto-submit. */
  open: (prompt?: string) => void;
  close: () => void;
  /** Marks the queued prompt consumed so a close/reopen does not resend it. */
  consumePrompt: () => void;
}

const AiTutorContext = createContext<AiTutorContextValue | null>(null);

/**
 * Reader → assistant bridge.
 *
 * The Study Assistant drawer lives in the app-wide `NavigationHeader`, while its trigger
 * lives on pages it does not own (the Quran reader, the memorize planner). A React context
 * is the smallest shared state that keeps one drawer instance for the whole app without a
 * global event bus: `open()` from anywhere sets the prompt and flips the flag, the header's
 * panel consumes it, and every other page simply calls `useAiTutor().open(prompt)`.
 */
export const AiTutorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [queuedPrompt, setQueuedPrompt] = useState<string | null>(null);
  // Monotonic key so a second click with the *same* prompt re-fires the consume effect.
  const promptKeyRef = useRef(0);
  const [promptKey, setPromptKey] = useState(0);

  const open = useCallback((prompt?: string): void => {
    if (prompt && prompt.trim().length > 0) {
      promptKeyRef.current += 1;
      setPromptKey(promptKeyRef.current);
      setQueuedPrompt(prompt.trim());
    }
    setIsOpen(true);
  }, []);

  const close = useCallback((): void => setIsOpen(false), []);

  const consumePrompt = useCallback((): void => setQueuedPrompt(null), []);

  const value = useMemo<AiTutorContextValue>(
    () => ({ isOpen, queuedPrompt, promptKey, open, close, consumePrompt }),
    [isOpen, queuedPrompt, promptKey, open, close, consumePrompt]
  );

  return <AiTutorContext.Provider value={value}>{children}</AiTutorContext.Provider>;
};

export function useAiTutor(): AiTutorContextValue {
  const context = useContext(AiTutorContext);
  if (!context) {
    throw new Error('useAiTutor must be used within an AiTutorProvider.');
  }
  return context;
}
