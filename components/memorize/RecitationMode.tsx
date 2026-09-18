'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Mic, Square, Loader2, AlertCircle, CheckCircle2, RotateCcw, Play } from 'lucide-react';
import { useLiveTajweed, MAX_RECORDING_SECONDS } from '@/hooks/use-live-tajweed';
import { AudioLevelMeter } from '@/components/learning/AudioLevelMeter';
import { db } from '@/lib/db';
import { diffRecitation, qualityFromAccuracy, type RecitationDiff } from '@/lib/learning/recitation-diff';
import { track } from '@/lib/telemetry/events';
import { pcm16Base64ToWavDataUrl } from '@/lib/audio/wav';
import { reciterAudioUrl } from '@/lib/quran/reciters';
import { getChapterMetadata } from '@/lib/quran/surahs';
import type { ModeStageProps } from './types';

/**
 * Mode H — recite the hidden verse.
 *
 * The verse is hidden. The learner recites; the recording goes to the live coach with a
 * transcript request; the transcript is aligned *locally* against the verified verse text,
 * so every "skipped" or "substituted" word is decided by this app, never by a model
 * "correcting" scripture. Detected mistakes are stored, and the grade is derived from
 * accuracy so the scheduler is updated without a self-rating. A manual reveal-and-grade
 * path remains for devices without a microphone or when the service is unavailable.
 */
export const RecitationMode: React.FC<ModeStageProps> = ({ verse, isRevealed, setIsRevealed, handleSelfGrade }) => {
  const [diff, setDiff] = useState<RecitationDiff | null>(null);
  const [savedMistakes, setSavedMistakes] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [autoGraded, setAutoGraded] = useState<number | null>(null);
  const [savedSessionId, setSavedSessionId] = useState<string | null>(null);
  const [replayUrl, setReplayUrl] = useState<string | null>(null);
  const [qariUrl, setQariUrl] = useState<string | null>(null);
  const gradedForRef = useRef<string | null>(null);

  const verseKey = `${verse.surah}:${verse.ayah}`;
  const referenceWords = useMemo(() => verse.words.map((w) => w.arabic), [verse.words]);

  const handleFeedback = useCallback(
    async (feedback: { transcript?: string; coachResponseEn: string }) => {
      const transcript = feedback.transcript ?? '';
      if (transcript.length === 0) {
        setNotice('No intelligible recitation was heard. Nothing was graded — try again a little louder.');
        setDiff(null);
        return;
      }
      const result = diffRecitation(verse.textUthmani, transcript, referenceWords);
      setDiff(result);
      setNotice(null);
      setIsRevealed(true);

      const at = new Date().toISOString();
      try {
        if (result.mistakes.length > 0) {
          await db.recitationMistakes.bulkAdd(
            result.mistakes.map((m) => ({
              verseKey,
              surah: verse.surah,
              ayah: verse.ayah,
              wordIndex: m.wordIndex,
              kind: m.status === 'match' ? 'substituted' : m.status,
              expected: m.expected,
              heard: m.heard,
              at,
            }))
          );
          for (const m of result.mistakes) track('recite.mistake', { verseKey, kind: m.status, wordIndex: m.wordIndex });
        }
        setSavedMistakes(true);
      } catch (error) {
        console.error('Recitation mistakes could not be saved:', error);
      }
      track('recite.session', { verseKey, words: result.total, mistakes: result.mistakes.length, accuracy: result.accuracy });

      // Grade once per verse per session from accuracy, so the scheduler moves without a self-rating.
      if (gradedForRef.current !== verseKey) {
        gradedForRef.current = verseKey;
        const quality = qualityFromAccuracy(result.accuracy, result.mistakes.length);
        setAutoGraded(quality);
      }
    },
    [referenceWords, setIsRevealed, verse.ayah, verse.surah, verse.textUthmani, verseKey]
  );

  const live = useLiveTajweed({
    currentLessonTitle: 'Hidden-verse recitation',
    currentActivityTitle: `Ayah ${verseKey}`,
    promptArabic: verse.textUthmani,
    targetRule: 'Memorisation accuracy',
    requestTranscript: true,
    maxSeconds: Math.max(MAX_RECORDING_SECONDS, Math.min(60, 4 + verse.words.length * 1.2)),
    onFeedbackReceived: (feedback) => void handleFeedback(feedback),
  });

  /** Persists the graded attempt (audio + outcome) so it can be replayed later. */
  const saveSession = useCallback(
    async (result: RecitationDiff) => {
      const audio = live.lastRecordingBase64;
      if (!audio) return;
      try {
        const id = crypto.randomUUID();
        await db.recitationSessions.add({
          id,
          verseKey,
          surah: verse.surah,
          ayah: verse.ayah,
          audioBase64: audio,
          audioMimeType: 'audio/pcm;rate=16000',
          mistakeCount: result.mistakes.length,
          accuracy: result.accuracy,
          createdAt: new Date().toISOString(),
        });
        setSavedSessionId(id);
        track('recite.replay_saved', { verseKey });
      } catch (error) {
        console.error('Recitation session could not be saved:', error);
      }
    },
    [live.lastRecordingBase64, verse.ayah, verse.surah, verseKey]
  );

  /** Prepares both clips for the replay-vs-Qari comparison; the learner's own audio is wrapped on-device. */
  const prepareReplay = useCallback(async (): Promise<void> => {
    if (!live.lastRecordingBase64) return;
    const mine = pcm16Base64ToWavDataUrl(live.lastRecordingBase64);
    if (mine) {
      setReplayUrl(mine);
      track('recite.replay_played', { verseKey });
    }
    if (qariUrl === null) {
      let offset = 0;
      for (let id = 1; id < verse.surah; id++) offset += getChapterMetadata(id).versesCount;
      const profile = await db.userProfile.get('default_user');
      const reciterId = profile?.reciterId ?? 'ar.alafasy';
      setQariUrl(reciterAudioUrl(reciterId, offset + verse.ayah));
    }
  }, [live.lastRecordingBase64, qariUrl, verse.ayah, verse.surah, verseKey]);

  // Fresh verse: clear the previous result and release the recorder's resources.
  // A `key={verseKey}` remount was considered instead, but `live` (useLiveTajweed) owns
  // microphone/AudioContext handles that must be released deterministically via `reset()`,
  // which an unmount cannot guarantee ordering for; resetting in-place keeps that release explicit.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets local UI state when the drilled verse changes, paired with releasing recorder resources below
    setDiff(null);
    setNotice(null);
    setSavedMistakes(false);
    setAutoGraded(null);
    setSavedSessionId(null);
    setReplayUrl(null);
    setQariUrl(null);
    live.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verseKey]);

  const isBusy = live.status === 'listening' || live.status === 'analyzing';

  return (
    <div className="space-y-6 text-center">
      <div className="space-y-1">
        <span className="text-xs font-bold text-primary uppercase tracking-wider">Mode H • Recite hidden</span>
        <h3 className="text-lg font-bold text-foreground">Hidden-verse recitation with mistake detection</h3>
        <p className="text-xs text-muted-foreground">
          Recite ayah {verseKey} from memory. Skipped, replaced and extra words are marked against the verified text.
        </p>
      </div>

      <div className="p-6 bg-surface rounded-2xl border border-border min-h-[140px] flex flex-col items-center justify-center space-y-4">
        {!isRevealed && !diff ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-muted-foreground">Verse hidden — recite it aloud</p>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {live.status === 'listening' ? (
                <button
                  type="button"
                  onClick={live.stopRecording}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-danger text-danger-foreground text-xs font-bold shadow-md"
                >
                  <Square className="w-4 h-4" />
                  <span>Stop ({live.recordingSeconds}s)</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void live.startRecording()}
                  disabled={isBusy}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold shadow-md transition-all active:scale-95 disabled:opacity-60"
                >
                  {live.status === 'analyzing' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
                  <span>{live.status === 'analyzing' ? 'Checking…' : 'Start reciting'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsRevealed(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-card border border-border text-foreground text-xs font-semibold"
              >
                <Eye className="w-4 h-4" />
                <span>Reveal and self-grade</span>
              </button>
            </div>
            {live.status === 'listening' && (
              <div className="pt-1">
                <AudioLevelMeter levelRef={live.audioLevelRef} active />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 animate-in fade-in w-full">
            <p className="font-arabic text-3xl sm:text-4xl text-foreground leading-loose" dir="rtl" lang="ar">
              {diff
                ? diff.words
                    .filter((w) => w.status !== 'inserted')
                    .map((w) => (
                      <span
                        key={`${w.wordIndex}-${w.status}`}
                        className={
                          w.status === 'match'
                            ? 'mx-1'
                            : w.status === 'skipped'
                              ? 'mx-1 px-1 rounded-md bg-danger-subtle text-danger-strong underline decoration-dotted'
                              : 'mx-1 px-1 rounded-md bg-warning-subtle text-warning-strong'
                        }
                        title={w.status === 'match' ? undefined : w.status === 'skipped' ? 'Skipped' : `Heard: ${w.heard ?? ''}`}
                      >
                        {w.expected}
                      </span>
                    ))
                : verse.textUthmani}
            </p>
            <p className="text-xs text-muted-foreground">{verse.translationEn}</p>
            {diff && (
              <div className="text-xs space-y-1">
                <p className="font-bold text-foreground">
                  {diff.matched} of {diff.total} words correct · {diff.accuracy}%
                </p>
                {diff.mistakes.length > 0 ? (
                  <ul className="text-[11px] text-muted-foreground space-y-0.5">
                    {diff.mistakes.slice(0, 8).map((m, index) => (
                      <li key={index}>
                        {m.status === 'skipped' && (
                          <>
                            Skipped word {m.wordIndex}: <span className="font-arabic text-sm" lang="ar" dir="rtl">{m.expected}</span>
                          </>
                        )}
                        {m.status === 'substituted' && (
                          <>
                            Word {m.wordIndex} <span className="font-arabic text-sm" lang="ar" dir="rtl">{m.expected}</span> was heard as{' '}
                            <span className="font-arabic text-sm" lang="ar" dir="rtl">{m.heard}</span>
                          </>
                        )}
                        {m.status === 'inserted' && (
                          <>
                            Extra word heard: <span className="font-arabic text-sm" lang="ar" dir="rtl">{m.heard}</span>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-success-strong font-semibold inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Every word matched.
                  </p>
                )}
                {savedMistakes && diff.mistakes.length > 0 && (
                  <p className="text-[10px] text-muted-foreground">Mistakes saved to your weak-spot map.</p>
                )}
              </div>
            )}
            {diff && (
              <div className="pt-2 flex items-center justify-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => void saveSession(diff)}
                  disabled={savedSessionId !== null}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border text-foreground text-[11px] font-semibold hover:bg-surface-hover disabled:opacity-60"
                >
                  <Play className="w-3 h-3" />
                  {savedSessionId ? 'Attempt saved' : 'Save attempt for replay'}
                </button>
                <button
                  type="button"
                  onClick={() => void prepareReplay()}
                  disabled={!live.lastRecordingBase64}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border text-foreground text-[11px] font-semibold hover:bg-surface-hover disabled:opacity-60"
                >
                  <Play className="w-3 h-3" /> Hear myself · hear the Qari
                </button>
              </div>
            )}
            {(replayUrl || qariUrl) && (
              <div className="pt-2 grid gap-2 sm:grid-cols-2 text-left">
                {replayUrl && (
                  <div className="rounded-xl bg-surface border border-border p-2">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Your recitation</p>
                    <audio controls src={replayUrl} className="w-full h-8" preload="none" />
                  </div>
                )}
                {qariUrl && (
                  <div className="rounded-xl bg-surface border border-border p-2">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Qari reference</p>
                    <audio controls src={qariUrl} className="w-full h-8" preload="none" />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {(notice || live.errorMessage) && (
        <div className="flex items-start gap-2 text-left text-[11px] text-warning-strong bg-warning-subtle border border-warning/30 rounded-xl px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{notice ?? live.errorMessage}</span>
        </div>
      )}

      {autoGraded !== null && diff && (
        <div className="space-y-2 animate-in slide-in-from-bottom-2">
          <p className="text-[11px] text-muted-foreground">
            Suggested grade from accuracy: <span className="font-bold text-foreground">{['', 'Again', 'Hard', 'Hard', 'Good', 'Easy'][autoGraded]}</span>
          </p>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => void handleSelfGrade(autoGraded)}
              className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold shadow-md"
            >
              Save grade and continue
            </button>
            <button
              type="button"
              onClick={() => {
                setDiff(null);
                setIsRevealed(false);
                setAutoGraded(null);
                live.reset();
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-card border border-border text-foreground text-xs font-semibold"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Recite again
            </button>
          </div>
        </div>
      )}

      {isRevealed && !diff && (
        <div className="space-y-2 pt-2 animate-in slide-in-from-bottom-2">
          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">Grade your recall</span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <button type="button" onClick={() => void handleSelfGrade(1)} className="p-3 rounded-xl bg-danger-subtle border border-danger/30 text-danger-strong text-xs font-bold hover:bg-danger/20 transition-colors">
              Again
            </button>
            <button type="button" onClick={() => void handleSelfGrade(3)} className="p-3 rounded-xl bg-secondary-subtle border border-secondary/30 text-secondary-strong text-xs font-bold hover:bg-secondary/20 transition-colors">
              Hard
            </button>
            <button type="button" onClick={() => void handleSelfGrade(4)} className="p-3 rounded-xl bg-primary-subtle border border-primary/30 text-primary-strong text-xs font-bold hover:bg-primary/20 transition-colors">
              Good
            </button>
            <button type="button" onClick={() => void handleSelfGrade(5)} className="p-3 rounded-xl bg-surface border border-border text-foreground text-xs font-bold hover:bg-surface-hover transition-colors">
              Easy
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
