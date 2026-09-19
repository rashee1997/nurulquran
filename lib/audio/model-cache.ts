'use client';

import Dexie, { type Table } from 'dexie';
import {
  MODEL_VARIANTS,
  MODEL_BUDGET_BYTES,
  MODEL_TOTAL_BUDGET_BYTES,
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
 * the runtime resolves which one to use through `resolvePreferredVariant` — exactly the chosen
 * variant, with no automatic fallback chain.
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

/**
 * The same row, without the binary.
 *
 * Readiness, the download snapshot and the stored-byte total only ever needed four scalar fields,
 * yet they were answered with `modelAssets.where('state').equals('ready').toArray()` — which makes
 * IndexedDB deserialise **every ready Blob** (up to ~180 MB) just to read `.size` off it. The
 * coach page polled that every four seconds and the engine-variant card re-ran it for all three
 * variants on every progress tick, so the check was far more expensive than the download it was
 * reporting on. The derived fields live in their own blob-free table, which makes all three reads
 * cheap; the blob table is touched only when a blob is actually needed (the worker init).
 */
export interface ModelAssetMetaRecord {
  id: string;
  state: ModelAssetState;
  bytesReceived: number;
  bytesExpected: number;
  error?: string;
  downloadedAt?: string;
}

function toMeta(record: ModelAssetRecord): ModelAssetMetaRecord {
  return {
    id: record.id,
    state: record.state,
    bytesReceived: record.bytesReceived,
    bytesExpected: record.bytesExpected,
    ...(record.error === undefined ? {} : { error: record.error }),
    ...(record.downloadedAt === undefined ? {} : { downloadedAt: record.downloadedAt }),
  };
}

/** True when a metadata row proves the asset is cached and complete. */
function isMetaIntact(meta: ModelAssetMetaRecord | undefined, asset: ModelAsset): boolean {
  return meta?.state === 'ready' && meta.bytesReceived === asset.bytes;
}

/**
 * Whether a variant is fully cached, from metadata alone.
 *
 * Exported so a UI can answer the same question from a live query over the metadata table instead
 * of awaiting a per-variant database read.
 */
export function variantReadyFromMeta(
  variant: ModelVariant,
  metas: readonly ModelAssetMetaRecord[]
): boolean {
  const byId = new Map(metas.map((meta) => [meta.id, meta]));
  return variant.assets.every((asset) => isMetaIntact(byId.get(asset.id), asset));
}

class ModelDatabase extends Dexie {
  modelAssets!: Table<ModelAssetRecord, string>;
  modelAssetMeta!: Table<ModelAssetMetaRecord, string>;

  constructor() {
    super('NurulQuranModelDB');
    this.version(1).stores({
      modelAssets: 'id, state',
    });
    // v2 adds the blob-free metadata table. Additive: existing rows are transcribed into it on
    // upgrade, so a learner who already downloaded a variant keeps it.
    this.version(2)
      .stores({
        modelAssets: 'id, state',
        modelAssetMeta: 'id, state',
      })
      .upgrade(async (transaction) => {
        const rows = await transaction.table<ModelAssetRecord, string>('modelAssets').toArray();
        await transaction.table<ModelAssetMetaRecord, string>('modelAssetMeta').bulkPut(rows.map(toMeta));
      });
  }
}

export const modelDb = new ModelDatabase();

/* -------------------------------------------------------------------------- */
/* Read helpers                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Ready blobs for an explicit asset list (used by the worker inits).
 *
 * Fetched by primary key rather than by scanning `state === 'ready'`: a learner with more than one
 * variant cached would otherwise have every *other* variant's blobs deserialised too — another
 * ~130 MB of IndexedDB reads to hand the worker the ~180 MB it actually asked for.
 *
 * The voice layer passes just the two assets it runs — one voice and its config — for the same
 * reason: reading the recitation engine's ~180 MB of blobs to hand the voice worker the 63 MB it
 * asked for is the waste this fetch pattern exists to avoid.
 */
export async function getAssetBlobs(assets: readonly ModelAsset[]): Promise<Map<string, Blob>> {
  const rows = await modelDb.modelAssets.bulkGet(assets.map((asset) => asset.id));
  const map = new Map<string, Blob>();
  for (const row of rows) {
    if (row?.state === 'ready' && row.blob) map.set(row.id, row.blob);
  }
  return map;
}

/** All ready blobs for the given variant's asset ids (used by the engine worker init). */
export async function getReadyBlobs(variant: ModelVariant): Promise<Map<string, Blob>> {
  return getAssetBlobs(variant.assets);
}

export async function getModelSnapshot(): Promise<ModelDbProgress[]> {
  const rows = await modelDb.modelAssetMeta.toArray();
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

/** Bytes occupied by every cached asset, from metadata alone (no blob is deserialised). */
export async function totalStoredModelBytes(): Promise<number> {
  const rows = await modelDb.modelAssetMeta.where('state').equals('ready').toArray();
  return rows.reduce((sum, row) => sum + row.bytesReceived, 0);
}

/** Whether one specific variant is fully cached and byte-verified. */
export async function isVariantReady(variant: ModelVariant): Promise<boolean> {
  const rows = await modelDb.modelAssetMeta.toArray();
  return variantReadyFromMeta(variant, rows);
}

/**
 * Resolves the learner's preference to a single variant — no fallback chain. The returned
 * `ready` flag tells the caller whether the chosen variant still needs downloading; when it is
 * false, `variant` is the download target, and a failed download surfaces as an error rather
 * than silently switching to a different voice.
 */
export async function resolvePreferredVariant(
  preferred: CoachModelVariant
): Promise<{ variant: ModelVariant; ready: boolean }> {
  const variant = MODEL_VARIANTS[preferred] ?? MODEL_VARIANTS.balanced;
  return { variant, ready: await isVariantReady(variant) };
}

/** Legacy convenience name kept for the coach page gate. */
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
  // The blob and its blob-free metadata row are written together in one transaction, so the two
  // can never disagree about whether an asset is cached.
  await modelDb.transaction('rw', modelDb.modelAssets, modelDb.modelAssetMeta, async () => {
    await modelDb.modelAssets.put(record);
    await modelDb.modelAssetMeta.put(toMeta(record));
  });
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
    /*
     * Two ceilings, because they answer different questions.
     *
     * The per-variant check is the one that was mis-set at 180 MB and aborted every download
     * before a byte was fetched; it rejects a variant whose own plan is oversized. It does not
     * bound the disk, since variants coexist and each swaps one voice — so the bytes that this
     * download would actually *add* are summed against a total ceiling as well. Assets already
     * cached (the shared VAD/Whisper files, an unchanged voice) count for nothing here, which is
     * what keeps switching voices cheap.
     */
    const planned = variantTotalBytes(variant);
    if (planned > MODEL_BUDGET_BYTES) {
      throw new Error(
        `The "${variant.label}" variant needs ${(planned / 1048576).toFixed(1)} MB, which exceeds the ${(MODEL_BUDGET_BYTES / 1048576).toFixed(0)} MB per-variant budget.`
      );
    }

    const metas = await modelDb.modelAssetMeta.toArray();
    const byId = new Map(metas.map((meta) => [meta.id, meta]));
    const missing = variant.assets.reduce(
      (sum, asset) => (isMetaIntact(byId.get(asset.id), asset) ? sum : sum + asset.bytes),
      0
    );

    const stored = metas.reduce((sum, meta) => (meta.state === 'ready' ? sum + meta.bytesReceived : sum), 0);
    if (stored + missing > MODEL_TOTAL_BUDGET_BYTES) {
      throw new Error(
        `Caching "${variant.label}" would use ${((stored + missing) / 1048576).toFixed(0)} MB of on-device models, over the ${(MODEL_TOTAL_BUDGET_BYTES / 1048576).toFixed(0)} MB total budget. Free space from Settings → Offline first.`
      );
    }

    let done = 0;
    for (const asset of variant.assets) {
      if (!isMetaIntact(byId.get(asset.id), asset)) {
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
 * Ensures the learner's chosen variant is available — exactly that variant, no fallback. Throws
 * with the underlying error when the download fails so callers can surface it inline.
 */
export async function ensurePreferredVariantReady(
  preferred: CoachModelVariant,
  onProgress?: (done: number, total: number) => void
): Promise<{ variant: ModelVariant; error?: undefined }> {
  const variant = MODEL_VARIANTS[preferred] ?? MODEL_VARIANTS.balanced;
  try {
    await ensureVariantDownloaded(variant, onProgress);
    return { variant };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Download failed.';
    throw new Error(`${variant.label}: ${message}`);
  }
}

/** Removes every cached model (settings "Free up space" action). */
export async function deleteAllModels(): Promise<void> {
  await modelDb.transaction('rw', modelDb.modelAssets, modelDb.modelAssetMeta, async () => {
    await modelDb.modelAssets.clear();
    await modelDb.modelAssetMeta.clear();
  });
}
