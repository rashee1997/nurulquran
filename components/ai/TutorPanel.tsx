'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, isToolUIPart, type UIMessage } from 'ai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Sparkles, Send, Bot, User, BookOpen, RotateCcw, Languages } from 'lucide-react';
import { db } from '@/lib/db';
import Link from 'next/link';
import { Modal } from '@/components/system/Modal';
import { VerseCard, WordAnalysisCard } from './ToolInvocationCards';

/**
 * Narrow, provider-agnostic shape of a finished tool invocation part. The AI SDK's
 * `ToolUIPart` output type is per-tool; rendering only needs the input and the result
 * record, both validated defensively below.
 */
interface InvocationView {
  toolName: string;
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Extracts renderable invocations from a message, preserving stream order. */
function collectInvocations(message: UIMessage): InvocationView[] {
  const invocations: InvocationView[] = [];
  for (const part of message.parts) {
    if (!isToolUIPart(part)) continue;
    const input = asRecord(part.input) ?? {};
    const result = part.state === 'output-available' ? asRecord(part.output) : null;
    invocations.push({ toolName: getToolName(part), input, result });
  }
  return invocations;
}

function getToolName(part: unknown): string {
  const record = asRecord(part);
  const type = typeof record?.type === 'string' ? record.type : '';
  if (type.startsWith('tool-')) return type.slice('tool-'.length);
  if (type === 'dynamic-tool' && typeof record?.toolName === 'string') return record.toolName;
  return 'tool';
}

/** True while a tool call is still being streamed or executed. */
function isPendingInvocation(invocation: InvocationView): boolean {
  return invocation.result === null;
}

/** A quoted scholar statement renders as a blockquote; keep Arabic right-aligned. */
function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground prose-blockquote:border-primary prose-blockquote:text-muted-foreground prose-table:text-xs">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Arabic needs explicit direction so mixed English/Tamil paragraphs stay LTR.
          p: ({ children }) => <p dir="auto">{children}</p>,
          table: ({ children }) => (
            <div className="overflow-x-auto my-2">
              <table className="min-w-full border border-border rounded-lg overflow-hidden">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="bg-muted px-2.5 py-1.5 text-left text-[11px] font-bold uppercase tracking-wide border-b border-border">
              {children}
            </th>
          ),
          td: ({ children }) => <td className="px-2.5 py-1.5 border-b border-border align-top">{children}</td>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

type LanguageToggle = 'both' | 'en' | 'ta';

const LANGUAGE_LABELS: Record<LanguageToggle, string> = {
  both: 'EN + தமிழ்',
  en: 'English',
  ta: 'தமிழ்',
};

const LANGUAGE_INSTRUCTION: Record<LanguageToggle, string> = {
  both: '',
  en: '\n\n(The learner selected English only. Write explanations in English; keep Arabic and the Tamil translation of the scripture itself, but no Tamil commentary.)',
  ta: '\n\n(The learner selected Tamil only. Write explanations in idiomatic Tamil; keep the Arabic and the English translation of the scripture itself, but no English commentary.)',
};

interface TutorPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const CONNECTION_ERROR = 'Could not reach the assistant. Check your connection, or your API key in Settings.';

export const TutorPanel: React.FC<TutorPanelProps> = ({ isOpen, onClose }) => {
  const [activeProviderName, setActiveProviderName] = useState('Google Gemini (Server Default)');
  const [providerConfig, setProviderConfig] = useState<{ type: string; apiKey?: string; baseUrl?: string; selectedModel?: string }>({
    type: 'gemini',
    selectedModel: 'gemini-2.5-flash',
  });
  const [language, setLanguage] = useState<LanguageToggle>('both');
  const [draft, setDraft] = useState('');

  const chatContainerRef = useRef<HTMLDivElement | null>(null);

  const transportHeaders = useMemo(() => ({ 'Content-Type': 'application/json' }), []);

  const { messages, sendMessage, status, error, setMessages, stop } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      headers: transportHeaders,
      body: { providerConfig },
    }),
  });

  const isLoading = status === 'submitted' || status === 'streaming';

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

  // Scroll to bottom as messages stream in.
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const submit = (text: string): void => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    setDraft('');
    void sendMessage({ text: trimmed + LANGUAGE_INSTRUCTION[language] });
  };

  const retryLast = (): void => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    const cutoff = messages.indexOf(lastUser);
    setMessages(messages.slice(0, cutoff));
    void sendMessage({ text: extractText(lastUser) });
  };

  const quickPrompts = [
    'Explain the tafseer and context of Surah Al-Fatihah, Ayah 1',
    'What are the Tajweed rules in Surah Al-Ikhlas?',
    'Give me a Tamil explanation for Surah Al-Kawthar',
    'Break down the root words of Ayat al-Kursi (2:255)',
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
        <div className="p-4 border-b border-border flex items-center justify-between gap-2 bg-surface shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-primary-subtle flex items-center justify-center text-primary-strong shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-foreground">Study Assistant</h3>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" aria-hidden="true" />
                <span className="truncate max-w-[140px]">{activeProviderName}</span>
                <span aria-hidden="true">•</span>
                <Link href="/settings/ai" className="text-primary hover:underline">
                  Providers
                </Link>
              </div>
            </div>
          </div>

          {/* Language quick-toggle */}
          <div
            className="flex items-center rounded-xl border border-border bg-card p-0.5 shrink-0"
            role="group"
            aria-label="Feedback language"
          >
            <Languages className="w-3.5 h-3.5 text-muted-foreground mx-1" aria-hidden="true" />
            {(['both', 'en', 'ta'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setLanguage(option)}
                aria-pressed={language === option}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                  language === option
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {LANGUAGE_LABELS[option]}
              </button>
            ))}
          </div>
        </div>

        {/* Messages area */}
        <div ref={chatContainerRef} className="flex-1 p-4 overflow-y-auto scroll-contained space-y-4" aria-live="polite">
          {messages.length === 0 && !error && (
            <div className="text-center py-8 space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-primary-subtle mx-auto flex items-center justify-center text-primary-strong">
                <Bot className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-foreground">Assalamu Alaikum!</h4>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                  Ask about a verse, its tafseer, a word root, Tajweed rule or Tamil meaning. Every
                  scripture and commentary answer is retrieved from verified sources.
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
                      onClick={() => submit(qp)}
                      className="text-left text-xs p-2.5 rounded-xl bg-surface hover:bg-primary-subtle border border-border hover:border-primary/40 text-foreground transition-colors"
                    >
                      {qp}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-danger-subtle border border-danger/30 text-xs text-danger-strong space-y-2">
              <p>{CONNECTION_ERROR}</p>
              <button
                type="button"
                onClick={retryLast}
                className="inline-flex items-center gap-1.5 font-semibold hover:underline"
              >
                <RotateCcw className="w-3 h-3" aria-hidden="true" /> Retry
              </button>
            </div>
          )}

          <ul className="space-y-4 list-none" aria-label="Conversation">
            {messages.map((message) => {
              const invocations = collectInvocations(message);
              const text = extractText(message);
              const isUser = message.role === 'user';
              return (
                <li
                  key={message.id}
                  className={`flex gap-3 text-xs leading-relaxed ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <div className="w-7 h-7 rounded-lg bg-primary-subtle flex items-center justify-center text-primary-strong shrink-0 mt-0.5">
                      <Bot className="w-4 h-4" aria-hidden="true" />
                    </div>
                  )}

                  <div
                    className={`rounded-2xl p-3.5 max-w-[85%] ${
                      isUser
                        ? 'bg-primary text-primary-foreground rounded-tr-xs'
                        : 'bg-surface border border-border text-foreground rounded-tl-xs'
                    }`}
                  >
                    {/* Verified retrieval cards, in stream order, before the prose answer. */}
                    {!isUser && invocations.length > 0 && (
                      <div className="mb-2 space-y-1.5">
                        {invocations.map((invocation, index) => (
                          <InvocationCard key={`${message.id}-tool-${index}`} invocation={invocation} />
                        ))}
                      </div>
                    )}

                    {text.length > 0 &&
                      (isUser ? (
                        <div className="whitespace-pre-wrap" dir="auto">{text}</div>
                      ) : (
                        <MarkdownMessage content={text} />
                      ))}
                  </div>

                  {isUser && (
                    <div className="w-7 h-7 rounded-lg bg-surface-muted flex items-center justify-center text-foreground shrink-0 mt-0.5">
                      <User className="w-4 h-4" aria-hidden="true" />
                    </div>
                  )}
                </li>
              );
            })}
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
                <span className="ml-1 text-[11px]">Consulting verified sources…</span>
              </div>
            </div>
          )}
        </div>

        {/* Input bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(draft);
          }}
          className="p-3 border-t border-border bg-card flex items-center gap-2 shrink-0"
        >
          <input
            id="tutor-prompt-input"
            name="tutor-prompt-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask about verses, tafseer, roots, Tajweed, or Tamil..."
            aria-label="Ask the study assistant"
            autoComplete="off"
            className="flex-1 bg-surface border border-border text-foreground text-xs px-3.5 py-2.5 rounded-xl outline-hidden placeholder:text-muted-foreground"
          />
          {isLoading ? (
            <button
              type="button"
              onClick={() => stop()}
              aria-label="Stop generating"
              className="p-2.5 rounded-xl bg-surface border border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="block w-3 h-3 bg-current rounded-[2px]" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={draft.trim().length === 0}
              aria-label="Send message"
              className="p-2.5 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:pointer-events-none text-primary-foreground transition-colors shadow-xs"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </form>
        <div className="sr-only">
          <BookOpen aria-hidden="true" />
        </div>
      </div>
    </Modal>
  );
};

/** Concatenates the text parts of a UI message. */
function extractText(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

/** Renders one verified-retrieval citation card, or a pending chip while it runs. */
function InvocationCard({ invocation }: { invocation: InvocationView }) {
  if (isPendingInvocation(invocation)) {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface text-muted-foreground text-xs font-mono border border-border animate-pulse">
        <Sparkles className="w-3.5 h-3.5 text-primary animate-spin" aria-hidden="true" />
        <span>Retrieving {invocation.toolName}…</span>
      </div>
    );
  }
  return <TafsirAwareToolCard toolName={invocation.toolName} result={invocation.result!} />;
}

/** Maps a completed tool result to its dedicated card, or a generic confirmation. */
function TafsirAwareToolCard({ toolName, result }: { toolName: string; result: Record<string, unknown> }) {
  if (toolName === 'getVerse') {
    return <VerseCard result={result} />;
  }
  if (toolName === 'getWordDetails') {
    return <WordAnalysisCard result={result} />;
  }
  if (toolName === 'getAyahTafsir') {
    return (
      <div className="my-2.5 p-3.5 rounded-2xl bg-surface border border-border shadow-xs space-y-1.5">
        <div className="flex items-center justify-between gap-2 border-b border-border pb-1.5">
          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <BookOpen className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
            Tafseer Consulted
          </span>
          <span className="text-[10px] font-bold text-primary truncate">{String(result.editionName ?? '')}</span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {String(result.author ?? '')} · {String(result.language === 'ta' ? 'தமிழ்' : 'English')} · {String(result.surah)}:{String(result.ayah)}
        </p>
        <p className="text-xs text-foreground/90 line-clamp-3" dir="auto">{String(result.text ?? '')}</p>
      </div>
    );
  }
  return (
    <div className="p-2.5 rounded-xl bg-surface border border-border text-xs text-muted-foreground my-1 font-mono">
      <span className="font-semibold text-primary">✓ {toolName}: </span>
      <span>Completed verified retrieval</span>
    </div>
  );
}
