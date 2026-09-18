import { db } from '@/lib/db';
import { getChapterMetadata } from '@/lib/quran/surahs';
import { quranProvider } from '@/lib/quran/alquran-cloud';
import { reciterAudioUrl } from '@/lib/quran/reciters';
import { cacheUrlsViaServiceWorker, evictUrlsViaServiceWorker, type DownloadProgressHandlers } from '@/lib/pwa/register';
import { track } from '@/lib/telemetry/events';

/** Global ayah numbers (1–6236) for a whole surah, used to build reciter audio URLs. */
function globalAyahRange(surahId: number): number[] {
  const chapter = getChapterMetadata(surahId);
  let offset = 0;
  for (let id = 1; id < surahId; id++) offset += getChapterMetadata(id).versesCount;
  return Array.from({ length: chapter.versesCount }, (_, i) => offset + 1 + i);
}

/**
 * Every clip a surah needs from one reciter, at the bitrate that reciter is published at.
 *
 * The URL is built by the same function the player uses, so a download can never cache a
 * different file (or a different bitrate) than the one playback will request — which is what
 * made "Download for offline" useless for the Abdul Basit edition, whose 128 kbps path the CDN
 * answers with HTTP 403.
 */
export function surahAudioUrls(surahId: number, reciterId: string): string[] {
  return globalAyahRange(surahId).map((n) => reciterAudioUrl(reciterId, n));
}

function downloadMarkerKey(surahId: number, reciterId: string): string {
  return `download:${surahId}:${reciterId}`;
}

/** Whether a surah's text and audio for `reciterId` were fully downloaded. */
export async function isSurahDownloaded(surahId: number, reciterId: string): Promise<boolean> {
  const marker = await db.quranCache.get(downloadMarkerKey(surahId, reciterId));
  return marker !== undefined;
}

/**
 * Downloads a surah for offline use: fetches every verse (populating the text cache, the
 * same one the reader already reads from) and warms the service worker's audio cache for
 * every ayah at the given reciter. Progress covers the audio phase, which dominates size.
 */
export async function downloadSurah(
  surahId: number,
  reciterId: string,
  handlers: DownloadProgressHandlers = {}
): Promise<void> {
  await quranProvider.getChapterVerses(surahId);
  const urls = surahAudioUrls(surahId, reciterId);
  await cacheUrlsViaServiceWorker('audio', urls, handlers);
  await db.quranCache.put({
    key: downloadMarkerKey(surahId, reciterId),
    data: { surahId, reciterId, ayahCount: urls.length },
    cachedAt: Date.now(),
  });
  track('download.completed', { surah: surahId, reciter: reciterId, ayahs: urls.length });
}

export async function removeSurahDownload(surahId: number, reciterId: string): Promise<void> {
  const urls = surahAudioUrls(surahId, reciterId);
  await evictUrlsViaServiceWorker('audio', urls);
  await db.quranCache.delete(downloadMarkerKey(surahId, reciterId));
  track('download.removed', { surah: surahId, reciter: reciterId });
}

/** Every surah currently marked downloaded, across all reciters. */
export async function listDownloadedSurahs(): Promise<Array<{ surahId: number; reciterId: string; ayahCount: number }>> {
  const rows = await db.quranCache.filter((row) => row.key.startsWith('download:')).toArray();
  return rows
    .map((row) => row.data as { surahId: number; reciterId: string; ayahCount: number })
    .filter((data) => typeof data?.surahId === 'number' && typeof data?.reciterId === 'string');
}

/** Estimated bytes used by the audio cache, when the browser exposes storage estimates. */
export async function estimateStorageUsage(): Promise<{ usage: number; quota: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
  try {
    const { usage, quota } = await navigator.storage.estimate();
    return { usage: usage ?? 0, quota: quota ?? 0 };
  } catch {
    return null;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}
