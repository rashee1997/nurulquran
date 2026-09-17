'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Volume2, Repeat, FastForward } from 'lucide-react';

interface AudioBarProps {
  currentAyahNumber?: number;
  surahNumber: number;
  totalVerses: number;
  audioUrl?: string;
  onNextAyah?: () => void;
  onPrevAyah?: () => void;
}

export const RECITERS = [
  { id: 'ar.alafasy', name: 'Mishary Rashid Alafasy' },
  { id: 'ar.abdulbasitmurattal', name: 'Abdul Basit (Murattal)' },
  { id: 'ar.husary', name: 'Mahmoud Khalil Al-Husary' },
  { id: 'ar.minshawi', name: 'Mohamed Siddiq Al-Minshawi' },
];

export const AudioBar: React.FC<AudioBarProps> = ({
  currentAyahNumber = 1,
  surahNumber,
  totalVerses,
  audioUrl,
  onNextAyah,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [repeatMode, setRepeatMode] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [selectedReciter, setSelectedReciter] = useState('ar.alafasy');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (audioRef.current && audioUrl) {
      audioRef.current.src = audioUrl;
      audioRef.current.playbackRate = playbackRate;
      if (isPlaying) {
        audioRef.current.play().catch(e => console.warn('Audio play interrupted:', e));
      }
    }
  }, [audioUrl, playbackRate, isPlaying]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(e => console.warn(e));
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const cur = audioRef.current.currentTime;
      const dur = audioRef.current.duration || 1;
      setProgress((cur / dur) * 100);
      setDuration(dur);
    }
  };

  const handleEnded = () => {
    if (repeatMode && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play();
    } else if (onNextAyah && currentAyahNumber < totalVerses) {
      onNextAyah();
    } else {
      setIsPlaying(false);
      setProgress(0);
    }
  };

  const cycleSpeed = () => {
    const speeds = [0.75, 1, 1.25, 1.5];
    const nextIdx = (speeds.indexOf(playbackRate) + 1) % speeds.length;
    const nextSpeed = speeds[nextIdx];
    setPlaybackRate(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || duration === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = pos * duration;
  };

  return (
    <div
      id="audio-bar"
      className="sticky bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 p-3 shadow-lg"
    >
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
      />

      <div className="max-w-4xl mx-auto flex flex-col gap-2">
        {/* Progress scrub bar */}
        <div
          onClick={seek}
          className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden cursor-pointer group"
        >
          <div
            className="h-full bg-emerald-500 group-hover:bg-emerald-600 transition-all rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          {/* Current Ayah / Reciter */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-700 dark:text-emerald-300">
              <Volume2 className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                Ayah {surahNumber}:{currentAyahNumber}
              </span>
              <select
                value={selectedReciter}
                onChange={(e) => setSelectedReciter(e.target.value)}
                className="text-[11px] text-slate-500 dark:text-slate-400 bg-transparent border-0 outline-hidden cursor-pointer hover:text-emerald-600"
              >
                {RECITERS.map((r) => (
                  <option key={r.id} value={r.id} className="dark:bg-slate-900">
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (audioRef.current) audioRef.current.currentTime = 0;
              }}
              className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
              title="Restart Ayah"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              id="audio-play-toggle-btn"
              onClick={togglePlay}
              className="w-10 h-10 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center shadow-md transition-all active:scale-95"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>

            <button
              onClick={() => setRepeatMode(!repeatMode)}
              className={`p-2 rounded-full transition-colors ${
                repeatMode
                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
              title={repeatMode ? 'Repeat Ayah ON (Hifz loop)' : 'Repeat Ayah OFF'}
            >
              <Repeat className="w-4 h-4" />
            </button>

            <button
              onClick={cycleSpeed}
              className="px-2 py-1 rounded-md text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-0.5"
              title="Playback speed"
            >
              <FastForward className="w-3 h-3" />
              <span>{playbackRate}x</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
