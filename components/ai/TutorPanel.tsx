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
                  'Bismillah. I encountered an issue connecting to the AI model. Please verify your connection or BYOK API key in Settings.',
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
      className="fixed inset-y-0 right-0 z-50 w-full sm:w-[440px] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
    >
      {/* Header */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              NurulQuran AI Tutor
            </h3>
            <div className="flex items-center gap-1 text-[10px] text-slate-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="truncate max-w-[180px]">{activeProviderName}</span>
              <span>•</span>
              <Link href="/settings/ai" className="text-emerald-600 hover:underline">
                BYOK
              </Link>
            </div>
          </div>
        </div>

        <button
          id="close-tutor-panel-btn"
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages area */}
      <div ref={chatContainerRef} className="flex-1 p-4 overflow-y-auto space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-8 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950 mx-auto flex items-center justify-center text-emerald-600">
              <Bot className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                Assalamu Alaikum!
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                I am your scholarly Quran & Arabic tutor. I verify every verse and word root deterministically from authentic sources.
              </p>
            </div>

            {/* Quick action chips */}
            <div className="space-y-2 pt-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Suggested Questions
              </span>
              <div className="flex flex-col gap-1.5">
                {quickPrompts.map((qp, idx) => (
                  <button
                    key={idx}
                    onClick={() => sendMessage(qp)}
                    className="text-left text-xs p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
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
              <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-600 shrink-0 mt-0.5">
                <Bot className="w-4 h-4" />
              </div>
            )}

            <div
              className={`rounded-2xl p-3.5 max-w-[85%] ${
                m.role === 'user'
                  ? 'bg-emerald-600 text-white rounded-tr-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-xs space-y-2'
              }`}
            >
              <div className="whitespace-pre-wrap">{m.content}</div>
            </div>

            {m.role === 'user' && (
              <div className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 shrink-0 mt-0.5">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3 text-xs">
            <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-600 shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl rounded-tl-xs flex items-center gap-1.5 text-slate-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" />
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:0.4s]" />
              <span className="ml-1 text-[11px]">Consulting authentic Quran data...</span>
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
        className="p-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2"
      >
        <input
          id="tutor-prompt-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about verses, roots, Tajweed, or Tamil..."
          className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs px-3.5 py-2.5 rounded-xl outline-hidden focus:ring-2 focus:ring-emerald-500 placeholder:text-slate-400"
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:pointer-events-none text-white transition-colors shadow-xs"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
