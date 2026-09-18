'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Download, Trash2, Check, Loader2, WifiOff } from 'lucide-react';
import { downloadSurah, formatBytes, isSurahDownloaded, removeSurahDownload, surahAudioUrls } from '@/lib/quran/downloads';

interface DownloadSurahControlProps {
  surahId: number;
  reciterId: string;
  versesCount: number;
}

/**
 * "Download this surah" control for the reader header. It caches the surah's text (via
 * the normal provider path) and every ayah's recitation audio for the current reciter, so
 * the surah reads and plays with the network off. A different reciter is a different
 * download — switching reciters after downloading needs a new download, which is stated
 * plainly rather than silently playing a reciter that was never fetched.
 */
export const DownloadSurahControl: React.FC<DownloadSurahControlProps> = ({ surahId, reciterId, versesCount }) => {
  const [downloaded, setDownloaded] = useState<boolean | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clears the stale answer while the async cache lookup for the new surah/reciter is in flight
    setDownloaded(null);
    isSurahDownloaded(surahId, reciterId)
      .then((value) => {
        if (active) setDownloaded(value);
      })
      .catch(() => {
        if (active) setDownloaded(false);
      });
    return () => {
      active = false;
    };
  }, [surahId, reciterId]);

  const estimatedSize = versesCount * 220 * 1024; // ~220 KB/ayah at 128 kbps, a rough guide only.

  const handleDownload = useCallback(async () => {
    setError(null);
    setProgress({ done: 0, total: versesCount });
    try {
      await downloadSurah(surahId, reciterId, {
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setDownloaded(true);
    } catch (err) {
      console.error(`Download of surah ${surahId} failed:`, err);
      setError('The download could not finish. Check your connection and try again.');
    } finally {
      setProgress(null);
    }
  }, [reciterId, surahId, versesCount]);

  const handleRemove = useCallback(async () => {
    try {
      await removeSurahDownload(surahId, reciterId);
      setDownloaded(false);
    } catch (err) {
      console.error(`Could not remove the download for surah ${surahId}:`, err);
    }
  }, [reciterId, surahId]);

  if (progress) {
    const percent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Downloading surah ${surahId} for offline use`}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-hero-card-bg border border-hero-border text-hero-fg text-xs font-semibold"
      >
        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
        <span>
          Downloading… {progress.done}/{progress.total}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={() => void (downloaded ? handleRemove() : handleDownload())}
        disabled={downloaded === null}
        aria-pressed={downloaded === true}
        className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold backdrop-blur-xs transition-all border ${
          downloaded
            ? 'bg-success-subtle border-success/40 text-success-strong hover:bg-danger-subtle hover:text-danger-strong hover:border-danger/40'
            : 'bg-hero-card-bg hover:bg-hero-pill-bg text-hero-fg border-hero-border'
        }`}
        title={
          downloaded
            ? `Downloaded for offline reading with ${surahAudioUrls(surahId, reciterId).length} audio clips. Tap to remove.`
            : `Save this surah's text and recitation (~${formatBytes(estimatedSize)}) for offline use.`
        }
      >
        {downloaded === null ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        ) : downloaded ? (
          <>
            <Check className="w-4 h-4" aria-hidden="true" />
            <span>Downloaded</span>
          </>
        ) : (
          <>
            <Download className="w-4 h-4" aria-hidden="true" />
            <span>Download for offline</span>
          </>
        )}
      </button>
      {error && (
        <span className="flex items-center gap-1 text-[10px] text-danger-strong">
          <WifiOff className="w-3 h-3" aria-hidden="true" />
          {error}
        </span>
      )}
    </div>
  );
};
