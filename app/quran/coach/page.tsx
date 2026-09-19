'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, HardDriveDownload } from 'lucide-react';
import {
  areAllModelsReady,
  ensurePreferredVariantReady,
  getModelSnapshot,
  subscribeModelProgress,
  type ModelDbProgress,
} from '@/lib/audio/model-cache';
import {
  MODEL_VARIANTS,
  variantTotalBytes,
  type CoachModelVariant,
} from '@/lib/audio/model-registry';
import { ModelDownloadPanel, publishTick } from '@/components/quran/ModelDownloadPanel';
import { RecitationCoachCanvas } from '@/components/quran/RecitationCoachCanvas';
import { showToast } from '@/lib/ui/toast';
import { db } from '@/lib/db';

/**
 * Recitation coach page.
 *
 * Boot order is deliberate: models are verified first (offline-safe, from IndexedDB), the engine
 * panel reports real byte progress, and only when everything is cached does the live recitation
 * canvas activate. The verse target defaults to Al-Fatihah 1:1 and persists the learner's last
 * position through the existing profile table.
 */

const DEFAULT_TARGET = { surah: 1, ayah: 1 };

/** Minimal Uthmani word source: the verified offline corpus already stores verse words. */
async function loadVerseWords(surah: number, ayah: number): Promise<string[]> {
  const cached = await db.quranCache.get(`ayah:${surah}:${ayah}`);
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
  const [modelsReady, setModelsReady] = useState<boolean | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progressLabel, setProgressLabel] = useState('');
  const [surah, setSurah] = useState(DEFAULT_TARGET.surah);
  const [ayah, setAyah] = useState(DEFAULT_TARGET.ayah);
  /** The learner's saved engine choice (Settings → AI); `undefined` = 'balanced'. */
  const [preferredVariant, setPreferredVariant] = useState<CoachModelVariant>('balanced');

  useEffect(() => {
    let active = true;
    void (async () => {
      const profile = await db.userProfile.get('default_user');
      if (!active) return;
      const variant: CoachModelVariant =
        profile?.coachModelVariant && profile.coachModelVariant in MODEL_VARIANTS
          ? profile.coachModelVariant
          : 'balanced';
      setPreferredVariant(variant);
      const ready = await areAllModelsReady(variant);
      if (!active) return;
      setModelsReady(ready);
      if (profile?.readingPosition && active) {
        setSurah(profile.readingPosition.surah);
        setAyah(profile.readingPosition.ayah);
      }
    })();

    // Re-verify after any downloads triggered elsewhere in the session.
    const interval = setInterval(() => {
      void areAllModelsReady(preferredVariant).then((ready) => {
        if (active) setModelsReady(ready);
      });
    }, 4000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [preferredVariant]);

  const words = useMemo(() => [] as string[], []);
  const [verseWords, setVerseWords] = useState<string[]>(words);

  useEffect(() => {
    let active = true;
    void loadVerseWords(surah, ayah).then((loaded) => {
      if (active) setVerseWords(loaded);
    });
    return () => {
      active = false;
    };
  }, [surah, ayah, words]);

  /**
   * Downloads the learner's preferred variant, walking its fallback chain automatically when a
   * download fails. The toast names the variant that actually became ready so the learner can
   * see when a fallback engine was used.
   */
  const handleDownload = async (): Promise<void> => {
    setDownloading(true);
    try {
      const unsubscribe = subscribeModelProgress((progress: ModelDbProgress) => publishTick(progress));
      const { variant, error } = await ensurePreferredVariantReady(preferredVariant, (done, total) => {
        setProgressLabel(`Model ${done} of ${total}`);
      });
      unsubscribe();
      const ready = variant !== null;
      setModelsReady(ready);
      const snapshot = await getModelSnapshot();
      const failed = snapshot.find((entry) => entry.state === 'error');
      if (failed) {
        showToast(`${failed.label}: ${failed.error ?? 'download failed'}`, 'error');
      } else if (ready && variant) {
        const size = (variantTotalBytes(variant) / 1048576).toFixed(0);
        showToast(
          variant.id === preferredVariant
            ? `${variant.label} cached (${size} MB). The coach works offline.`
            : `${variant.label} cached instead — your preferred engine could not be downloaded${error ? ` (${error})` : ''}.`,
          'success'
        );
      } else {
        showToast(error ?? 'Model download failed.', 'error');
      }
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'Model download failed.', 'error');
    } finally {
      setDownloading(false);
      setProgressLabel('');
    }
  };

  const verseKey = `${surah}:${ayah}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-extrabold text-foreground">Recitation Coach</h1>
        <p className="text-sm text-muted-foreground">
          Recite aloud and get word-by-word feedback. Coaching runs on Google&apos;s cloud voice
          model and seamlessly switches to a private on-device engine when the cloud is
          unavailable — your microphone keeps running either way.
        </p>
      </header>

      {modelsReady === false && (
        <div className="rounded-2xl border border-info/40 bg-info-subtle p-4 space-y-3">
          <p className="flex items-center gap-2 text-sm font-bold text-info-strong">
            <HardDriveDownload className="w-4 h-4" aria-hidden="true" />
            One-time setup: {(variantTotalBytes(MODEL_VARIANTS[preferredVariant]) / 1048576).toFixed(0)} MB of models for the {MODEL_VARIANTS[preferredVariant].label} engine, cached on this device.
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
