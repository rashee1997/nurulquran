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
  X,
  Layers
} from 'lucide-react';
import { XPBar } from './gamification/XPBar';
import { StreakBadge } from './gamification/StreakBadge';
import { AchievementModal } from './gamification/AchievementModal';
import { TutorPanel } from './ai/TutorPanel';
import { ThemeToggle } from './ThemeToggle';
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
    { href: '/quran', label: 'Quran Reader', icon: BookOpen },
    { href: '/memorize', label: '10 Hifz Modes', icon: Brain },
    { href: '/memorize/planner', label: 'Hifz Planner', icon: Layers },
    { href: '/review', label: 'SRS Queue', icon: Clock },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-card/90 backdrop-blur-md border-b border-border transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          {/* Logo */}
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-md shadow-primary/20 group-hover:scale-105 transition-transform">
                <span className="font-arabic text-xl font-bold">ن</span>
              </div>
              <div className="flex flex-col">
                <span className="font-extrabold text-base tracking-tight text-foreground flex items-center gap-1">
                  NurulQuran
                </span>
                <span className="text-[10px] text-primary font-semibold tracking-wider uppercase -mt-0.5">
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
                        ? 'bg-primary-subtle text-primary-strong'
                        : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
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

            {/* Theme Switcher Button */}
            <ThemeToggle id="header-theme-toggle-btn" />

            {/* Achievement trigger */}
            <button
              id="achievement-modal-trigger"
              onClick={() => setIsAchievementOpen(true)}
              className="p-2 rounded-xl text-secondary hover:bg-secondary-subtle border border-border transition-colors shadow-2xs"
              title="View Achievements & Badges"
            >
              <Award className="w-4 h-4" />
            </button>

            {/* AI Tutor Button */}
            <button
              id="open-tutor-btn"
              onClick={() => setIsAiOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold shadow-md shadow-primary/20 active:scale-95 transition-all"
            >
              <Sparkles className="w-3.5 h-3.5 text-secondary-strong" />
              <span className="hidden sm:inline">AI Tutor</span>
            </button>

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-xl text-muted-foreground hover:bg-surface-hover"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu dropdown */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-border bg-card p-4 space-y-3 animate-in slide-in-from-top-2">
            <div className="flex items-center justify-between pb-3 border-b border-border">
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
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-surface-muted text-foreground hover:bg-surface-hover'
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
