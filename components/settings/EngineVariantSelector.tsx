'use client';

import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Cpu, Loader2 } from 'lucide-react';
import { db } from '@/lib/db';
import {
  MODEL_VARIANTS,
  variantTotalBytes,
  type CoachModelVariant,
} from '@/lib/audio/model-registry';
import { modelDb, isVariantReady, type ModelDbProgress } from '@/lib/audio/model-cache';

/**
 * On-device engine variant selector for the Recitation Guide.
 *
 * Writes straight to the profile on click (matching the OfflinePanel pattern rather than the
 * main settings form's draft model, because a variant change triggers a model download that the
 * learner needs feedback on immediately). Readiness is resolved live per variant so the learner
 * sees "Ready" vs "~63.2 MB to download" before they choose, and a fallback badge shows which
 * variant the coach will actually use when the preferred one is not cached.
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
  const [checking, setChecking] = useState(true);
  const [readyMap, setReadyMap] = useState<Partial<Record<CoachModelVariant, boolean>>>({});
  const [downloadingId, setDownloadingId] = useState<CoachModelVariant | null>(null);
  const [activeVariant, setActiveVariant] = useState<CoachModelVariant | null>(null);

  const rows = useLiveQuery(async () => modelDb.modelAssets.toArray(), []);
  useEffect(() => {
    let active = true;
    void (async () => {
      setChecking(true);
      const results: Partial<Record<CoachModelVariant, boolean>> = {};
      let resolved: CoachModelVariant | null = null;
      // Walk the preferred chain first: the active variant is the first cached one.
      for (const variant of Object.values(MODEL_VARIANTS)) {
        results[variant.id] = await isVariantReady(variant);
      }
      if (!active) return;
      setReadyMap(results);
      const chainOrder: CoachModelVariant[] = [preferred, ...Object.values(MODEL_VARIANTS).map((v) => v.id)];
      for (const candidate of chainOrder) {
        if (results[candidate]) {
          resolved = candidate;
          break;
        }
      }
      setActiveVariant(resolved);
      setChecking(false);
    })();
    return () => {
      active = false;
    };
  }, [preferred, rows]);

  const handleSelect = async (variantId: CoachModelVariant): Promise<void> => {
    onChange(variantId);
    if (!readyMap[variantId]) {
      // The choice is saved; the coach page's download flow handles the transfer. Re-checking
      // here is enough for the panel to reflect the state once blobs land.
      setDownloadingId(variantId);
      const poll = setInterval(async () => {
        const ready = await isVariantReady(MODEL_VARIANTS[variantId]);
        if (ready) {
          setReadyMap((previous) => ({ ...previous, [variantId]: true }));
          setDownloadingId(null);
          clearInterval(poll);
        }
      }, 3000);
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
                {isDownloading ? (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> Preparing…
                  </span>
                ) : isReady ? (
                  'Cached — works offline'
                ) : (
                  `${formatBytes(variantTotalBytes(variant))} to download`
                )}
              </span>
              {isActive && !isReady && (
                <span className="text-[10px] font-semibold text-success-strong">
                  Fallback active: using this engine now
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground">
        If your chosen engine&apos;s download fails, the coach automatically falls back to the next
        variant — feedback never stops. Switching voices only downloads the changed voice file.
      </p>
    </div>
  );
}

// Live progress ticks are surfaced through the shared download progress store so the "Preparing…"
// state reflects real stream progress when a download starts elsewhere (the coach page).
export type { ModelDbProgress };
