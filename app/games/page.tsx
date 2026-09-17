'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Gamepad2, 
  Sparkles, 
  Radar, 
  Layers, 
  Flame, 
  Trophy, 
  ArrowRight, 
  Clock, 
  ShieldCheck, 
  CheckCircle2,
  Play
} from 'lucide-react';
import { db, UserProfile, initializeDatabase } from '@/lib/db';
import { GameSessionResult } from '@/lib/db/schemas/streak-schema';
import { getGameSessions } from '@/lib/games/game-service';

export default function GamesHubPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [recentSessions, setRecentSessions] = useState<GameSessionResult[]>([]);
  const [totalGamesPlayed, setTotalGamesPlayed] = useState<number>(0);

  useEffect(() => {
    async function loadData() {
      const p = await initializeDatabase();
      setProfile(p);
      const sessions = await getGameSessions();
      setRecentSessions(sessions.slice(0, 5));
      setTotalGamesPlayed(sessions.length);
    }
    loadData();

    const handleUpdate = () => {
      loadData();
    };
    window.addEventListener('quran-game-completed', handleUpdate);
    return () => window.removeEventListener('quran-game-completed', handleUpdate);
  }, []);

  const games = [
    {
      id: 'ayah-assembly',
      title: 'Celestial Ayah Assembly',
      href: '/games/ayah-assembly',
      badge: '2D Orbital Canvas',
      color: 'from-emerald-500/20 to-teal-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400',
      icon: Sparkles,
      iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      description: 'Reconstruct Quranic verses by connecting floating words with orbital physics. Features authentic Uthmani script and audio recitations.',
      mechanics: ['Word Sequencing', 'Kinetic Particles', 'Instant Audio Chimes', 'Mishary Alafasy Recitation'],
    },
    {
      id: 'mutashabihat-radar',
      title: 'Mutashabihat Radar',
      href: '/games/mutashabihat-radar',
      badge: 'Radar Sweep Discernment',
      color: 'from-sky-500/20 to-indigo-500/10 border-sky-500/30 text-sky-600 dark:text-sky-400',
      icon: Radar,
      iconBg: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
      description: 'Master similar verses (*Mutashabihat*) across different Surahs with an oscillating 2D radar. Eliminates hesitation during Salah.',
      mechanics: ['Twin Verse Discrimination', 'Canonical Diff Tokens', 'English & Tamil Mnemonics', 'Sonar Waveforms'],
    },
    {
      id: 'memory-matrix',
      title: 'Ayah Memory Matrix',
      href: '/games/memory-matrix',
      badge: 'Active Recall Grid',
      color: 'from-amber-500/20 to-orange-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400',
      icon: Layers,
      iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      description: 'Rapid card matching testing active recall. Match opening verse phrases with endings and English/Tamil meanings.',
      mechanics: ['3D-Perspective Card Flips', 'Active Recall Pairing', 'Combo Multipliers', 'Speed & Accuracy Rating'],
    },
  ];

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8">
      {/* Hero Arcade Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-linear-to-r from-card to-card/60 border border-border p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold">
              <Gamepad2 className="w-3.5 h-3.5" />
              <span>AI & 2D Canvas Quran Arcade</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
              Gamified Quran Memorization
            </h1>
            <p className="text-sm text-muted-foreground max-w-xl leading-relaxed">
              Reinforce your Hifz through high-frequency active recall mini-games powered by responsive 60 FPS HTML5 canvas animations, verified Medina Mushaf Uthmani text, and spaced-repetition metrics.
            </p>
          </div>

          {/* Quick Metrics Badge */}
          <div className="flex items-center gap-4 bg-background/80 backdrop-blur-xs p-4 rounded-2xl border border-border shrink-0 shadow-xs">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-amber-500 font-extrabold text-xl">
                <Flame className="w-5 h-5 fill-amber-500" />
                <span>{profile?.streakCount || 1}</span>
              </div>
              <span className="text-[10px] text-muted-foreground font-semibold uppercase">Day Streak</span>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-primary font-extrabold text-xl">
                <Trophy className="w-5 h-5" />
                <span>{profile?.totalXp || 0}</span>
              </div>
              <span className="text-[10px] text-muted-foreground font-semibold uppercase">Total XP</span>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="text-center">
              <span className="text-foreground font-extrabold text-xl">{totalGamesPlayed}</span>
              <span className="block text-[10px] text-muted-foreground font-semibold uppercase">Sessions</span>
            </div>
          </div>
        </div>
      </div>

      {/* Daily Challenge Banner */}
      <div className="p-5 rounded-2xl bg-primary/5 border border-primary/20 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-md shadow-primary/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-primary uppercase tracking-wider">Today&apos;s Challenge</span>
              <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 font-extrabold text-[11px]">
                +50 Bonus XP
              </span>
            </div>
            <h3 className="font-bold text-sm text-foreground">
              Complete Surah Al-Fatihah or Al-Ikhlas in Celestial Ayah Assembly
            </h3>
          </div>
        </div>

        <Link
          href="/games/ayah-assembly"
          className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-xs flex items-center gap-1.5 shadow-md shadow-primary/20 hover:opacity-90 transition-opacity shrink-0"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Launch Challenge</span>
        </Link>
      </div>

      {/* Game Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {games.map((g) => {
          const Icon = g.icon;
          return (
            <div
              key={g.id}
              className="group relative rounded-2xl bg-card border border-border p-6 flex flex-col justify-between gap-5 hover:border-primary/40 hover:shadow-lg transition-all"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className={`w-12 h-12 rounded-2xl ${g.iconBg} flex items-center justify-center shadow-xs`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-muted text-muted-foreground border border-border">
                    {g.badge}
                  </span>
                </div>

                <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                  {g.title}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {g.description}
                </p>

                <div className="pt-2 flex flex-wrap gap-1.5">
                  {g.mechanics.map((m, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-md bg-muted/60 text-[10px] text-muted-foreground font-medium"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>

              <Link
                href={g.href}
                className="w-full mt-2 py-2.5 px-4 rounded-xl bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-xs"
              >
                <span>Play Game</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          );
        })}
      </div>

      {/* Recent Activity & Verification Note */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Recent Games Log */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-card border border-border space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span>Recent Mini-Game Sessions</span>
            </h3>
            <Link
              href="/dashboard"
              className="text-xs text-primary font-semibold hover:underline flex items-center gap-1"
            >
              <span>Full Analytics</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {recentSessions.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-muted/30 border border-dashed border-border text-xs text-muted-foreground">
              No mini-game sessions played yet. Select any game above to start your first session!
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recentSessions.map((session) => (
                <div key={session.sessionId} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
                      {session.accuracy}%
                    </div>
                    <div>
                      <span className="font-semibold text-foreground block">
                        {session.gameTitle}
                      </span>
                      <span className="text-muted-foreground text-[11px]">
                        Surah {session.surahName} &bull; {session.score} pts &bull; {session.comboMax}x combo
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="font-bold text-primary block">+{session.xpEarned} XP</span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(session.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Col: Quranic Authenticity Seal */}
        <div className="p-6 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 space-y-3">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-bold text-sm">
            <ShieldCheck className="w-5 h-5" />
            <span>Verified Quranic Integrity</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            All text tokens, letter shapes, vowel marks (tashkeel), and stop markers across our 2D canvas games are verified against the King Fahd Glorious Quran Printing Complex and Tanzil canonical Uthmani Hafs repository.
          </p>
          <div className="pt-2 border-t border-emerald-500/20 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-1.5 py-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Full Medina Uthmani orthography</span>
            </div>
            <div className="flex items-center gap-1.5 py-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Authentic verse boundaries</span>
            </div>
            <div className="flex items-center gap-1.5 py-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Sheikh Alafasy acoustic reference</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
