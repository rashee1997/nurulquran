'use client';

import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Loader2, HardDriveDownload } from 'lucide-react';
import {
  ensurePreferredVariantReady,
  modelDb,
  subscribeModelProgress,
  variantReadyFromMeta,
  type ModelDbProgress,
} from '@/lib/audio/model-cache';
import {
  MODEL_VARIANTS,
  resolveModuleVariant,
  variantTotalBytes,
  type CoachModelVariant,
} from '@/lib/audio/model-registry';
import { ModelDownloadPanel, publishTick } from '@/components/quran/ModelDownloadPanel';
import { RecitationCoachCanvas } from '@/components/quran/RecitationCoachCanvas';
import { InlineEnginePicker } from '@/components/learning/InlineEnginePicker';
import { showToast } from '@/lib/ui/toast';
import { db } from '@/lib/db';

/**
 * Recitation coach page.
 *
 * Boot order is deliberate: models are verified first (offline-safe, from IndexedDB), the engine
 * panel reports real byte progress, and only when everything is cached does the live recitation
 * canvas activate. The verse target defaults to Al-Fatihah 1:1 and persists the learner's last
 * position through the existing profile table.
 *
 * Readiness is a **live query**, not a poll.
 *
 * This used to run `setInterval(… , 4000)` calling `areAllModelsReady`, which — before the
 * metadata table existed — read `modelAssets.where('state').equals('ready').toArray()` and
 * therefore deserialised every cached blob (~180 MB) every four seconds, forever, on a page the
 * learner may leave open. A live query over the blob-free metadata table is exact, immediate, and
 * costs nothing while nothing changes. It also reacts to a download started elsewhere (the
 * Settings engine picker), which is what the polling loop was there to approximate.
 */

const DEFAULT_TARGET = { surah: 1, ayah: 1 };

/**
 * Word source for the coach: the verse the reader already cached, then the CDN.
 *
 * The cache key was `ayah:<surah>:<ayah>`, which **nothing in the app ever writes** — the Quran
 * provider's canonical key is `verse:<surah>:<ayah>` — so this lookup always missed and the page
 * fell through to an unvalidated `api.alquran.cloud` fetch even for a verse already on disk. The
 * canonical key is read first, with the old shape kept as a fallback for anything already stored
 * under it.
 */
async function loadVerseWords(surah: number, ayah: number): Promise<string[]> {
  const cached =
    (await db.quranCache.get(`verse:${surah}:${ayah}`)) ?? (await db.quranCache.get(`ayah:${surah}:${ayah}`));
  const data = cached?.data as { textUthmani?: string; words?: Array<{ arabic: string }> } | undefined;
  if (data?.words && data.words.length > 0) {
    return data.words.map((word) => word.arabic);
  }
  if (data?.textUthmani) {
    return data.textUthmani.split(/\s+/).filter(Boolean);
  }
  // Network fallback through the app's own provider route conventions (keyless CDN).
  try {
    const response = await fetch(`https://api.alquran.cloud/v1/surah/${surah}/${ayah}/quran-uthmani`);
    if (response.ok) {
      const payload = (await response.json()) as {
        data?: Array<{ text?: string }> | { ayahs?: Array<{ text?: string }> };
      };
      const entries = Array.isArray(payload.data) ? payload.data : payload.data?.ayahs;
      const text = entries?.[0]?.text ?? '';
      if (text.length > 0) {
        return text.split(/\s+/).filter(Boolean);
      }
    }
  } catch {
    // Offline and not cached: the page still renders with a clear message.
  }
  return [];
}

export default function RecitationCoachPage() {
  const [downloading, setDownloading] = useState(false);
  const [progressLabel, setProgressLabel] = useState('');
  const [target, setTarget] = useState(DEFAULT_TARGET);
  const [verseWords, setVerseWords] = useState<string[]>([]);

  const profile = useLiveQuery(() => db.userProfile.get('default_user'), []);
  const metaRows = useLiveQuery(() => modelDb.modelAssetMeta.toArray(), []);

  /*
   * The recitation coach honours its own inline pick first (moduleEngines), then the Settings
   * default — the same resolution every voice module uses. A 'cloud' inline pick still requires
   * the local engine here (the canvas is the on-device coach), so it is treated as Default for
   * readiness purposes.
   */
  const preferredVariant: CoachModelVariant =
    resolveModuleVariant('recitation-coach', profile?.moduleEngines, profile?.coachModelVariant)?.id ??
    'balanced';

  const variant = MODEL_VARIANTS[preferredVariant];
  const modelsReady = metaRows === undefined ? null : variantReadyFromMeta(variant, metaRows);

  // Seed the target from the learner's saved reading position once, when the profile arrives.
  const seededRef = useRef(false);
  useEffect(() => {
    const position = profile?.readingPosition;
    if (seededRef.current || !position) return;
    seededRef.current = true;
    setTarget({ surah: position.surah, ayah: position.ayah });
  }, [profile]);

  useEffect(() => {
    let active = true;
    void loadVerseWords(target.surah, target.ayah).then((loaded) => {
      if (active) setVerseWords(loaded);
    });
    return () => {
      active = false;
    };
  }, [target.surah, target.ayah]);

  /** Downloads exactly the resolved variant — no fallback; failures surface inline. */
  const handleDownload = async (): Promise<void> => {
    setDownloading(true);
    let unsubscribe: (() => void) | null = null;
    try {
      unsubscribe = subscribeModelProgress((progress: ModelDbProgress) => publishTick(progress));
      const { variant: ready } = await ensurePreferredVariantReady(preferredVariant, (done, total) => {
        setProgressLabel(`Model ${done} of ${total}`);
      });
      const size = (variantTotalBytes(ready) / 1048576).toFixed(0);
      showToast(`${ready.label} cached (${size} MB). The coach works offline.`, 'success');
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'Model download failed.', 'error');
    } finally {
      /*
       * Released in `finally` on purpose.
       *
       * A failed download is precisely the case this UI exists to report, and it was the one path
       * that skipped `unsubscribe()` — so every retry leaked another listener into the module-level
       * progress set, and each later tick called into a dead closure. Readiness no longer needs
       * setting here either: the live metadata query above is the source of truth.
       */
      unsubscribe?.();
      setDownloading(false);
      setProgressLabel('');
    }
  };

  const verseKey = `${target.surah}:${target.ayah}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-extrabold text-foreground">Recitation Coach</h1>
        <p className="text-sm text-muted-foreground">
          Recite aloud and get word-by-word feedback from the on-device engine you chose —
          inline below, or the Settings default when left on Automatic. Feedback works fully
          offline once the models are cached.
        </p>
      </header>

      {modelsReady === false && (
        <div className="rounded-2xl border border-info/40 bg-info-subtle p-4 space-y-3">
          <InlineEnginePicker moduleId="recitation-coach" />
          <p className="flex items-center gap-2 text-sm font-bold text-info-strong">
            <HardDriveDownload className="w-4 h-4" aria-hidden="true" />
            One-time setup: {(variantTotalBytes(variant) / 1048576).toFixed(0)} MB of models for the {variant.label} engine, cached on this device.
          </p>
          <p className="text-xs text-info-strong/80">
            After this, recitation feedback works entirely offline and never leaves your device.
          </p>
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={downloading}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-md transition-all hover:bg-primary-hover active:scale-95 disabled:opacity-60"
          >
            {downloading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span>{progressLabel || 'Downloading…'}</span>
              </>
            ) : (
              <span>Download models</span>
            )}
          </button>
          <ModelDownloadPanel preferredVariant={preferredVariant} />
        </div>
      )}

      {modelsReady !== false && (verseWords.length > 0 ? (
        <RecitationCoachCanvas words={verseWords} verseKey={verseKey} />
      ) : (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          The verse text could not be loaded. Check your connection and retry.
        </div>
      ))}

      {modelsReady === null && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          <span>Checking cached models…</span>
        </div>
      )}
    </div>
  );
}
