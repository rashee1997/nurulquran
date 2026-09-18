'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles, Send, Bot, User, BookOpen, RotateCcw } from 'lucide-react';
import { db } from '@/lib/db';
import Link from 'next/link';
import { Modal } from '@/components/system/Modal';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Marks a response that failed so it renders with a retry affordance. */
  failed?: boolean;
}

interface TutorPanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialPrompt?: string;
}

const CONNECTION_ERROR = 'Could not reach the assistant. Check your connection, or your API key in Settings.';

export const TutorPanel: React.FC<TutorPanelProps> = ({ isOpen, onClose, initialPrompt }) => {
  const [activeProviderName, setActiveProviderName] = useState('Google Gemini (Server Default)');
  const [providerConfig, setProviderConfig] = useState<{ type: string; apiKey?: string; baseUrl?: string; selectedModel?: string }>({
    type: 'gemini',
    selectedModel: 'gemini-2.5-flash',
  });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    async function loadConfig(): Promise<void> {
      if (typeof window !== 'undefined') {
        const prov = await db.aiProviders.filter((p) => p.isDefault).first();
        if (prov) {
          setActiveProviderName(prov.name);
          setProviderConfig({
            type: prov.type,
            baseUrl: prov.baseUrl,
            selectedModel: prov.selectedModel,
          });
        }
      }
    }
    void loadConfig();
  }, [isOpen]);

  const streamAssistantReply = useCallback(
    async (history: readonly ChatMessage[], assistantMsgId: string): Promise<void> => {
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: history.map((m) => ({ role: m.role, content: m.content })),
            providerConfig,
          }),
        });

        if (!res.ok || !res.body) {
          throw new Error('Failed to reach AI Tutor endpoint');
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          accumulated += chunk;
          setMessages((prev) => prev.map((m) => (m.id === assistantMsgId ? { ...m, content: accumulated } : m)));
        }
      } catch (err: unknown) {
        console.error('Tutor stream error:', err);
        setMessages((prev) => prev.map((m) => (m.id === assistantMsgId ? { ...m, content: CONNECTION_ERROR, failed: true } : m)));
      } finally {
        setIsLoading(false);
      }
    },
    [providerConfig]
  );

  const sendMessage = useCallback(
    async (userText: string): Promise<void> => {
      if (!userText.trim() || isLoading) return;
      const userMsg: ChatMessage = {
        id: `user_${Date.now()}`,
        role: 'user',
        content: userText.trim(),
      };
      const newMessages = [...messages, userMsg];
      setMessages(newMessages);
      setInput('');
      setIsLoading(true);

      const assistantMsgId = `assistant_${Date.now()}`;
      setMessages((prev) => [...prev, { id: assistantMsgId, role: 'assistant', content: '' }]);
      await streamAssistantReply(newMessages, assistantMsgId);
    },
    [isLoading, messages, streamAssistantReply]
  );

  /** Replays only the failed exchange instead of resending the whole transcript. */
  const retryLast = useCallback((): void => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    const cutoffIndex = lastAssistant ? messages.indexOf(lastAssistant) : messages.length;
    const history = messages.slice(0, cutoffIndex);
    setMessages((prev) => prev.filter((m) => !m.failed));
    setIsLoading(true);
    const assistantMsgId = `assistant_${Date.now()}`;
    setMessages((prev) => [...prev, { id: assistantMsgId, role: 'assistant', content: '' }]);
    void streamAssistantReply(history, assistantMsgId);
  }, [messages, streamAssistantReply]);

  // Handle initial prompt insertion if provided
  useEffect(() => {
    if (initialPrompt && isOpen) {
      const timer = setTimeout(() => {
        void sendMessage(initialPrompt);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [initialPrompt, isOpen, sendMessage]);

  // Scroll to bottom
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const quickPrompts = [
    'Explain the root of the second word in Surah Al-Fatihah',
    'What are the Tajweed rules in Surah Al-Ikhlas?',
    'Give me a Tamil explanation for Surah Al-Kawthar',
    'Quiz me on the meaning of short Surahs',
  ];

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      label="Study Assistant"
      variant="sheet-right"
      contentClassName="p-0"
    >
      <div id="ai-tutor-panel" className="flex flex-col h-full min-h-[60vh]">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-surface shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary-subtle flex items-center justify-center text-primary-strong">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">Study Assistant</h3>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" aria-hidden="true" />
                <span className="truncate max-w-[180px]">{activeProviderName}</span>
                <span aria-hidden="true">•</span>
                <Link href="/settings/ai" className="text-primary hover:underline">
                  Providers
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Messages area */}
        <div ref={chatContainerRef} className="flex-1 p-4 overflow-y-auto scroll-contained space-y-4" aria-live="polite">
          {messages.length === 0 && (
            <div className="text-center py-8 space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-primary-subtle mx-auto flex items-center justify-center text-primary-strong">
                <Bot className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-foreground">Assalamu Alaikum!</h4>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                  Ask about a verse, word root, Tajweed rule or Tamil meaning.
                </p>
              </div>

              <div className="space-y-2 pt-2">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Suggested Questions
                </span>
                <div className="flex flex-col gap-1.5">
                  {quickPrompts.map((qp, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => void sendMessage(qp)}
                      className="text-left text-xs p-2.5 rounded-xl bg-surface hover:bg-primary-subtle border border-border hover:border-primary/40 text-foreground transition-colors"
                    >
                      {qp}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <ul className="space-y-4 list-none" aria-label="Conversation">
            {messages.map((m) => (
              <li
                key={m.id}
                className={`flex gap-3 text-xs leading-relaxed ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {m.role !== 'user' && (
                  <div className="w-7 h-7 rounded-lg bg-primary-subtle flex items-center justify-center text-primary-strong shrink-0 mt-0.5">
                    <Bot className="w-4 h-4" aria-hidden="true" />
                  </div>
                )}

                <div
                  className={`rounded-2xl p-3.5 max-w-[85%] ${
                    m.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-tr-xs'
                      : 'bg-surface border border-border text-foreground rounded-tl-xs space-y-2'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{m.content}</div>
                  {m.failed && (
                    <button
                      type="button"
                      onClick={retryLast}
                      className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-danger-strong bg-danger-subtle border border-danger/30 rounded-lg px-2.5 py-1.5 hover:bg-danger/10 transition-colors"
                      aria-describedby={`tutor-error-${m.id}`}
                    >
                      <RotateCcw className="w-3 h-3" aria-hidden="true" /> Retry
                      <span id={`tutor-error-${m.id}`} className="sr-only">
                        The previous request failed. Retry sends the same question again.
                      </span>
                    </button>
                  )}
                </div>

                {m.role === 'user' && (
                  <div className="w-7 h-7 rounded-lg bg-surface-muted flex items-center justify-center text-foreground shrink-0 mt-0.5">
                    <User className="w-4 h-4" aria-hidden="true" />
                  </div>
                )}
              </li>
            ))}
          </ul>

          {isLoading && (
            <div className="flex gap-3 text-xs" role="status">
              <div className="w-7 h-7 rounded-lg bg-primary-subtle flex items-center justify-center text-primary-strong shrink-0">
                <Bot className="w-4 h-4" aria-hidden="true" />
              </div>
              <div className="p-3 bg-surface border border-border rounded-2xl rounded-tl-xs flex items-center gap-1.5 text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" aria-hidden="true" />
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:0.2s]" aria-hidden="true" />
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:0.4s]" aria-hidden="true" />
                <span className="ml-1 text-[11px]">Searching the Quran text…</span>
              </div>
            </div>
          )}
        </div>

        {/* Input bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendMessage(input);
          }}
          className="p-3 border-t border-border bg-card flex items-center gap-2 shrink-0"
        >
          <input
            id="tutor-prompt-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about verses, roots, Tajweed, or Tamil..."
            aria-label="Ask the study assistant"
            className="flex-1 bg-surface border border-border text-foreground text-xs px-3.5 py-2.5 rounded-xl outline-hidden placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            aria-label="Send message"
            className="p-2.5 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:pointer-events-none text-primary-foreground transition-colors shadow-xs"
          >
            <Send className="w-4 h-4" aria-hidden="true" />
          </button>
        </form>
        <div className="sr-only">
          <BookOpen aria-hidden="true" />
        </div>
      </div>
    </Modal>
  );
};
