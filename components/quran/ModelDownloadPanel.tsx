'use client';

import { useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Loader2, Download, Cloud, CloudOff, Cpu } from 'lucide-react';
import { modelDb, subscribeModelProgress, type ModelDbProgress } from '@/lib/audio/model-cache';
import { MODEL_VARIANTS, type CoachModelVariant } from '@/lib/audio/model-registry';

/**
 * Model download + engine status panel for the local S2S coach.
 *
 * Download progress comes from two sources, merged: Dexie live queries provide the durable
 * state (what is on disk right now), while the in-flight stream reader ticks arrive through a
 * module-level external store so a 63 MB download visibly moves without waiting on IndexedDB
 * write latency. `useSyncExternalStore` keeps the live ticks render-scoped to this panel.
 */

interface LiveTick {
  [id: string]: ModelDbProgress | undefined;
}

let liveTicks: LiveTick = {};
const tickListeners = new Set<() => void>();

function notifyTicks(): void {
  for (const listener of tickListeners) listener();
}

// One subscription from the module wiring (the panel) drives progress into the store.
export function publishTick(progress: ModelDbProgress): void {
  liveTicks = { ...liveTicks, [progress.id]: progress };
  notifyTicks();
}

function subscribeTicks(listener: () => void): () => void {
  tickListeners.add(listener);
  return () => {
    tickListeners.delete(listener);
  };
}

function getTicks(): LiveTick {
  return liveTicks;
}

const MB = 1024 * 1024;

function formatBytes(bytes: number): string {
  return `${(bytes / MB).toFixed(1)} MB`;
}

/**
 * Variant-aware model download + engine status panel for the local S2S coach.
 *
 * `preferredVariant` is the learner's saved choice; the asset list shows that variant's
 * downloads so the progress bar tracks exactly what the coach needs. Download progress comes
 * from two sources, merged: Dexie live queries provide the durable state (what is on disk right
 * now), while the in-flight stream reader ticks arrive through a module-level external store so
 * a 63 MB download visibly moves without waiting on IndexedDB write latency.
 */
export const ModelDownloadPanel: React.FC<{ preferredVariant?: CoachModelVariant }> = ({
  preferredVariant = 'balanced',
}) => {
  useSyncExternalStore(subscribeTicks, getTicks, getTicks);

  const rows = useLiveQuery(async () => {
    const records = await modelDb.modelAssets.toArray();
    return new Map(records.map((row) => [row.id, row]));
  }, []);

  const variant = MODEL_VARIANTS[preferredVariant] ?? MODEL_VARIANTS.balanced;
  const assets = variant.assets;
  const totalBytes = assets.reduce((sum, asset) => sum + asset.bytes, 0);

  const totalReady = assets.reduce((sum, asset) => {
    const tick = liveTicks[asset.id];
    const record = rows?.get(asset.id);
    if (tick?.state === 'downloading' || tick?.state === 'partial') return sum + (tick.bytesReceived || 0);
    if (record?.state === 'ready' && record.blob) return sum + record.blob.size;
    return sum;
  }, 0);

  const anyDownloading = assets.some(
    (asset) => liveTicks[asset.id]?.state === 'downloading' || rows?.get(asset.id)?.state === 'downloading'
  );

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Cpu className="w-4 h-4 text-primary" aria-hidden="true" />
          On-device engine models
        </h3>
        <span className="text-[11px] font-semibold text-muted-foreground">
          {formatBytes(totalReady)} / {formatBytes(totalBytes)}
        </span>
      </div>

      <div className="h-1.5 rounded-full bg-surface overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((totalReady / totalBytes) * 100)}>
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${Math.min(100, (totalReady / totalBytes) * 100)}%` }}
        />
      </div>

      <ul className="space-y-1.5">
        {assets.map((asset) => {
          const tick = liveTicks[asset.id];
          const record = rows?.get(asset.id);
          const state = tick?.state ?? record?.state ?? 'missing';
          const received = tick?.bytesReceived ?? record?.bytesReceived ?? 0;
          return (
            <li key={asset.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-foreground truncate">{asset.label}</span>
              {state === 'ready' ? (
                <span className="inline-flex items-center gap-1 text-success-strong font-semibold">
                  <Cloud className="w-3.5 h-3.5" aria-hidden="true" /> Ready
                </span>
              ) : state === 'downloading' ? (
                <span className="inline-flex items-center gap-1.5 text-info-strong font-semibold">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  {formatBytes(received)}
                </span>
              ) : state === 'error' ? (
                <span className="inline-flex items-center gap-1 text-danger-strong font-semibold">
                  <CloudOff className="w-3.5 h-3.5" aria-hidden="true" /> Retry
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Download className="w-3.5 h-3.5" aria-hidden="true" /> {asset.sizeLabel}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {anyDownloading && (
        <p className="text-[11px] text-muted-foreground">
          Downloads continue in the background; the coach starts automatically once everything is cached.
        </p>
      )}
    </div>
  );
};

