'use client';

import React from 'react';
import type { BilingualText, LabeledText } from '@/lib/arabic/register-map';
import { isEnglishEnabled, isTamilEnabled, type FeedbackLanguage } from '@/lib/i18n/language';

/** English / Tamil gloss lines for one concept, honouring the learner's preference. */
export const BilingualLines: React.FC<{
  text: BilingualText;
  language: FeedbackLanguage;
  className?: string;
}> = ({ text, language, className }) => (
  <>
    {isEnglishEnabled(language) && text.en && <p className={className}>{text.en}</p>}
    {isTamilEnabled(language) && text.ta && <p className={`font-tamil ${className ?? ''}`}>{text.ta}</p>}
  </>
);

/** One-line gloss: "English · தமிழ்" — or just the selected language. */
export function glossText(label: LabeledText, language: FeedbackLanguage): string {
  const parts: string[] = [];
  if (isEnglishEnabled(language)) parts.push(label.en);
  if (isTamilEnabled(language)) parts.push(label.ta);
  return parts.join(' · ');
}

/** "الرَّفْع — Rafʿ (nominative) · ரஃப்": Arabic label plus the selected glosses. */
export function labeledText(label: LabeledText, language: FeedbackLanguage): string {
  const gloss = glossText(label, language);
  return gloss ? `${label.arabic} — ${gloss}` : label.arabic;
}

const TONE_CLASSES: Record<'classical' | 'spoken' | 'neutral', string> = {
  classical: 'bg-secondary-subtle text-secondary-strong border-secondary/30',
  spoken: 'bg-primary-subtle text-primary-strong border-primary/30',
  neutral: 'bg-muted text-muted-foreground border-border',
};

/** Compact grammar-label chip: Arabic term + the gloss in the chosen language(s). */
export const LabelChip: React.FC<{
  label: LabeledText;
  language: FeedbackLanguage;
  tone?: keyof typeof TONE_CLASSES;
}> = ({ label, language, tone = 'neutral' }) => (
  <span
    className={`inline-flex flex-wrap items-baseline gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${TONE_CLASSES[tone]}`}
  >
    <span className="font-arabic text-sm leading-none" dir="rtl" lang="ar">
      {label.arabic}
    </span>
    {(isEnglishEnabled(language) || isTamilEnabled(language)) && (
      <span className="font-normal leading-tight">{glossText(label, language)}</span>
    )}
  </span>
);

/** Splits an Uthmani ayah so the drilled token can be emphasised in place. */
export function renderAyahWithToken(
  ayahText: string,
  token: string,
  highlightClass = 'text-primary-strong bg-primary-subtle rounded-md px-1'
): React.ReactNode {
  const index = ayahText.indexOf(token);
  if (index < 0) return ayahText;
  return (
    <>
      {ayahText.slice(0, index)}
      <span className={highlightClass}>{token}</span>
      {ayahText.slice(index + token.length)}
    </>
  );
}
