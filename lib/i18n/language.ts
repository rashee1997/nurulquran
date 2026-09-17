/**
 * Shared bilingual feedback preference ('both' | 'en' | 'ta').
 * Governs every learner-facing surface: AI Tajweed coach replies, voice previews,
 * lesson feedback, and placement exam results. One preference, everywhere.
 */

export type FeedbackLanguage = 'both' | 'en' | 'ta';

export const DEFAULT_FEEDBACK_LANGUAGE: FeedbackLanguage = 'both';

export interface FeedbackLanguageOption {
  id: FeedbackLanguage;
  label: string;
  short: string;
  sub: string;
  previewNote: string;
}

export const FEEDBACK_LANGUAGE_OPTIONS: FeedbackLanguageOption[] = [
  {
    id: 'both',
    label: 'English & Tamil (இருமொழி)',
    short: 'EN + தமிழ்',
    sub: 'Complete bilingual explanations',
    previewNote: 'Preview speaks English, then Tamil',
  },
  {
    id: 'en',
    label: 'English Only',
    short: 'EN',
    sub: 'Standard international English',
    previewNote: 'Preview speaks English only',
  },
  {
    id: 'ta',
    label: 'Tamil Only (தமிழ் மட்டும்)',
    short: 'தமிழ்',
    sub: 'முழுமையான தமிழ் விளக்கம்',
    previewNote: 'Preview speaks Tamil only',
  },
];

export function normalizeFeedbackLanguage(value?: string | null): FeedbackLanguage {
  return value === 'en' || value === 'ta' ? value : DEFAULT_FEEDBACK_LANGUAGE;
}

/** True when English explanations should be shown for this preference. */
export function isEnglishEnabled(language?: string | null): boolean {
  return normalizeFeedbackLanguage(language) !== 'ta';
}

/** True when Tamil explanations should be shown for this preference. */
export function isTamilEnabled(language?: string | null): boolean {
  return normalizeFeedbackLanguage(language) !== 'en';
}
