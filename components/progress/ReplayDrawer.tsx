'use client';

import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Play, Trash2, Music, AlertCircle } from 'lucide-react';
import { db, RecitationSessionRecord } from '@/lib/db';
import { Modal } from '@/components/system/Modal';
import { StatePanel } from '@/components/system/StatePanel';
import { showToast } from '@/lib/ui/toast';
import { track } from '@/lib/telemetry/events';
import { pcm16Base64ToWavDataUrl } from '@/lib/audio/wav';
import { globalAyahNumber, reciterAudioUrl } from '@/lib/quran/reciters';
import { SURAHS } from '@/lib/quran/surahs';

interface ReplayDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface PreparedClip {
  mine: string | null;
  mineFailed: boolean;
  qari: string | null;
  qariFailed: boolean;
}

/**
 * Session replay drawer: browses and plays the learner's saved recitation attempts
 * device-local in `recitationSessions`, each beside its Qari reference clip. Nothing
 * here is uploaded — the raw PCM wraps into a WAV data URL in the browser.
 */
export const ReplayDrawer: React.FC<ReplayDrawerProps> = ({ isOpen, onClose }) => {
  const sessions = useLiveQuery(
    (): Promise<RecitationSessionRecord[]> =>
      isOpen ? db.recitationSessions.orderBy('createdAt').reverse().limit(100).toArray() : Promise.resolve([]),
    [isOpen],
    undefined
  );
  const [openClipKey, setOpenClipKey] = useState<string | null>(null);
  const [clips, setClips] = useState<Record<string, PreparedClip>>({});
  /**
   * Qari reference URL for a saved attempt's verse.
   *
   * A memoised `qariUrls` lookup table used to sit here, but nothing ever populated it, so the
   * cache never hit and the state was pure overhead. The shared helper does the coordinate
   * conversion with a precomputed table instead.
   */
  const qariUrlFor = (surah: number, ayah: number, reciterId: string): string =>
    reciterAudioUrl(reciterId, globalAyahNumber(surah, ayah));

  /** Wraps a saved attempt and prepares its Qari pair; memoised per session. */
  const prepareClip = async (session: RecitationSessionRecord, reciterId: string): Promise<void> => {
    const key = session.id;
    if (clips[key]) return;
    const mine = pcm16Base64ToWavDataUrl(session.audioBase64);
    const qari = qariUrlFor(session.surah, session.ayah, reciterId);
    setClips((prev) => ({ ...prev, [key]: { mine, mineFailed: mine === null, qari, qariFailed: false } }));
    setOpenClipKey(key);
    track('recite.replay_played', { verseKey: session.verseKey });
  };

  const deleteSession = async (id: string): Promise<void> => {
    try {
      await db.recitationSessions.delete(id);
      setClips((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      showToast('Recitation attempt deleted.', 'success');
    } catch {
      showToast('Could not delete the attempt.', 'error');
    }
  };

  const profile = useLiveQuery(() => db.userProfile.get('default_user'), [], undefined);
  const reciterId = profile?.reciterId ?? 'ar.alafasy';

  return (
    <Modal open={isOpen} onClose={onClose} label="Recitation replay history" title="Recitation replay" contentClassName="p-0">
      <div className="p-4 space-y-3" aria-label="Saved recitation attempts">
        {sessions === undefined ? (
          <StatePanel variant="loading" title="Loading your saved attempts…" minHeight="min-h-[10rem]" />
        ) : sessions.length === 0 ? (
          <StatePanel
            variant="empty"
            title="No saved attempts yet"
            description="Save an attempt in a hidden-verse recitation session (memorize mode H) to build your replay history."
            actionLabel="Open memorization modes"
            onAction={() => {
              onClose();
              window.location.assign('/memorize');
            }}
            minHeight="min-h-[12rem]"
          />
        ) : (
          <ul className="space-y-2 list-none" aria-label="Saved attempts">
            {sessions.map((session) => {
              const meta = SURAHS.find((s) => s.id === session.surah);
              const prepared = clips[session.id];
              const isOpenClip = openClipKey === session.id;
              const when = new Date(session.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
              return (
                <li
                  key={session.id}
                  className="p-3 rounded-xl border border-border bg-surface space-y-2"
                  aria-label={`${meta?.nameSimple ?? 'Surah'} ${session.verseKey}, ${session.accuracy}% accuracy, ${session.mistakeCount} mistake${session.mistakeCount === 1 ? '' : 's'}, recorded ${when}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-foreground truncate">
                        {meta?.nameSimple ?? 'Surah'} · {session.verseKey}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {session.accuracy}% accuracy · {session.mistakeCount} mistake{session.mistakeCount === 1 ? '' : 's'} · {when}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => void prepareClip(session, reciterId)}
                        aria-expanded={isOpenClip}
                        aria-label={`${isOpenClip ? 'Hide' : 'Play'} clips for ${session.verseKey}`}
                        className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary-hover transition-colors"
                      >
                        <Play className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteSession(session.id)}
                        aria-label={`Delete attempt for ${session.verseKey}`}
                        className="p-2 rounded-lg text-muted-foreground hover:text-danger-strong hover:bg-danger-subtle transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  {isOpenClip && prepared && (
                    <div className="grid gap-2 sm:grid-cols-2 pt-1 border-t border-border-subtle">
                      {prepared.mine ? (
                        <div className="rounded-lg bg-card border border-border p-2">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                            <Music className="w-3 h-3" aria-hidden="true" /> Your recitation
                          </p>
                          <div className="h-9 flex items-center">
                            <audio controls src={prepared.mine} className="w-full h-8" preload="none" aria-label="Play your saved recitation" />
                          </div>
                        </div>
                      ) : (
                        <div className="h-16 rounded-lg bg-card border border-border p-2 flex items-center text-[11px] text-danger-strong">
                          <AlertCircle className="w-3.5 h-3.5 mr-1.5 shrink-0" aria-hidden="true" />
                          This recording could not be decoded.
                        </div>
                      )}
                      {prepared.qari && (
                        <div className="rounded-lg bg-card border border-border p-2">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Qari reference</p>
                          {prepared.qariFailed ? (
                            <div className="h-8 flex items-center text-[11px] text-warning-strong" role="status">
                              <AlertCircle className="w-3.5 h-3.5 mr-1.5 shrink-0" aria-hidden="true" />
                              Clip unavailable offline.
                            </div>
                          ) : (
                            <div className="h-8 flex items-center">
                              <audio
                                controls
                                src={prepared.qari}
                                className="w-full h-8"
                                preload="none"
                                aria-label="Play the Qari reference"
                                onError={() =>
                                  setClips((prev) => ({ ...prev, [session.id]: { ...prepared, qariFailed: true } }))
                                }
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
};
