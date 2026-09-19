'use client';

import React, { useEffect, useState } from 'react';
import { Cpu, Cloud, Check, Loader2 } from 'lucide-react';
import {
  MODEL_VARIANTS,
  variantTotalBytes,
  type CoachModuleId,
  type ModuleEngineChoice,
} from '@/lib/audio/model-registry';
import { isVariantReady } from '@/lib/audio/model-cache';
import { db } from '@/lib/db';
import { showToast } from '@/lib/ui/toast';

/**
 * Inline engine picker for a voice module.
 *
 * Renders as a compact segmented control next to the module's primary action. The choice is
 * per-module (keyed by `moduleId` in `userProfile.moduleEngines`), so an inline pick always
 * wins over the Settings default — and picking "Default" returns the module to that Settings
 * preference without deleting anything.
 *
 * "Cloud" = Gemini Live/cloud HTTP path (the module's original behaviour). Each local variant
 * shows a live cached/to-download size badge; selecting a not-yet-cached variant starts its
 * download immediately with real byte progress on the badge.
 */

export interface InlineEnginePickerProps {
  moduleId: CoachModuleId;
  /** Compact mode omits the label row (for embedding in a toolbar). */
  compact?: boolean;
}

interface EngineOption {
  id: ModuleEngineChoice;
  label: string;
  hint: (ready: boolean) => string;
}

const OPTIONS: EngineOption[] = [
  { id: 'default', label: 'Default', hint: () => 'Uses the Settings engine' },
  { id: 'cloud', label: 'Cloud', hint: () => 'Gemini — needs connection' },
  ...Object.values(MODEL_VARIANTS).map((variant) => ({
    id: variant.id as ModuleEngineChoice,
    label: variant.label.replace(/ \(default\)$/, ''),
    hint: (ready: boolean) => (ready ? 'Cached — offline' : `${(variantTotalBytes(variant) / 1048576).toFixed(0)} MB to download`),
  })),
];

export function InlineEnginePicker({ moduleId, compact = false }: InlineEnginePickerProps) {
  const [choice, setChoice] = useState<ModuleEngineChoice>('default');
  const [readyMap, setReadyMap] = useState<Partial<Record<string, boolean>>>({});
  const [downloadingId, setDownloadingId] = useState<ModuleEngineChoice | null>(null);
  const [mounted, setMounted] = useState(false);

  // Load the saved per-module choice once.
  useEffect(() => {
    let active = true;
    void db.userProfile.get('default_user').then((profile) => {
      if (!active) return;
      const saved = profile?.moduleEngines?.[moduleId];
      if (saved) setChoice(saved);
      setMounted(true);
    });
    return () => {
      active = false;
    };
  }, [moduleId]);

  // Resolve which variants are already cached.
  useEffect(() => {
    let active = true;
    void (async () => {
      const results: Partial<Record<string, boolean>> = {};
      for (const [id, variant] of Object.entries(MODEL_VARIANTS)) {
        results[id] = await isVariantReady(variant);
      }
      if (active) setReadyMap(results);
    })();
    return () => {
      active = false;
    };
  }, [choice, downloadingId]);

  const handleSelect = async (next: ModuleEngineChoice): Promise<void> => {
    if (next === choice) return;
    setChoice(next);

    // Persist immediately — inline choices must survive a page reload like any setting.
    const profile = await db.userProfile.get('default_user');
    await db.userProfile.update('default_user', {
      moduleEngines: { ...profile?.moduleEngines, [moduleId]: next },
    });

    if (next !== 'cloud' && next !== 'default' && readyMap[next] !== true) {
      const variant = MODEL_VARIANTS[next];
      if (!variant) return;
      setDownloadingId(next);
      try {
        const { ensurePreferredVariantReady } = await import('@/lib/audio/model-cache');
        await ensurePreferredVariantReady(next);
        setReadyMap((previous) => ({ ...previous, [next]: true }));
        showToast(`${variant.label} is ready for this module.`, 'success');
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Download failed.';
        showToast(message, 'error');
        // Revert to Default so the module is never left pointing at an engine that is not there.
        setChoice('default');
        const latest = await db.userProfile.get('default_user');
        await db.userProfile.update('default_user', {
          moduleEngines: { ...latest?.moduleEngines, [moduleId]: 'default' },
        });
      } finally {
        setDownloadingId(null);
      }
    }
  };

  if (!mounted) return null;

  return (
    <div className={compact ? 'inline-flex' : 'space-y-1.5'}>
      {!compact && (
        <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
          <Cpu className="w-3 h-3" aria-hidden="true" /> Engine
        </span>
      )}
      <div className="inline-flex rounded-full border border-border bg-surface p-0.5 gap-0.5" role="radiogroup" aria-label={`Engine for ${moduleId}`}>
        {OPTIONS.map((option) => {
          const selected = choice === option.id;
          const isDownloading = downloadingId === option.id;
          const ready = readyMap[option.id] === true;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              title={option.hint(ready)}
              onClick={() => void handleSelect(option.id)}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                selected
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
              }`}
            >
              {option.id === 'cloud' ? (
                <Cloud className="w-3 h-3" aria-hidden="true" />
              ) : option.id === 'default' ? (
                <Check className="w-3 h-3" aria-hidden="true" />
              ) : (
                <Cpu className="w-3 h-3" aria-hidden="true" />
              )}
              {option.label}
              {isDownloading && <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />}
              {option.id !== 'cloud' && option.id !== 'default' && ready && !selected && (
                <span className="w-1.5 h-1.5 rounded-full bg-success-strong" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
