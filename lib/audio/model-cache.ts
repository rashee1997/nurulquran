'use client';

import Dexie, { type Table } from 'dexie';
import {
  MODEL_VARIANTS,
  MODEL_BUDGET_BYTES,
  resolveVariantChain,
  variantTotalBytes,
  type CoachModelVariant,
  type ModelAsset,
  type ModelVariant,
} from '@/lib/audio/model-registry';

/**
 * Model asset persistence and download management — variant-aware.
 *
 * Model binaries live in their own IndexedDB database (`NurulQuranModelDB`) so a 50 MB decoder
 * blob never sweeps into the learner-data backup tables. Multiple variants may coexist on disk;
 * the runtime resolves which one to use through `resolvePreferredVariant`, which walks the
 * learner's chosen fallback chain and picks the first fully-cached variant.
 *
 * Progress uses the stream reader pattern: the response body is read chunk by chunk so the UI
 * shows real megabytes, and interrupted downloads leave a partial row that the next attempt
 * restarts cleanly (model CDNs do not offer browser-side range resumes).
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
/* Read helpers                                                                */
/* -------------------------------------------------------------------------- */

/** All ready blobs for the given variant's asset ids (used by the worker init). */
export async function getReadyBlobs(variant: ModelVariant): Promise<Map<string, Blob>> {
  const rows = await modelDb.modelAssets.where('state').equals('ready').toArray();
  const wanted = new Set(variant.assets.map((asset) => asset.id));
  const map = new Map<string, Blob>();
  for (const row of rows) {
    if (row.blob && wanted.has(row.id)) map.set(row.id, row.blob);
  }
  return map;
}

export async function getModelSnapshot(): Promise<ModelDbProgress[]> {
  const rows = await modelDb.modelAssets.toArray();
  const byId = new Map(rows.map((row) => [row.id, row]));
  // Union of every variant's assets so the panel shows all possible entries.
  const allAssets = new Map<string, ModelAsset>();
  for (const variant of Object.values(MODEL_VARIANTS)) {
    for (const asset of variant.assets) allAssets.set(asset.id, asset);
  }
  return [...allAssets.values()].map((asset) => {
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

/** Whether one specific variant is fully cached and byte-verified. */
export async function isVariantReady(variant: ModelVariant): Promise<boolean> {
  const rows = await modelDb.modelAssets.where('state').equals('ready').toArray();
  return variant.assets.every((asset) => {
    const row = rows.find((candidate) => candidate.id === asset.id);
    return row !== undefined && row.blob !== undefined && row.blob.size === asset.bytes;
  });
}

/**
 * Resolves the learner's preference to the best usable variant.
 *
 * Walks the fallback chain and returns the first variant that is fully cached. If none are
 * ready, the first variant in the chain is returned as the download target — the orchestrator
 * will then find nothing usable and surface the download prompt, which is the correct outcome
 * for "chosen variant never downloaded".
 */
export async function resolvePreferredVariant(
  preferred: CoachModelVariant
): Promise<{ variant: ModelVariant; ready: boolean; chain: ModelVariant[] }> {
  const chain = resolveVariantChain(preferred);
  for (const variant of chain) {
    if (await isVariantReady(variant)) {
      return { variant, ready: true, chain };
    }
  }
  return { variant: chain[0], ready: false, chain };
}

/**
 * Legacy convenience: whether the learner's preferred variant (or any fallback) is usable.
 * Kept because the coach page gates its UI on this shape.
 */
export async function areAllModelsReady(preferred: CoachModelVariant = 'balanced'): Promise<boolean> {
  const { ready } = await resolvePreferredVariant(preferred);
  return ready;
}

/* -------------------------------------------------------------------------- */
/* Download manager                                                            */
/* -------------------------------------------------------------------------- */

let activeDownload = false;
const progressListeners = new Set<(progress: ModelDbProgress) => void>();

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

/** Streams one asset with live progress and byte-length integrity verification. */
async function downloadAsset(asset: ModelAsset): Promise<void> {
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
        if (received - lastEmit > asset.bytes / 50 || received === asset.bytes) {
          lastEmit = received;
          await putAndEmit({ ...base, bytesReceived: received }, asset.label);
        }
      }
    }

    const blob = new Blob(chunks as BlobPart[], { type: asset.mimeType });
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
    await putAndEmit({ ...base, state: 'error', error: message }, asset.label);
    throw error;
  }
}

/**
 * Downloads one variant's full asset set, enforcing the budget before starting.
 *
 * Assets already cached (from another variant, e.g. the shared VAD/STT files) are skipped, so
 * switching voices only downloads the voice that actually changed.
 */
export async function ensureVariantDownloaded(
  variant: ModelVariant,
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  if (activeDownload) throw new Error('A model download is already running.');
  activeDownload = true;

  try {
    if (variantTotalBytes(variant) > MODEL_BUDGET_BYTES) {
      throw new Error(
        `The "${variant.label}" variant needs ${(variantTotalBytes(variant) / 1048576).toFixed(1)} MB, which exceeds the ${(MODEL_BUDGET_BYTES / 1048576).toFixed(0)} MB budget.`
      );
    }

    let done = 0;
    for (const asset of variant.assets) {
      const row = await modelDb.modelAssets.get(asset.id);
      const intact =
        row?.state === 'ready' && row.blob !== undefined && row.blob.size === asset.bytes;
      if (!intact) {
        await downloadAsset(asset);
      }
      done += 1;
      onProgress?.(done, variant.assets.length);
    }
  } finally {
    activeDownload = false;
  }
}

/**
 * Ensures the learner's preferred variant is available, falling back down the chain when the
 * preferred variant cannot be downloaded. Returns the variant that actually became ready (or
 * `null` when the whole chain failed, with the last error attached).
 */
export async function ensurePreferredVariantReady(
  preferred: CoachModelVariant,
  onProgress?: (done: number, total: number) => void
): Promise<{ variant: ModelVariant | null; error?: string }> {
  const chain = resolveVariantChain(preferred);
  let lastError: string | undefined;

  for (const variant of chain) {
    try {
      await ensureVariantDownloaded(variant, onProgress);
      if (await isVariantReady(variant)) {
        return { variant };
      }
      lastError = `${variant.label} did not verify after download.`;
    } catch (error: unknown) {
      lastError = error instanceof Error ? error.message : 'Download failed.';
      // Fall through to the next variant in the chain.
    }
  }
  return { variant: null, error: lastError };
}

/** Removes every cached model (settings "Free up space" action). */
export async function deleteAllModels(): Promise<void> {
  await modelDb.modelAssets.clear();
}
