'use client';

import Dexie, { type Table } from 'dexie';
import { MODEL_ASSETS, MODEL_BUDGET_BYTES, TOTAL_REGISTRY_BYTES } from '@/lib/audio/model-registry';

/**
 * Model asset persistence and download management.
 *
 * Model binaries live in their own IndexedDB database (`NurulQuranModelDB`) rather than in the
 * main Dexie database: a 50 MB decoder blob has no business being swept into the learner-data
 * backup tables, and a fresh database keeps the upgrade paths independent.
 *
 * Progress uses the stream reader pattern: the response body is read chunk by chunk and both the
 * partially assembled blob and the byte count are updated, so the UI shows real megabytes instead
 * of an indeterminate spinner. Interrupted downloads leave a partial row with `state: 'partial'`,
 * which the next attempt resumes from zero — model CDNs do not offer range-resumable semantics we
 * can rely on inside a browser blob, so a clean restart is more honest than a fake resume.
 */

export type ModelAssetState = 'missing' | 'downloading' | 'partial' | 'ready' | 'error';

export interface ModelAssetRecord {
  id: string;
  state: ModelAssetState;
  /** The complete binary once `state === 'ready'`. Absent (undefined) while partial. */
  blob?: Blob;
  /** Bytes received so far — drives the progress bar for both partial and complete rows. */
  bytesReceived: number;
  /** Expected total from the registry; a mismatch on completion fails the integrity check. */
  bytesExpected: number;
  error?: string;
  downloadedAt?: string;
}

export interface ModelDbProgress {
  id: string;
  label: string;
  state: ModelAssetState;
  bytesReceived: number;
  bytesExpected: number;
  error?: string;
}

class ModelDatabase extends Dexie {
  modelAssets!: Table<ModelAssetRecord, string>;

  constructor() {
    super('NurulQuranModelDB');
    this.version(1).stores({
      modelAssets: 'id, state',
    });
  }
}

export const modelDb = new ModelDatabase();

/* -------------------------------------------------------------------------- */
/* Read helpers (reactive via dexie-react-hooks in the UI)                     */
/* -------------------------------------------------------------------------- */

export async function getReadyBlobs(): Promise<Map<string, Blob>> {
  const rows = await modelDb.modelAssets.where('state').equals('ready').toArray();
  const map = new Map<string, Blob>();
  for (const row of rows) {
    if (row.blob) map.set(row.id, row.blob);
  }
  return map;
}

export async function getModelSnapshot(): Promise<ModelDbProgress[]> {
  const rows = await modelDb.modelAssets.toArray();
  const byId = new Map(rows.map((row) => [row.id, row]));
  // Every registry asset is reported, even before its first download attempt.
  return MODEL_ASSETS.map((asset) => {
    const row = byId.get(asset.id);
    return {
      id: asset.id,
      label: asset.label,
      state: row?.state ?? 'missing',
      bytesReceived: row?.bytesReceived ?? 0,
      bytesExpected: asset.bytes,
      error: row?.error,
    };
  });
}

export async function totalStoredModelBytes(): Promise<number> {
  const rows = await modelDb.modelAssets.where('state').equals('ready').toArray();
  return rows.reduce((sum, row) => sum + (row.blob?.size ?? 0), 0);
}

/**
 * Whether every registry asset is cached and verified. The engine refuses to start otherwise:
 * a half-present model directory would produce runtime failures far less clear than this gate.
 */
export async function areAllModelsReady(): Promise<boolean> {
  const rows = await modelDb.modelAssets.where('state').equals('ready').toArray();
  return MODEL_ASSETS.every((asset) => {
    const row = rows.find((candidate) => candidate.id === asset.id);
    return row !== undefined && row.blob !== undefined && row.blob.size === asset.bytes;
  });
}

/* -------------------------------------------------------------------------- */
/* Download manager                                                            */
/* -------------------------------------------------------------------------- */

let activeDownload = false;
const progressListeners = new Set<(progress: ModelDbProgress) => void>();

/** Subscribes to per-asset progress ticks for live UI updates without Dexie live queries. */
export function subscribeModelProgress(listener: (progress: ModelDbProgress) => void): () => void {
  progressListeners.add(listener);
  return () => {
    progressListeners.delete(listener);
  };
}

function emitProgress(progress: ModelDbProgress): void {
  for (const listener of progressListeners) listener(progress);
}

async function putAndEmit(record: ModelAssetRecord, label: string): Promise<void> {
  await modelDb.modelAssets.put(record);
  emitProgress({
    id: record.id,
    label,
    state: record.state,
    bytesReceived: record.bytesReceived,
    bytesExpected: record.bytesExpected,
    error: record.error,
  });
}

/**
 * Downloads one asset with streamed progress and byte-length integrity verification.
 *
 * `ReadableStreamDefaultReader` (via `response.body.getReader()`) is used rather than
 * `response.blob()` because the latter reports no progress: the learner would stare at a
 * spinner for 63 MB. Chunks are accumulated into an array and joined once at the end, which
 * avoids per-chunk blob copies.
 */
async function downloadAsset(assetId: string): Promise<void> {
  const asset = MODEL_ASSETS.find((entry) => entry.id === assetId);
  if (!asset) throw new Error(`Unknown model asset: ${assetId}`);

  const base: ModelAssetRecord = {
    id: asset.id,
    state: 'downloading',
    bytesReceived: 0,
    bytesExpected: asset.bytes,
  };
  await putAndEmit(base, asset.label);

  try {
    const response = await fetch(asset.url);
    if (!response.ok) {
      throw new Error(`The CDN answered ${response.status} for ${asset.label}.`);
    }

    const body = response.body;
    if (!body) throw new Error(`${asset.label} could not be streamed (no response body).`);

    const reader: ReadableStreamDefaultReader<Uint8Array> = body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    let lastEmit = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.byteLength;
        // Throttle the UI to ~10 updates/second; every-chunk emission floods React.
        if (received - lastEmit > asset.bytes / 50 || received === asset.bytes) {
          lastEmit = received;
          await putAndEmit({ ...base, bytesReceived: received }, asset.label);
        }
      }
    }

    const blob = new Blob(chunks as BlobPart[], { type: asset.mimeType });
    // Hard integrity check: the CDN advertised a byte length and the stream must match it.
    // A truncated response that "succeeded" would otherwise poison the runtime for weeks.
    if (blob.size !== asset.bytes) {
      throw new Error(
        `${asset.label} is incomplete: received ${blob.size} bytes, expected ${asset.bytes}.`
      );
    }

    await putAndEmit(
      {
        ...base,
        state: 'ready',
        blob,
        bytesReceived: blob.size,
        downloadedAt: new Date().toISOString(),
      },
      asset.label
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Download failed.';
    await putAndEmit(
      {
        ...base,
        state: 'error',
        error: message,
      },
      asset.label
    );
    throw error;
  }
}

/**
 * Downloads every missing/invalid asset, enforcing the storage budget before starting.
 *
 * Sequential rather than parallel on purpose: parallel 63 MB streams saturate the connection the
 * learner is also using for the app shell, and the progress UI becomes unreadable. The budget is
 * checked against the full registry, not the remaining assets, because a partial adoption of the
 * stack is not a supported configuration — the engine needs every model.
 */
export async function ensureAllModelsDownloaded(
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  if (activeDownload) return;
  activeDownload = true;

  try {
    const existing = await areAllModelsReady();
    if (existing) return;

    if (TOTAL_REGISTRY_BYTES > MODEL_BUDGET_BYTES) {
      throw new Error(
        `The model registry needs ${(TOTAL_REGISTRY_BYTES / 1048576).toFixed(1)} MB, which exceeds the ${(MODEL_BUDGET_BYTES / 1048576).toFixed(0)} MB budget.`
      );
    }

    let done = 0;
    for (const asset of MODEL_ASSETS) {
      const row = await modelDb.modelAssets.get(asset.id);
      const intact =
        row?.state === 'ready' && row.blob !== undefined && row.blob.size === asset.bytes;
      if (!intact) {
        await downloadAsset(asset.id);
      }
      done += 1;
      onProgress?.(done, MODEL_ASSETS.length);
    }
  } finally {
    activeDownload = false;
  }
}

/** Removes every cached model (settings "Free up space" action). */
export async function deleteAllModels(): Promise<void> {
  await modelDb.modelAssets.clear();
}
