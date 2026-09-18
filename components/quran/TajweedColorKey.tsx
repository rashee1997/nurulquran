'use client';

import React from 'react';
import { TAJWEED_LEGEND, type TajweedLegendEntry } from '@/lib/quran/tajweed';
import type { TajweedRule } from '@/lib/quran/types';

interface TajweedColorKeyProps {
  /**
   * `inline` lays the entries out in a grid for a panel or a settings drawer; `stacked` is a
   * single column for the narrow column inside the live coach.
   */
  variant?: 'inline' | 'stacked';
  /**
   * Show the instruction line ("hold for two counts…") under each rule.
   *
   * A colour on its own teaches nothing: the learner needs the count and the place the sound is
   * made in the same glance as the colour, which is why the instruction ships with the key
   * rather than living behind a hover.
   */
  showInstructions?: boolean;
  /**
   * Wrap the key in a native `<details>` disclosure.
   *
   * Used where the key is reference material rather than the point of the screen — a lesson or
   * the coach bar — so it is available on demand without pushing the activity off the fold.
   * Native disclosure means no state, no effect, and nothing to hydrate.
   */
  collapsible?: boolean;
  /** Restrict the key to the rules a particular lesson teaches. */
  rules?: readonly TajweedRule[];
  className?: string;
}

/**
 * The shared Tajweed colour key.
 *
 * Every surface that shows a coloured rule renders *this* component, so the reader, the Tajweed
 * lessons and the live coach cannot drift apart — the failure mode being a learner who is taught
 * one colour for Ikhfa in a lesson and shown another while reading.
 *
 * Colour is never the sole channel. Each entry prints the rule's name in English and Tamil next
 * to its swatch, because roughly one learner in twelve cannot distinguish the red/green pairs
 * used for Madd and Idgham, and a colour-coded Mushaf assumes they can.
 */
export const TajweedColorKey: React.FC<TajweedColorKeyProps> = ({
  variant = 'inline',
  showInstructions = false,
  collapsible = false,
  rules,
  className = '',
}) => {
  const entries: readonly TajweedLegendEntry[] = rules
    ? TAJWEED_LEGEND.filter((entry) => rules.includes(entry.rule))
    : TAJWEED_LEGEND;

  if (entries.length === 0) return null;

  const list = (
    <ul
      className={
        variant === 'stacked'
          ? 'space-y-2'
          : 'grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2'
      }
    >
      {entries.map((entry) => (
        <li key={entry.rule} className="flex items-start gap-2">
          <span
            aria-hidden="true"
            className={`mt-1 h-3 w-3 shrink-0 rounded-sm bg-current ${entry.colorClass}`}
          />
          <span className="min-w-0">
            <span className={`block text-[11px] font-semibold leading-snug ${entry.colorClass}`}>
              {entry.name}
            </span>
            <span className="block text-[11px] leading-snug text-muted-foreground" lang="ta">
              {entry.nameTa}
            </span>
            {showInstructions && (
              <>
                <span className="block text-[11px] leading-snug text-foreground/80">
                  {entry.instruction}
                </span>
                <span className="block text-[11px] leading-snug text-muted-foreground" lang="ta">
                  {entry.instructionTa}
                </span>
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  );

  if (!collapsible) {
    return <div className={className}>{list}</div>;
  }

  return (
    <details className={`group ${className}`}>
      <summary className="cursor-pointer list-none text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
        Tajweed colour key
        <span className="ml-1 font-normal normal-case tracking-normal group-open:hidden">
          — show
        </span>
      </summary>
      <div className="pt-2">{list}</div>
    </details>
  );
};
