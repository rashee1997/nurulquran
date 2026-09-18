'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, BookOpen, Hash, Loader2, CornerDownLeft, Sparkles, BarChart3, Brain, Layers, Clock } from 'lucide-react';
import { SURAHS } from '@/lib/quran/surahs';
import { quranProvider } from '@/lib/quran/alquran-cloud';
import { normalizeForSearch } from '@/lib/quran/arabic-text';
import { track } from '@/lib/telemetry/events';
import { useLocale } from '@/lib/i18n/useLocale';
import { useTheme } from '@/hooks/use-theme';

interface SurahMatch {
  kind: 'surah';
  id: string;
  surahId: number;
  label: string;
  sublabel: string;
}

interface VerseKeyMatch {
  kind: 'verse-key';
  id: string;
  surah: number;
  ayah: number;
  label: string;
  sublabel: string;
}

interface VerseTextMatch {
  kind: 'verse-text';
  id: string;
  surah: number;
  ayah: number;
  label: string;
  sublabel: string;
}

/** A product action, runnable from the palette without navigation. */
interface ActionMatch {
  kind: 'action';
  id: string;
  actionId: string;
  label: string;
  sublabel: string;
  run: () => void;
}

type PaletteResult = SurahMatch | VerseKeyMatch | VerseTextMatch | ActionMatch;

/** `2:255`, `2:255-257`, or `al-baqarah 255` style references, resolved locally before any search call. */
function parseVerseKey(raw: string): { surah: number; ayah: number } | null {
  const direct = /^(\d{1,3})\s*[:\-]\s*(\d{1,3})$/.exec(raw.trim());
  if (direct) {
    const surah = Number(direct[1]);
    const ayah = Number(direct[2]);
    const meta = SURAHS.find((s) => s.id === surah);
    if (meta && ayah >= 1 && ayah <= meta.versesCount) return { surah, ayah };
  }
  return null;
}

function matchSurahs(raw: string, limit: number): SurahMatch[] {
  const asNumber = Number(raw);
  const normalized = normalizeForSearch(raw);
  return SURAHS.filter((s) => {
    if (Number.isInteger(asNumber) && s.id === asNumber) return true;
    return (
      normalizeForSearch(s.nameSimple).includes(normalized) ||
      normalizeForSearch(s.nameEnglish).includes(normalized) ||
      s.nameArabic.includes(raw)
    );
  })
    .slice(0, limit)
    .map((s) => ({
      kind: 'surah' as const,
      id: `surah-${s.id}`,
      surahId: s.id,
      label: `${s.id}. ${s.nameSimple}`,
      sublabel: `${s.nameEnglish} · ${s.versesCount} ayahs · ${s.revelationPlace === 'makkah' ? 'Makkah' : 'Madinah'}`,
    }));
}

/**
 * Global ⌘K palette: a keyboard map of the product, not just a search box. Three result
 * sections — product actions (review, planner, theme), surah/verse-key jumps, and the
 * debounced full-text search across Arabic/English/Tamil.
 */
export const CommandPalette: React.FC = () => {
  const { t } = useLocale();
  const router = useRouter();
  const { toggleTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [textResults, setTextResults] = useState<VerseTextMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setTextResults([]);
    setActiveIndex(0);
    // Return focus to the trigger — Radix dialog convention.
    requestAnimationFrame(() => inputRef.current?.closest('[data-palette-root]')?.querySelector<HTMLButtonElement>('[data-palette-trigger]')?.focus());
  }, []);

  const open = useCallback(() => {
    setIsOpen(true);
    track('search.opened');
  }, []);

  /** Body scroll lock while open; the page behind must not scroll on touch. */
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isModK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      if (isModK) {
        e.preventDefault();
        setIsOpen((prev) => {
          if (prev) return prev;
          track('search.opened');
          return true;
        });
      } else if (e.key === 'Escape' && isOpen) {
        close();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, close]);

  useEffect(() => {
    if (isOpen) {
      const frame = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
  }, [isOpen]);

  // Debounced full-text search across Arabic/English/Tamil, on top of the instant local matches.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 3 || parseVerseKey(trimmed)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears stale full-text results once the query becomes a local-only match (too short, or a verse-key reference)
      setTextResults([]);
      setIsSearching(false);
      return;
    }
    let active = true;
    setIsSearching(true);
    const timer = setTimeout(() => {
      track('search.query', { length: trimmed.length });
      quranProvider
        .search({ query: trimmed, limit: 8 })
        .then((results) => {
          if (!active) return;
          if (results.length === 0) track('search.no_results');
          setTextResults(
            results.map((r) => ({
              kind: 'verse-text' as const,
              id: `text-${r.surah}-${r.ayah}-${r.matchType}`,
              surah: r.surah,
              ayah: r.ayah,
              label: r.matchType === 'arabic' ? r.text : `${r.surahName} ${r.surah}:${r.ayah}`,
              sublabel: r.matchType === 'arabic' ? `${r.surahName} ${r.surah}:${r.ayah}` : r.text,
            }))
          );
        })
        .catch(() => {
          if (active) setTextResults([]);
        })
        .finally(() => {
          if (active) setIsSearching(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  const actions: ActionMatch[] = useMemo(() => {
    const runAction = (actionId: string, run: () => void): void => {
      track('palette.action', { id: actionId });
      close();
      run();
    };
    return [
      {
        kind: 'action',
        id: 'action-review',
        actionId: 'start-review',
        label: 'Start review session',
        sublabel: 'Open today’s spaced-repetition queue',
        run: () => runAction('start-review', () => router.push('/review')),
      },
      {
        kind: 'action',
        id: 'action-planner',
        actionId: 'open-planner',
        label: 'Open Hifz planner',
        sublabel: 'Daily portions and memorization targets',
        run: () => runAction('open-planner', () => router.push('/memorize/planner')),
      },
      {
        kind: 'action',
        id: 'action-progress',
        actionId: 'open-progress',
        label: 'Show my progress',
        sublabel: 'Heatmap, goals and weak spots',
        run: () => runAction('open-progress', () => router.push('/progress')),
      },
      {
        kind: 'action',
        id: 'action-theme',
        actionId: 'toggle-theme',
        label: 'Toggle dark mode',
        sublabel: 'Switch between light and dark themes',
        run: () => runAction('toggle-theme', toggleTheme),
      },
    ];
  }, [router, toggleTheme, close]);

  const results: PaletteResult[] = useMemo(() => {
    const trimmed = query.trim();
    const needle = normalizeForSearch(trimmed);
    const matchedActions =
      trimmed.length === 0
        ? []
        : actions.filter((a) => normalizeForSearch(a.label).includes(needle) || a.sublabel.toLowerCase().includes(needle));

    if (trimmed.length === 0) return actions;

    const verseKey = parseVerseKey(trimmed);
    if (verseKey) {
      const meta = SURAHS.find((s) => s.id === verseKey.surah);
      return [
        {
          kind: 'verse-key',
          id: `key-${verseKey.surah}-${verseKey.ayah}`,
          surah: verseKey.surah,
          ayah: verseKey.ayah,
          label: `${meta?.nameSimple ?? `Surah ${verseKey.surah}`} ${verseKey.surah}:${verseKey.ayah}`,
          sublabel: 'Jump to this ayah',
        },
        ...matchedActions,
      ];
    }

    return [...matchedActions, ...matchSurahs(trimmed, 6), ...textResults];
  }, [query, textResults, actions]);

  const goTo = useCallback(
    (result: PaletteResult) => {
      if (result.kind === 'action') {
        result.run();
        return;
      }
      if (result.kind === 'surah') {
        router.push(`/quran/${result.surahId}`);
      } else {
        router.push(`/quran/${result.surah}#ayah-${result.ayah}`);
      }
      close();
    },
    [router, close]
  );

  // Keep the active option scrolled into view during keyboard traversal.
  useEffect(() => {
    listRef.current
      ?.querySelectorAll<HTMLElement>('[role="option"]')
      [activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, results.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const chosen = results[activeIndex];
      if (chosen) goTo(chosen);
    }
  };

  const sectionOf = (result: PaletteResult): string =>
    result.kind === 'action' ? 'Actions' : 'Jump to';

  return (
    <>
      <button
        type="button"
        data-palette-trigger
        onClick={open}
        aria-label="Search the Quran (Ctrl/Cmd+K)"
        className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border bg-background hover:bg-muted text-muted-foreground text-xs font-medium transition-colors shrink-0"
      >
        <Search className="w-3.5 h-3.5" aria-hidden="true" />
        <span>{t('nav.search', 'Search')}</span>
        <kbd className="ml-1 px-1.5 py-0.5 rounded-md bg-muted border border-border text-[10px] font-mono">
          ⌘K
        </kbd>
      </button>
      <button
        type="button"
        data-palette-trigger
        onClick={open}
        aria-label="Search the Quran"
        className="sm:hidden p-2 rounded-xl text-foreground hover:bg-muted border border-border transition-colors shadow-2xs shrink-0"
      >
        <Search className="w-4 h-4" aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-100 flex items-start justify-center bg-black/40 backdrop-blur-xs p-4 pt-[10vh]"
          onClick={close}
          role="presentation"
        >
          <div
            className="w-full max-w-xl rounded-2xl bg-card border border-border shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Search the Quran"
          >
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
              {isSearching ? (
                <Loader2 className="w-4 h-4 text-muted-foreground animate-spin shrink-0" aria-hidden="true" />
              ) : (
                <Search className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
              )}
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Search, run an action, or jump to 2:255…"
                aria-label="Search or run an action"
                role="combobox"
                aria-expanded="true"
                aria-controls="command-palette-listbox"
                aria-activedescendant={results[activeIndex] ? `palette-option-${activeIndex}` : undefined}
                className="flex-1 bg-transparent outline-hidden text-sm text-foreground placeholder:text-muted-foreground"
              />
              <button
                type="button"
                onClick={close}
                aria-label="Close search"
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto scroll-contained">
              {query.trim().length === 0 ? (
                <div className="px-4 py-4">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Actions</p>
                  <ul id="command-palette-listbox" role="listbox" aria-label="Actions" ref={listRef}>
                    {results.map((result, idx) => (
                      <li key={result.id} role="presentation">
                        <PaletteOption
                          result={result}
                          idx={idx}
                          active={idx === activeIndex}
                          onHover={() => setActiveIndex(idx)}
                          onChoose={() => goTo(result)}
                        />
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Or type a surah name, a reference like <span className="font-mono">2:255</span>, or a phrase in
                    Arabic, English or Tamil.
                  </p>
                </div>
              ) : results.length === 0 && !isSearching ? (
                <p role="status" className="px-4 py-6 text-xs text-muted-foreground text-center">No matches found.</p>
              ) : (
                <ul id="command-palette-listbox" role="listbox" aria-label="Search results" ref={listRef}>
                  {results.map((result, idx) => {
                    const showSection = idx === 0 || sectionOf(result) !== sectionOf(results[idx - 1]!);
                    return (
                      <React.Fragment key={result.id}>
                        {showSection && (
                          <li role="presentation" aria-hidden="true" className="px-4 pt-3 pb-1">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                              {sectionOf(result)}
                            </span>
                          </li>
                        )}
                        <li role="presentation">
                          <PaletteOption
                            result={result}
                            idx={idx}
                            active={idx === activeIndex}
                            onHover={() => setActiveIndex(idx)}
                            onChoose={() => goTo(result)}
                          />
                        </li>
                      </React.Fragment>
                    );
                  })}
                </ul>
              )}
            </div>
            <p role="status" className="sr-only">
              {isSearching ? 'Searching…' : `${results.length} result${results.length === 1 ? '' : 's'} available.`}
            </p>
          </div>
        </div>
      )}
    </>
  );
};

const OPTION_ICON: Record<string, React.ElementType> = {
  surah: BookOpen,
  'verse-key': Hash,
  'verse-text': Hash,
  action: Sparkles,
};

interface PaletteOptionProps {
  result: PaletteResult;
  idx: number;
  active: boolean;
  onHover: () => void;
  onChoose: () => void;
}

function PaletteOption({ result, idx, active, onHover, onChoose }: PaletteOptionProps): React.JSX.Element {
  const Icon =
    result.kind === 'action'
      ? result.actionId === 'toggle-theme'
        ? Sparkles
        : result.actionId === 'start-review'
          ? Clock
          : result.actionId === 'open-planner'
            ? Layers
            : BarChart3
      : OPTION_ICON[result.kind] ?? BookOpen;
  const isAction = result.kind === 'action';

  return (
    <button
      type="button"
      id={`palette-option-${idx}`}
      role="option"
      aria-selected={active}
      onClick={onChoose}
      onMouseEnter={onHover}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
        active ? 'bg-primary/10' : 'hover:bg-muted'
      }`}
    >
      <span
        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
          isAction ? 'bg-primary-subtle text-primary-strong' : 'bg-muted text-muted-foreground'
        }`}
      >
        <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block text-sm font-semibold text-foreground truncate ${
            result.kind === 'verse-text' ? 'font-arabic text-right' : ''
          }`}
          dir={result.kind === 'verse-text' ? 'rtl' : undefined}
        >
          {result.label}
        </span>
        <span className="block text-[11px] text-muted-foreground truncate">{result.sublabel}</span>
      </span>
      <Brain
        className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-primary' : 'invisible'}`}
        aria-hidden="true"
      />
      {active && <CornerDownLeft className="w-3.5 h-3.5 text-primary shrink-0" aria-hidden="true" />}
    </button>
  );
}
