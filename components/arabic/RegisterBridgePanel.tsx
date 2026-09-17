'use client';

import React from 'react';
import { getArabicEntries } from '@/lib/arabic/lexicon';
import { buildRegisterBridgeView } from '@/lib/arabic/register-map';
import { FEEDBACK_LANGUAGE_OPTIONS, isEnglishEnabled, isTamilEnabled, type FeedbackLanguage } from '@/lib/i18n/language';
import type { RulePair } from '@/lib/arabic/types';
import { BilingualLines, LabelChip, renderAyahWithToken } from './Bilingual';
import { BookOpen, GitCompareArrows, Quote, Sparkles } from 'lucide-react';

interface RegisterBridgePanelProps {
  /** Lexicon entries to render, in order. */
  entryIds: readonly string[];
  language: FeedbackLanguage;
  /** Optional grammar rule pair shown above the entries. */
  rulePair?: RulePair;
  /** Trims the entry list (used inside the lesson runner). */
  limit?: number;
  className?: string;
}

export const RegisterBridgePanel: React.FC<RegisterBridgePanelProps> = ({
  entryIds,
  language,
  rulePair,
  limit,
  className,
}) => {
  const ids = limit ? entryIds.slice(0, limit) : entryIds;
  const entries = getArabicEntries(ids);
  const preferenceShort =
    FEEDBACK_LANGUAGE_OPTIONS.find((option) => option.id === language)?.short ?? 'EN + தமிழ்';

  return (
    <div className={`space-y-4 ${className ?? ''}`}>
      {rulePair && (
        <div className="p-4 rounded-2xl border border-border bg-card shadow-xs space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <GitCompareArrows className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-foreground">{rulePair.ruleNameEn}</p>
                <p className="font-tamil text-xs text-muted-foreground">{rulePair.ruleNameTa}</p>
              </div>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-primary-subtle text-primary-strong shrink-0">
              Rule pair
            </span>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-secondary-subtle border border-secondary/25 space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-secondary-strong">
                Classical (Quranic)
              </p>
              <p className="font-arabic text-xl leading-loose text-foreground" dir="rtl">
                {rulePair.classical.arabic}
              </p>
              <BilingualLines
                language={language}
                text={{ en: rulePair.classical.noteEn, ta: rulePair.classical.noteTa }}
                className="text-[11px] text-muted-foreground leading-relaxed"
              />
            </div>
            <div className="p-3 rounded-xl bg-primary-subtle border border-primary/25 space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-primary-strong">
                Spoken (everyday)
              </p>
              <p className="font-arabic text-xl leading-loose text-foreground" dir="rtl">
                {rulePair.spoken.arabic}
              </p>
              <BilingualLines
                language={language}
                text={{ en: rulePair.spoken.noteEn, ta: rulePair.spoken.noteTa }}
                className="text-[11px] text-muted-foreground leading-relaxed"
              />
            </div>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/60">
            <Sparkles className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Register transfer
              </p>
              <BilingualLines
                language={language}
                text={{ en: rulePair.transferNoteEn, ta: rulePair.transferNoteTa }}
                className="text-[11px] text-foreground/90 leading-relaxed"
              />
            </div>
          </div>
        </div>
      )}

      {entries.map((entry) => {
        const view = buildRegisterBridgeView(entry, language);

        return (
          <div key={entry.id} className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border flex flex-wrap items-center justify-between gap-2 bg-muted/40">
              <div className="flex items-center gap-2">
                <span className="font-arabic text-2xl text-foreground leading-none" dir="rtl">
                  {view.lemma}
                </span>
                <span className="text-[11px] italic text-muted-foreground">{view.transliteration}</span>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Glosses: {preferenceShort}
              </span>
            </div>

            <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
              {/* Classical / Uthmani column */}
              {view.classical ? (
                <div className="p-4 space-y-3 bg-secondary-subtle/40">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-3.5 h-3.5 text-secondary-strong shrink-0" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-secondary-strong">
                      Classical · {view.classical.label.arabic}
                    </span>
                  </div>

                  <p className="font-arabic text-3xl text-foreground text-center leading-loose" dir="rtl">
                    {view.classical.arabic}
                  </p>

                  <div className="flex items-start gap-2 p-3 rounded-xl bg-card/80 border border-border">
                    <Quote className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="space-y-1 min-w-0">
                      <p className="font-arabic text-lg leading-loose text-foreground" dir="rtl">
                        {renderAyahWithToken(view.classical.ayahTextUthmani, view.classical.arabic)}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-bold text-muted-foreground">
                          Q {view.classical.ayahRef.surah}:{view.classical.ayahRef.ayah}
                        </span>
                        {view.classical.tajweedRule && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-secondary-subtle text-secondary-strong border border-secondary/30 font-semibold">
                            {view.classical.tajweedRule}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {view.irab && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Iʿrāb — {view.irab.role.arabic}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        <LabelChip label={view.irab.case} language={language} tone="classical" />
                        <LabelChip label={view.irab.sign} language={language} tone="classical" />
                        <LabelChip label={view.irab.spokenBehavior} language={language} tone="neutral" />
                      </div>
                      <BilingualLines
                        language={language}
                        text={view.irab.explanation}
                        className="text-[11px] text-muted-foreground leading-relaxed"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 flex items-center justify-center text-center bg-muted/30">
                  <p className="text-[11px] text-muted-foreground max-w-[220px]">
                    No direct mushaf token — this word is built from an anchored root and lives in
                    the spoken register.
                  </p>
                </div>
              )}

              {/* Spoken / MSA column */}
              <div className="p-4 space-y-3 bg-primary-subtle/40">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-primary-strong shrink-0" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary-strong">
                    Spoken · {view.spoken.label.arabic}
                  </span>
                </div>

                <p className="font-arabic text-3xl text-foreground text-center leading-loose" dir="rtl">
                  {view.spoken.arabic}
                </p>
                <p className="text-center text-[11px] italic text-muted-foreground">
                  {view.spoken.transliteration}
                </p>

                <div className="space-y-1">
                  {view.spoken.glosses.map((gloss) => (
                    <p
                      key={gloss.language}
                      className={`text-xs text-foreground/90 ${gloss.language === 'ta' ? 'font-tamil' : ''}`}
                    >
                      {gloss.text}
                    </p>
                  ))}
                </div>

                {view.irab && (
                  <BilingualLines
                    language={language}
                    text={view.irab.spokenNote}
                    className="text-[11px] text-muted-foreground leading-relaxed"
                  />
                )}

                {view.spoken.dialectNote && (
                  <p className="text-[10px] text-muted-foreground border-t border-border pt-2">
                    <span className="font-bold uppercase tracking-wider">{view.spoken.dialectNote.variety}</span>{' '}
                    · {view.spoken.dialectNote.text}
                    {isTamilEnabled(language) && (
                      <span className="font-tamil"> · {view.spoken.dialectNote.glossTa}</span>
                    )}
                  </p>
                )}
              </div>
            </div>

            <div className="px-4 py-3 border-t border-border bg-muted/30 flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Bridge
              </span>
              <span className="text-[11px] font-semibold text-foreground">
                {isEnglishEnabled(language) ? view.bridge.relationship.en : view.bridge.relationship.ta}
              </span>
              {view.bridge.rootDisplay && (
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-card border border-border font-arabic" dir="rtl">
                  root {view.bridge.rootDisplay}
                </span>
              )}
              {view.bridge.waznArabic && (
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-card border border-border font-arabic" dir="rtl">
                  {view.bridge.waznArabic}
                </span>
              )}
              {view.bridge.derivedFromEntryId && (
                <span className="text-[10px] text-muted-foreground">
                  built on <span className="font-semibold">{view.bridge.derivedFromEntryId}</span>
                </span>
              )}
            </div>
          </div>
        );
      })}

      {entries.length === 0 && !rulePair && (
        <p className="text-xs text-muted-foreground">No register bridge for this activity.</p>
      )}
    </div>
  );
};
