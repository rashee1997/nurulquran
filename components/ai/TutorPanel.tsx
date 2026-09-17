'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Send, Bot, User, X, BookOpen, HelpCircle, ChevronDown, RotateCcw } from 'lucide-react';
import { db } from '@/lib/db';
import Link from 'next/link';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface TutorPanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialPrompt?: string;
}

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
    async function loadConfig() {
      if (typeof window !== 'undefined') {
        const prov = await db.aiProviders.filter(p => p.isDefault).first();
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
    loadConfig();
  }, [isOpen]);

  const sendMessage = React.useCallback(async (userText: string) => {
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
    setMessages(prev => [...prev, { id: assistantMsgId, role: 'assistant', content: '' }]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
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
        setMessages(prev =>
          prev.map(m => (m.id === assistantMsgId ? { ...m, content: accumulated } : m))
        );
      }
    } catch (err: unknown) {
      console.error('Tutor stream error:', err);
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantMsgId
            ? {
                ...m,
                content:
                  'Could not reach the assistant. Check your connection, or your API key in Settings.',
              }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, messages, providerConfig]);

  // Handle initial prompt insertion if provided
  useEffect(() => {
    if (initialPrompt && isOpen) {
      const timer = setTimeout(() => {
        sendMessage(initialPrompt);
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

  if (!isOpen) return null;

  const quickPrompts = [
    'Explain the root of the second word in Surah Al-Fatihah',
    'What are the Tajweed rules in Surah Al-Ikhlas?',
    'Give me a Tamil explanation for Surah Al-Kawthar',
    'Quiz me on the meaning of short Surahs',
  ];

  return (
    <div
      id="ai-tutor-panel"
      className="fixed inset-y-0 right-0 z-50 w-full sm:w-[440px] bg-card border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
    >
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between bg-surface">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary-subtle flex items-center justify-center text-primary-strong">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
              Study Assistant
            </h3>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span className="truncate max-w-[180px]">{activeProviderName}</span>
              <span>•</span>
              <Link href="/settings/ai" className="text-primary hover:underline">
                Providers
              </Link>
            </div>
          </div>
        </div>

        <button
          id="close-tutor-panel-btn"
          onClick={onClose}
          aria-label="Close Study Assistant"
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages area */}
      <div ref={chatContainerRef} className="flex-1 p-4 overflow-y-auto space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-8 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-primary-subtle mx-auto flex items-center justify-center text-primary-strong">
              <Bot className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-foreground">
                Assalamu Alaikum!
              </h4>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                Ask about a verse, word root, Tajweed rule or Tamil meaning.
              </p>
            </div>

            {/* Quick action chips */}
            <div className="space-y-2 pt-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                Suggested Questions
              </span>
              <div className="flex flex-col gap-1.5">
                {quickPrompts.map((qp, idx) => (
                  <button
                    key={idx}
                    onClick={() => sendMessage(qp)}
                    className="text-left text-xs p-2.5 rounded-xl bg-surface hover:bg-primary-subtle border border-border hover:border-primary/40 text-foreground transition-colors"
                  >
                    {qp}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex gap-3 text-xs leading-relaxed ${
              m.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {m.role !== 'user' && (
              <div className="w-7 h-7 rounded-lg bg-primary-subtle flex items-center justify-center text-primary-strong shrink-0 mt-0.5">
                <Bot className="w-4 h-4" />
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
            </div>

            {m.role === 'user' && (
              <div className="w-7 h-7 rounded-lg bg-surface-muted flex items-center justify-center text-foreground shrink-0 mt-0.5">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3 text-xs">
            <div className="w-7 h-7 rounded-lg bg-primary-subtle flex items-center justify-center text-primary-strong shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="p-3 bg-surface border border-border rounded-2xl rounded-tl-xs flex items-center gap-1.5 text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" />
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:0.4s]" />
              <span className="ml-1 text-[11px]">Searching the Quran text…</span>
            </div>
          </div>
        )}
      </div>

      {/* Input bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(input);
        }}
        className="p-3 border-t border-border bg-card flex items-center gap-2"
      >
        <input
          id="tutor-prompt-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about verses, roots, Tajweed, or Tamil..."
          className="flex-1 bg-surface border border-border text-foreground text-xs px-3.5 py-2.5 rounded-xl outline-hidden focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          className="p-2.5 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:pointer-events-none text-primary-foreground transition-colors shadow-xs"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
