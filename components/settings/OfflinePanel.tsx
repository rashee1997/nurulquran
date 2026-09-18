'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, Trash2, Smartphone, HardDrive, RefreshCw, CheckCircle2 } from 'lucide-react';
import { SURAHS } from '@/lib/quran/surahs';
import { estimateStorageUsage, formatBytes, listDownloadedSurahs, removeSurahDownload } from '@/lib/quran/downloads';
import { isInstallable, isRunningStandalone, promptInstall, subscribeToInstallability } from '@/lib/pwa/register';

function surahName(id: number): string {
  return SURAHS.find((s) => s.id === id)?.nameSimple ?? `Surah ${id}`;
}

/**
 * Install prompt, storage estimate and the list of surahs downloaded for offline use.
 * A real gauge of what "local-first" costs on disk, and a way to reclaim it.
 */
export const OfflinePanel: React.FC = () => {
  const [installable, setInstallable] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [downloads, setDownloads] = useState<Array<{ surahId: number; reciterId: string; ayahCount: number }>>([]);
  const [removing, setRemoving] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [usage, list] = await Promise.all([estimateStorageUsage(), listDownloadedSurahs()]);
    setStorage(usage);
    setDownloads(list.sort((a, b) => a.surahId - b.surahId));
  }, []);

  useEffect(() => {
    // Reads two synchronous platform APIs (installability and display-mode) on mount,
    // then subscribes for later changes; not a derived-state loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot read of browser install/display-mode state on mount
    setInstallable(isInstallable());
    setStandalone(isRunningStandalone());
    void refresh();
    return subscribeToInstallability(setInstallable);
  }, [refresh]);

  const handleInstall = async () => {
    const accepted = await promptInstall();
    if (accepted) setInstallable(false);
  };

  const handleRemove = async (surahId: number, reciterId: string) => {
    const key = `${surahId}:${reciterId}`;
    setRemoving(key);
    try {
      await removeSurahDownload(surahId, reciterId);
      await refresh();
    } finally {
      setRemoving(null);
    }
  };

  const usagePercent = storage && storage.quota > 0 ? Math.min(100, Math.round((storage.usage / storage.quota) * 100)) : null;

  return (
    <div id="offline-settings-section" className="p-6 rounded-3xl bg-card border border-border shadow-xs space-y-5">
      <div className="space-y-1">
        <h3 className="text-sm font-bold text-foreground">Offline &amp; installation</h3>
        <p className="text-xs text-muted-foreground">
          Install NurulQuran as an app and download surahs so the reader, audio and your progress work with the network off.
        </p>
      </div>

      {standalone ? (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-success-subtle border border-success/30 text-success-strong text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>Running as an installed app.</span>
        </div>
      ) : installable ? (
        <button
          type="button"
          onClick={() => void handleInstall()}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold shadow-md transition-all"
        >
          <Smartphone className="w-4 h-4" />
          <span>Install NurulQuran</span>
        </button>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Your browser will offer to install this app once it decides the criteria are met, or use its menu&apos;s
          &quot;Add to Home Screen&quot; / &quot;Install app&quot; option directly.
        </p>
      )}

      <div className="pt-3 border-t border-border space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <HardDrive className="w-4 h-4 text-primary" />
            Storage used on this device
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-hover"
            aria-label="Refresh storage usage"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
        {storage ? (
          <div className="space-y-1.5">
            <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${usagePercent ?? 0}%` }} />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {formatBytes(storage.usage)} used{storage.quota > 0 ? ` of ${formatBytes(storage.quota)} available` : ''}
              {' — '}includes downloaded audio, cached scripture and your local database.
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">This browser does not report storage usage.</p>
        )}
      </div>

      <div className="pt-3 border-t border-border space-y-2">
        <span className="text-xs font-bold text-foreground">Downloaded surahs ({downloads.length})</span>
        {downloads.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            No surahs downloaded yet. Open a surah in the reader and tap &quot;Download for offline&quot;.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {downloads.map((entry) => {
              const key = `${entry.surahId}:${entry.reciterId}`;
              return (
                <li key={key} className="flex items-center justify-between p-2.5 rounded-xl bg-surface border border-border text-xs">
                  <Link href={`/quran/${entry.surahId}`} className="font-semibold text-foreground hover:text-primary">
                    {surahName(entry.surahId)} · {entry.ayahCount} ayahs
                  </Link>
                  <button
                    type="button"
                    onClick={() => void handleRemove(entry.surahId, entry.reciterId)}
                    disabled={removing === key}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-danger-strong hover:bg-danger-subtle disabled:opacity-50"
                    aria-label={`Remove offline download for ${surahName(entry.surahId)}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="pt-1">
        <Link href="/quran" className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline">
          <Download className="w-3.5 h-3.5" />
          Browse surahs to download
        </Link>
      </div>
    </div>
  );
};
