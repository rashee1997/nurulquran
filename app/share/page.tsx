'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { Upload, Flame, Trophy, BookOpen, AlertTriangle, ShieldCheck, Info } from 'lucide-react';
import { parseBackupJson, type BackupEnvelope } from '@/lib/db';
import { calculateLevel } from '@/lib/learning/xp-engine';
import { SURAHS } from '@/lib/quran/surahs';
import { localDayKey, shiftLocalDayKey } from '@/lib/time/day';

const HEATMAP_DAYS = 91;

function heatColor(count: number): string {
  if (count === 0) return 'bg-muted';
  if (count <= 2) return 'bg-primary/25';
  if (count <= 5) return 'bg-primary/50';
  if (count <= 10) return 'bg-primary/75';
  return 'bg-primary';
}

/**
 * Read-only viewer for a student's exported backup file — for a teacher or halaqa
 * leader to open a `.json` a student shares with them and see their progress at a
 * glance, without ever restoring it into their own device's data. Nothing here is
 * uploaded anywhere: the file is read and parsed entirely in the browser.
 */
export default function SharePage() {
  const [backup, setBackup] = useState<BackupEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setBackup(null);
    try {
      const text = await file.text();
      const result = parseBackupJson(text);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setBackup(result.data);
      setFileName(file.name);
    } catch {
      setError('The file could not be read.');
    }
  }, []);

  const profile = backup?.userProfile?.[0];
  const levelInfo = useMemo(() => calculateLevel(profile?.totalXp ?? 0), [profile?.totalXp]);

  const memorizedCount = useMemo(
    () => (backup?.verseProgress ?? []).filter((v) => v.state === 'memorized' || v.state === 'mastered').length,
    [backup]
  );
  const dueReviewCount = useMemo(() => {
    const now = new Date().toISOString();
    return (backup?.verseProgress ?? []).filter((v) => v.dueDate <= now).length;
  }, [backup]);
  const lessonCount = backup?.lessonHistory?.length ?? 0;

  const heatmap = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of backup?.events ?? []) counts[row.day] = (counts[row.day] ?? 0) + 1;
    return counts;
  }, [backup]);

  const heatmapDays = useMemo(() => {
    const today = localDayKey();
    return Array.from({ length: HEATMAP_DAYS }, (_, i) => shiftLocalDayKey(today, -(HEATMAP_DAYS - 1 - i)));
  }, []);

  const weakSurahs = useMemo(() => {
    const counts = new Map<number, number>();
    for (const row of backup?.recitationMistakes ?? []) counts.set(row.surah, (counts.get(row.surah) ?? 0) + 1);
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [backup]);

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground tracking-tight">Share viewer</h1>
        <p className="text-sm text-muted-foreground mt-1">
          For a teacher or halaqa leader: open a backup file a student exported from Settings to see their progress.
        </p>
      </div>

      <div className="p-4 rounded-2xl bg-info-subtle border border-info/30 flex items-start gap-3 text-xs text-foreground">
        <ShieldCheck className="w-4 h-4 text-info-strong shrink-0 mt-0.5" />
        <p>
          The file is read entirely in this browser tab and is never uploaded anywhere. Closing or refreshing this
          page discards it.
        </p>
      </div>

      {!backup && (
        <label className="flex flex-col items-center justify-center gap-3 p-10 rounded-2xl border-2 border-dashed border-border hover:border-primary/50 bg-card cursor-pointer transition-colors text-center">
          <Upload className="w-8 h-8 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Choose a student&apos;s backup .json file</span>
          <span className="text-xs text-muted-foreground">Exported from Settings → Data backup</span>
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
        </label>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-danger-subtle border border-danger/30 flex items-start gap-2 text-xs text-danger-strong">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {backup && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Info className="w-3.5 h-3.5" />
              <span>{fileName}</span>
              {backup.exportedAt && <span>· exported {new Date(backup.exportedAt).toLocaleString()}</span>}
            </div>
            <button
              type="button"
              onClick={() => {
                setBackup(null);
                setFileName(null);
              }}
              className="text-xs font-bold text-primary hover:underline"
            >
              Load a different file
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-card border border-border shadow-xs text-center">
              <Trophy className="w-4 h-4 text-primary mx-auto mb-1" />
              <span className="block text-lg font-black text-foreground">{levelInfo.level}</span>
              <span className="block text-[10px] text-muted-foreground uppercase font-semibold">Level</span>
            </div>
            <div className="p-4 rounded-2xl bg-card border border-border shadow-xs text-center">
              <Flame className="w-4 h-4 text-amber-500 mx-auto mb-1" />
              <span className="block text-lg font-black text-foreground">{profile?.streakCount ?? 0}</span>
              <span className="block text-[10px] text-muted-foreground uppercase font-semibold">Day streak</span>
            </div>
            <div className="p-4 rounded-2xl bg-card border border-border shadow-xs text-center">
              <BookOpen className="w-4 h-4 text-success mx-auto mb-1" />
              <span className="block text-lg font-black text-foreground">{memorizedCount}</span>
              <span className="block text-[10px] text-muted-foreground uppercase font-semibold">Memorized ayahs</span>
            </div>
            <div className="p-4 rounded-2xl bg-card border border-border shadow-xs text-center">
              <span className="block text-lg font-black text-foreground">{dueReviewCount}</span>
              <span className="block text-[10px] text-muted-foreground uppercase font-semibold">Due for review</span>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-3">
            <h2 className="text-sm font-bold text-foreground">Activity, last 13 weeks</h2>
            <div className="overflow-x-auto">
              <div className="grid grid-flow-col grid-rows-7 gap-1 w-max">
                {heatmapDays.map((day) => (
                  <div
                    key={day}
                    title={`${day}: ${heatmap[day] ?? 0} actions`}
                    className={`w-3 h-3 rounded-sm ${heatColor(heatmap[day] ?? 0)}`}
                  />
                ))}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">{lessonCount} lessons completed in total.</p>
          </div>

          <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-3">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning" />
              <span>Weak surahs</span>
            </h2>
            {weakSurahs.length === 0 ? (
              <p className="text-xs text-muted-foreground">No recitation mistakes recorded in this backup.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {weakSurahs.map(([surah, count]) => {
                  const meta = SURAHS.find((s) => s.id === surah);
                  return (
                    <span
                      key={surah}
                      className="px-3 py-1.5 rounded-lg border border-border bg-surface text-xs font-semibold text-foreground"
                    >
                      {meta?.nameSimple ?? `Surah ${surah}`} ({count})
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
