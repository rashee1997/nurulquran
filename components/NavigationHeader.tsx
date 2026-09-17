'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  BookOpen, 
  Sparkles, 
  Brain, 
  Compass, 
  Clock, 
  Settings, 
  Flame, 
  Award,
  Menu,
  X
} from 'lucide-react';
import { XPBar } from './gamification/XPBar';
import { StreakBadge } from './gamification/StreakBadge';
import { AchievementModal } from './gamification/AchievementModal';
import { TutorPanel } from './ai/TutorPanel';
import { db, UserProfile, initializeDatabase } from '@/lib/db';
import { calculateLevel, getAchievementsList } from '@/lib/learning/xp-engine';

export const NavigationHeader: React.FC = () => {
  const pathname = usePathname();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState({ memorizedCount: 0, completedLessonsCount: 0 });
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [isAchievementOpen, setIsAchievementOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    async function loadData() {
      const p = await initializeDatabase();
      setProfile(p);
      if (typeof window !== 'undefined') {
        const memCount = await db.verseProgress.where('state').equals('memorized').or('state').equals('mastered').count();
        const lesCount = await db.lessonHistory.count();
        setStats({ memorizedCount: memCount, completedLessonsCount: lesCount });
      }
    }
    loadData();

    // Listen for database changes periodically or on route change
    const interval = setInterval(async () => {
      if (typeof window !== 'undefined') {
        const p = await db.userProfile.get('default_user');
        if (p) setProfile(p);
        const memCount = await db.verseProgress.where('state').equals('memorized').or('state').equals('mastered').count();
        const lesCount = await db.lessonHistory.count();
        setStats({ memorizedCount: memCount, completedLessonsCount: lesCount });
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [pathname]);

  const levelInfo = calculateLevel(profile?.totalXp ?? 0);
  const achievements = getAchievementsList({
    totalXp: profile?.totalXp ?? 0,
    streakCount: profile?.streakCount || 1,
    memorizedCount: stats.memorizedCount,
    completedLessonsCount: stats.completedLessonsCount,
  });

  const navLinks = [
    { href: '/', label: 'Dashboard', icon: Compass },
    { href: '/learn', label: 'Curriculum', icon: BookOpen },
    { href: '/learn/alphabet', label: 'Alphabet Studio', icon: Sparkles },
    { href: '/quran', label: 'Quran Reader', icon: BookOpen },
    { href: '/memorize', label: '10 Hifz Modes', icon: Brain },
    { href: '/review', label: 'SRS Queue', icon: Clock },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          {/* Logo */}
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-xl bg-linear-to-br from-emerald-600 to-emerald-800 flex items-center justify-center text-white shadow-md shadow-emerald-700/20 group-hover:scale-105 transition-transform">
                <span className="font-arabic text-xl font-bold">ن</span>
              </div>
              <div className="flex flex-col">
                <span className="font-extrabold text-base tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-1">
                  NurulQuran
                </span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold tracking-wider uppercase -mt-0.5">
                  Hifz & Arabic AI
                </span>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-1">
              {navLinks.map((link) => {
                const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      isActive
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Action Bar */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Gamification indicators */}
            <div className="hidden sm:flex items-center gap-2">
              <XPBar
                currentXp={levelInfo.currentLevelXp}
                nextLevelXp={levelInfo.nextLevelXp}
                level={levelInfo.level}
                title={levelInfo.title}
              />
              <StreakBadge
                streak={profile?.streakCount || 1}
                onClick={() => setIsAchievementOpen(true)}
              />
            </div>

            {/* Achievement trigger */}
            <button
              id="achievement-modal-trigger"
              onClick={() => setIsAchievementOpen(true)}
              className="p-2 rounded-xl text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50 border border-amber-200 dark:border-amber-800/40 transition-colors shadow-2xs"
              title="View Achievements & Badges"
            >
              <Award className="w-4 h-4" />
            </button>

            {/* AI Tutor Button */}
            <button
              id="open-tutor-btn"
              onClick={() => setIsAiOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-linear-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-bold shadow-md shadow-emerald-600/20 active:scale-95 transition-all"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span className="hidden sm:inline">AI Tutor</span>
            </button>

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu dropdown */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 animate-in slide-in-from-top-2">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <XPBar
                currentXp={levelInfo.currentLevelXp}
                nextLevelXp={levelInfo.nextLevelXp}
                level={levelInfo.level}
                title={levelInfo.title}
              />
              <StreakBadge
                streak={profile?.streakCount || 1}
                onClick={() => setIsAchievementOpen(true)}
              />
            </div>

            <nav className="grid grid-cols-2 gap-2">
              {navLinks.map((link) => {
                const isActive = pathname === link.href;
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-2 p-2.5 rounded-xl text-xs font-semibold ${
                      isActive
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        )}
      </header>

      {/* Floating AI Tutor Panel */}
      <TutorPanel isOpen={isAiOpen} onClose={() => setIsAiOpen(false)} />

      {/* Achievement & Badges Modal */}
      <AchievementModal
        isOpen={isAchievementOpen}
        onClose={() => setIsAchievementOpen(false)}
        achievements={achievements}
        totalXp={profile?.totalXp ?? 0}
      />
    </>
  );
};
