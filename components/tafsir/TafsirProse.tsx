'use client';

import React from 'react';

/**
 * Editorial typography for tafsir payloads.
 *
 * Upstream editions are plain text with soft conventions, not markup. The Ibn Kathir family,
 * for example, separates sections with blank lines, embeds whole Arabic verses on their own
 * lines, and quotes translation fragments inline as `(1. "…")(2. "…")`. Rendering that as a
 * single `whitespace-pre-line` paragraph is what produced the "raw text dump" the audit
 * flagged. This renderer recognises those conventions and maps them onto a typographic
 * hierarchy — all without ever altering a character of the commentary itself:
 *
 *  - A short line with no sentence punctuation, used as the *first* line of a block, is a
 *    **section heading** for the lines beneath it.
 *  - A line that is predominantly Arabic is a **scripture block**: RTL, larger, Amiri Quran,
 *    centred — visually distinct from the prose around it.
 *  - Everything else is a **paragraph**, with `dir="auto"` so mixed Tamil/Arabic content
 *    picks the correct base direction per paragraph.
 *
 * `translate="no"`/`notranslate` on the root keeps translation toolbars from rewriting
 * theological vocabulary; each Arabic block additionally carries `lang="ar" dir="rtl"`.
 */

interface TafsirProseProps {
  text: string;
  language: 'en' | 'ta';
}

/** Arabic letters, including the presentation forms these editions occasionally emit. */
const ARABIC_LETTERS = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;

/** A line is "Arabic" when most of its letters are in the Arabic ranges. */
function isArabicLine(line: string): boolean {
  const letters = line.replace(/[\s\d\p{P}\p{S}]/gu, '');
  if (letters.length === 0) return false;
  const arabic = (letters.match(ARABIC_LETTERS) ?? []).length;
  return arabic / letters.length > 0.5;
}

/** Punctuation that terminates a sentence in Arabic, Tamil or Latin. */
const TERMINAL_PUNCTUATION = /[.!?;:।॥؟]$/;
/** Punctuation anywhere inside a line that marks it as prose rather than a title. */
const INTERNAL_PUNCTUATION = /[.,;:!?।॥؟]/;

/**
 * Whether a line reads as a section heading.
 *
 * The previous rule was "shorter than 90 characters and not ending in punctuation", which is
 * true of most short sentences: Tamil prose rarely closes a line with a Latin full stop, and
 * the abridged English editions are written in short paragraphs by design. The result was
 * ordinary sentences rendered as section headings with an accent bar, which is the opposite
 * of the hierarchy the headings exist to create.
 *
 * A line must therefore clear four independent gates: bounded length, no terminal
 * punctuation, no *internal* sentence punctuation, and a word count no longer than a real
 * title. Anything that fails is treated as a paragraph — a heading that renders as prose is
 * a far smaller error than prose that renders as a heading.
 */
function looksLikeHeading(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 80) return false;
  if (TERMINAL_PUNCTUATION.test(trimmed)) return false;
  if (INTERNAL_PUNCTUATION.test(trimmed)) return false;
  if (trimmed.split(/\s+/).length > 9) return false;
  return true;
}

export function TafsirProse({ text, language }: TafsirProseProps) {
  const blocks = text.split(/\n{2,}|\r\n\r\n/);
  const scriptClass = language === 'ta' ? 'font-tamil' : '';

  return (
    <div
      lang={language}
      translate="no"
      className={`notranslate space-y-4 max-w-[65ch] ${scriptClass}`}
    >
      {blocks.map((block, index) => {
        const lines = block
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0);
        if (lines.length === 0) return null;

        // A block whose lines are all Arabic renders as one scripture panel.
        if (lines.every(isArabicLine)) {
          return (
            <p
              key={index}
              lang="ar"
              dir="rtl"
              className="font-arabic text-xl sm:text-2xl leading-[2.4] text-center text-foreground rounded-xl bg-surface-muted border border-border px-4 py-3"
            >
              {block.trim()}
            </p>
          );
        }

        /*
         * A leading short line titles the rest of its block. This is the shape classical
         * commentaries actually ship ("The Virtue of This Ayah" followed, on the next line, by
         * the discussion), so it is checked before the single-line case below.
         */
        const heading = lines.length > 1 && looksLikeHeading(lines[0] ?? '') ? lines[0] : null;
        const body = heading ? lines.slice(1) : lines;

        // A one-line block that is itself a heading: the title stands alone.
        if (!heading && lines.length === 1 && looksLikeHeading(lines[0] ?? '')) {
          return (
            <h3 key={index} className="text-sm font-bold text-foreground pt-1 flex items-start gap-2">
              <span className="w-1 self-stretch rounded-full bg-primary/60 shrink-0" aria-hidden="true" />
              <span className={scriptClass}>{lines[0]?.trim()}</span>
            </h3>
          );
        }

        return (
          <section key={index} className="space-y-3">
            {heading && (
              <h3 className="text-sm font-bold text-foreground pt-1 flex items-start gap-2">
                <span className="w-1 self-stretch rounded-full bg-primary/60 shrink-0" aria-hidden="true" />
                <span className={scriptClass}>{heading}</span>
              </h3>
            )}

            <div className="space-y-2">
              {body.map((line, lineIndex) =>
                isArabicLine(line) ? (
                  <p
                    key={lineIndex}
                    lang="ar"
                    dir="rtl"
                    className="font-arabic text-lg sm:text-xl leading-[2.2] text-center text-foreground"
                  >
                    {line}
                  </p>
                ) : (
                  <p
                    key={lineIndex}
                    dir="auto"
                    className={`text-[0.95rem] text-foreground ${
                      language === 'ta' ? 'leading-[1.9] font-tamil' : 'leading-[1.75]'
                    }`}
                  >
                    {line}
                  </p>
                )
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
