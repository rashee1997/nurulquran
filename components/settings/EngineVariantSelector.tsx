'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Cpu, Loader2, Volume2 } from 'lucide-react';
import {
  MODEL_VARIANTS,
  variantTotalBytes,
  type CoachModelVariant,
} from '@/lib/audio/model-registry';
import {
  modelDb,
  subscribeModelProgress,
  variantReadyFromMeta,
  type ModelAssetMetaRecord,
  type ModelDbProgress,
} from '@/lib/audio/model-cache';
import type { VoiceLanguage } from '@/lib/audio/local-voice';

/**
 * On-device engine variant selector for the Recitation Guide.
 *
 * Writes straight to the profile on click (matching the OfflinePanel pattern rather than the
 * main settings form's draft model, because a variant change triggers a model download that the
 * learner needs feedback on immediately). Readiness is resolved live per variant so the learner
 * sees "Cached" vs the download size before they choose. This is the *default* for all voice
 * modules; individual modules can override it inline via InlineEnginePicker, which wins over
 * this preference. No automatic fallback: the chosen variant downloads as-is and failures are
 * surfaced instead of silently switching voices.
 *
 * Readiness comes from the blob-free metadata table and is derived in a `useMemo`.
 *
 * It used to be an async effect keyed on `[preferred, rows]`, where `rows` was a live query over
 * the *blob* table — the very table a download writes to ~50 times per asset. Every progress tick
 * therefore changed `rows`, re-ran the effect, and issued three fresh per-variant database reads
 * that each deserialised every cached blob. A single 180 MB download produced hundreds of
 * full-table blob hydrations. A live query over the metadata table plus a pure comparison removes
 * the read entirely, and with it the feedback loop.
 */

const MB = 1024 * 1024;

function formatBytes(bytes: number): string {
  return `${(bytes / MB).toFixed(1)} MB`;
}

/**
 * Sample lines for the voice test.
 *
 * Coaching speech, never Quranic text — this app does not synthesize scripture, and a test line is
 * the last place to start. Each is long enough to be judged as a voice rather than a click.
 */
const VOICE_TEST_PHRASES: Record<VoiceLanguage, string> = {
  en: 'As-salamu alaykum. Your English coaching voice is ready.',
  ta: 'அஸ்ஸலாமு அலைக்கும். உங்கள் தமிழ் வழிகாட்டி குரல் தயாராக உள்ளது.',
};

type VoiceTestState =
  | { language: VoiceLanguage; state: 'speaking' }
  | { language: VoiceLanguage; state: 'failed'; detail: string | null };

export interface EngineVariantSelectorProps {
  /** The saved preference (undefined = 'balanced'). */
  value: CoachModelVariant | undefined;
  /** Called with the newly chosen variant id; the parent persists it. */
  onChange: (variant: CoachModelVariant) => void;
}

export function EngineVariantSelector({ value, onChange }: EngineVariantSelectorProps) {
  const preferred = value ?? 'balanced';
  const [downloadingId, setDownloadingId] = useState<CoachModelVariant | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [voiceTest, setVoiceTest] = useState<VoiceTestState | null>(null);

  const metaRows = useLiveQuery(async () => modelDb.modelAssetMeta.toArray(), []);

  const { readyMap, activeVariant } = useMemo(() => {
    const ready: Partial<Record<CoachModelVariant, boolean>> = {};
    const variants = Object.values(MODEL_VARIANTS);
    for (const variant of variants) {
      ready[variant.id] = variantReadyFromMeta(variant, metaRows ?? []);
    }

    /*
     * Informational only, and deliberately read as *"the first cached variant in preference
     * order"* rather than as a fallback chain: nothing is ever substituted for the learner's
     * choice on the download path (`ensureVariantDownloaded` downloads exactly what was picked).
     * This just names which cached engine the module would actually run today.
     */
    let active: CoachModelVariant | null = null;
    const order: CoachModelVariant[] = [preferred, ...variants.map((variant) => variant.id)];
    for (const candidate of order) {
      if (ready[candidate]) {
        active = candidate;
        break;
      }
    }

    return { readyMap: ready, activeVariant: active };
  }, [metaRows, preferred]);

  // While a download streams (from here or the coach page), flip the card's status text from
  // "~X MB to download" to a live spinner the moment bytes start moving.
  useEffect(() => {
    const unsubscribe = subscribeModelProgress((progress: ModelDbProgress) => {
      setStreaming(progress.state === 'downloading');
    });
    return unsubscribe;
  }, []);

  const checking = metaRows === undefined;

  /**
   * Speaks a sample line with the selected variant to prove the on-device voice works.
   *
   * The registry has always shipped these voices, but nothing used to run them, and a voice that
   * silently cannot run is indistinguishable from one that works until a learner needs it mid
   * lesson. The test resolves against the selected variant rather than the module preference, so
   * "Cached — works offline" becomes something the learner can hear before trusting it.
   */
  const testVoice = async (language: VoiceLanguage): Promise<void> => {
    setVoiceTest({ language, state: 'speaking' });
    const { localVoiceStatus, speakLocalVoice } = await import('@/lib/audio/local-voice');
    const spoke = await speakLocalVoice(language, VOICE_TEST_PHRASES[language], {
      key: `settings-voice-test:${language}`,
      variantOverride: preferred,
    });
    setVoiceTest(spoke ? null : { language, state: 'failed', detail: localVoiceStatus().lastError });
  };

  const handleSelect = async (variantId: CoachModelVariant): Promise<void> => {
    onChange(variantId);
    if (variantId !== preferred) {
      /*
       * The resident voice belongs to the variant being left behind. Dropping it here (rather
       * than at the next cue) means the switch costs one worker boot instead of holding a 63 MB
       * session open for a voice the learner no longer uses.
       */
      const { releaseLocalVoice } = await import('@/lib/audio/local-voice');
      releaseLocalVoice();
      setVoiceTest(null);
    }
    if (readyMap[variantId]) return;

    /*
     * Downloading here, in Settings, is deliberate: the previous behaviour only *polled*
     * readiness and relied on the learner later visiting /quran/coach to start the transfer,
     * so this card showed "Preparing…" forever when they didn't. Shared assets are skipped, so
     * only the changed voice downloads, and a failure leaves the card showing the size so the
     * coach page can offer the retry flow with full progress reporting.
     */
    setDownloadingId(variantId);
    try {
      const { ensurePreferredVariantReady } = await import('@/lib/audio/model-cache');
      await ensurePreferredVariantReady(variantId);
    } catch {
      // Readiness stays false; the live metadata query is the single source of truth either way,
      // so there is no local state to roll back.
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-3 pt-2 border-t border-border">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
          4. On-device engine
        </h4>
        <span className="text-[11px] text-muted-foreground">
          {checking ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> Checking…
            </span>
          ) : (
            'Used when the cloud coach is unavailable'
          )}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {Object.values(MODEL_VARIANTS).map((variant) => {
          const isSelected = preferred === variant.id;
          const isReady = readyMap[variant.id] === true;
          const isActive = activeVariant === variant.id;
          const isDownloading = downloadingId === variant.id;
          return (
            <button
              key={variant.id}
              type="button"
              onClick={() => void handleSelect(variant.id)}
              className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col gap-1.5 ${
                isSelected
                  ? 'border-primary bg-primary-subtle ring-2 ring-primary/20'
                  : 'border-border bg-surface hover:bg-surface-hover'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <Cpu className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
                  {variant.label}
                </span>
                {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
              </div>
              <span className="text-[10px] text-muted-foreground leading-snug">{variant.descriptionEn}</span>
              <span className="text-[10px] font-semibold text-info-strong">
                {isDownloading || (streaming && isSelected && !isReady) ? (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> Preparing…
                  </span>
                ) : isReady ? (
                  'Cached — works offline'
                ) : (
                  `${formatBytes(variantTotalBytes(variant))} to download`
                )}
              </span>
              {/* `isActive` already implies ready — the variant was selected *because* it is
                  cached — so the old `isActive && !isReady` guard could never be true. */}
              {isActive && (
                <span className="text-[10px] font-semibold text-success-strong">
                  Currently cached and active
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground">
        This is the default engine for every voice module. Each module — Recitation Guide, voice
        storyteller, recitation coach — can override it with its own inline picker, and an inline
        pick always wins. Switching voices only downloads the changed voice file.
      </p>

      {/*
       * Voice test.
       *
       * Tamil is the reason this exists: most desktops ship no Tamil voice, so before this the
       * first time a learner discovered their coaching voice could not speak was mid-lesson. The
       * buttons are the same code path a real cue takes, so what is heard here is what they get.
       */}
      <div className="rounded-2xl border border-border bg-surface p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Volume2 className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
          <span className="text-[11px] font-bold text-foreground">Test the on-device voice</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(['ta', 'en'] as const).map((language) => {
            const isTesting = voiceTest?.language === language && voiceTest.state === 'speaking';
            return (
              <button
                key={language}
                type="button"
                disabled={!readyMap[preferred] || isTesting}
                onClick={() => void testVoice(language)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-card text-[11px] font-semibold text-foreground hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isTesting ? (
                  <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                ) : (
                  <Volume2 className="w-3 h-3" aria-hidden="true" />
                )}
                <span>{language === 'ta' ? 'தமிழ்' : 'English'}</span>
              </button>
            );
          })}
          {!readyMap[preferred] && (
            <span className="text-[11px] text-muted-foreground">
              Download this variant to test its voices.
            </span>
          )}
        </div>
        {voiceTest?.state === 'failed' && (
          <p className="text-[11px] text-danger-strong">
            That voice could not speak on this device. The coaching text is still shown in the
            lesson, and the platform voice — when one exists — is used instead.
            {voiceTest.detail ? <span className="block text-muted-foreground">{voiceTest.detail}</span> : null}
          </p>
        )}
      </div>
    </div>
  );
}

// Live progress ticks are surfaced through the shared download progress store so the "Preparing…"
// state reflects real stream progress when a download starts elsewhere (the coach page).
export type { ModelDbProgress, ModelAssetMetaRecord };
