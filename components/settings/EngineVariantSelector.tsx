'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Cpu, Loader2 } from 'lucide-react';
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

  const handleSelect = async (variantId: CoachModelVariant): Promise<void> => {
    onChange(variantId);
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
    </div>
  );
}

// Live progress ticks are surfaced through the shared download progress store so the "Preparing…"
// state reflects real stream progress when a download starts elsewhere (the coach page).
export type { ModelDbProgress, ModelAssetMetaRecord };
