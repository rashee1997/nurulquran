'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  BookOpen, 
  MessagesSquare, 
  Brain, 
  Compass, 
  Clock, 
  Settings, 
  Flame, 
  Award,
  Menu,
  X,
  Layers,
  Gamepad2,
  ChevronDown,
  Check,
  LayoutGrid,
  Languages,
  Sparkles,
  Bookmark,
  BarChart3,
  Search
} from 'lucide-react';
import { XPBar } from './gamification/XPBar';
import { StreakBadge } from './gamification/StreakBadge';
import { AchievementModal } from './gamification/AchievementModal';
import { TutorPanel } from './ai/TutorPanel';
import { ThemeToggle } from './ThemeToggle';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, initializeDatabase } from '@/lib/db';
import { calculateLevel, getAchievementsList } from '@/lib/learning/xp-engine';

interface NavItem {
  href: string;
  label: string;
  desc: string;
  icon: React.ElementType;
  badge?: string;
}

interface NavCategory {
  category: string;
  items: NavItem[];
}

const NAV_CATEGORIES: NavCategory[] = [
  {
    category: 'Core Study',
    items: [
      { href: '/dashboard', label: 'Dashboard', desc: 'Progress, streak and recent activity', icon: Compass },
      { href: '/quran', label: 'Quran Reader', desc: 'Uthmani text with audio, morphology and translations', icon: BookOpen },
      { href: '/learn', label: 'Curriculum', desc: 'Tajweed and Arabic lessons, Levels 1–10', icon: BookOpen },
      { href: '/arabic-lab', label: 'Arabic Lab', desc: 'Quranic and spoken Arabic, writing and iʿrāb', icon: Languages },
      { href: '/lessons/tafsir', label: 'Tafseer Lessons', desc: 'Bilingual exegesis with a live voice storyteller', icon: Sparkles },
      { href: '/library', label: 'Library', desc: 'Bookmarks, collections and your notes', icon: Bookmark },
    ],
  },
  {
    category: 'Memorization',
    items: [
      { href: '/games', label: 'Practice Games', desc: 'Word order, similar-verse and recall drills', icon: Gamepad2 },
      { href: '/memorize', label: 'Memorization Modes', desc: 'Ten recall drills linked to spaced repetition', icon: Brain },
      { href: '/memorize/planner', label: 'Hifz Planner', desc: 'Daily portions and memorization targets', icon: Layers },
      { href: '/review', label: 'Review Queue', desc: 'Today’s spaced-repetition review queue', icon: Clock },
      { href: '/progress', label: 'Progress & Goals', desc: 'Heatmap, goals, weak spots and reminders', icon: BarChart3 },
    ],
  },
  {
    category: 'Preferences',
    items: [
      { href: '/settings', label: 'Settings', desc: 'Audio, language, theme and data backup', icon: Settings },
    ],
  },
];

const ALL_NAV_ITEMS: NavItem[] = NAV_CATEGORIES.flatMap((c) => c.items);

export const NavigationHeader: React.FC = () => {
  const pathname = usePathname();
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [isAchievementOpen, setIsAchievementOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);

  // Sync state during render when navigating back/forward
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setDropdownOpen(false);
    setMobileMenuOpen(false);
  }

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Seed the profile row once. Everything below *reacts* to the database instead of polling
  // it, so the header repaints only when a row actually changes.
  useEffect(() => {
    void initializeDatabase().catch((error: unknown) => {
      console.warn('Profile could not be initialised:', error);
    });
  }, []);

  /**
   * Live views over the learner's data.
   *
   * This replaced a `setInterval` that re-queried IndexedDB every three seconds on every
   * route — including the landing page — and pushed fresh objects into state each tick, so the
   * whole header re-rendered three times a second whether or not anything had changed, while
   * the memorised-verse count used a compound `.or()` that scans. `anyOf` uses the `state`
   * index and `useLiveQuery` fires only on real writes.
   */
  const profile = useLiveQuery(() => db.userProfile.get('default_user'), [], undefined);
  const memorizedCount = useLiveQuery(
    () => db.verseProgress.where('state').anyOf('memorized', 'mastered').count(),
    [],
    0
  );
  const completedLessonsCount = useLiveQuery(() => db.lessonHistory.count(), [], 0);

  // Handle outside click & escape key for dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setDropdownOpen(false);
        setMobileMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Determine current active navigation item
  const getActiveItem = (): NavItem => {
    if (pathname === '/' || pathname.startsWith('/dashboard')) {
      return ALL_NAV_ITEMS.find((i) => i.href === '/dashboard') || ALL_NAV_ITEMS[0];
    }
    // Match specific paths first
    if (pathname.startsWith('/memorize/planner')) {
      return ALL_NAV_ITEMS.find((i) => i.href === '/memorize/planner') || ALL_NAV_ITEMS[0];
    }
    if (pathname.startsWith('/memorize')) {
      return ALL_NAV_ITEMS.find((i) => i.href === '/memorize') || ALL_NAV_ITEMS[0];
    }
    if (pathname.startsWith('/games')) {
      return ALL_NAV_ITEMS.find((i) => i.href === '/games') || ALL_NAV_ITEMS[0];
    }
    if (pathname.startsWith('/quran')) {
      return ALL_NAV_ITEMS.find((i) => i.href === '/quran') || ALL_NAV_ITEMS[0];
    }
    if (pathname.startsWith('/arabic-lab')) {
      return ALL_NAV_ITEMS.find((i) => i.href === '/arabic-lab') || ALL_NAV_ITEMS[0];
    }
    if (pathname.startsWith('/lessons/tafsir')) {
      return ALL_NAV_ITEMS.find((i) => i.href === '/lessons/tafsir') || ALL_NAV_ITEMS[0];
    }
    if (pathname.startsWith('/learn')) {
      return ALL_NAV_ITEMS.find((i) => i.href === '/learn') || ALL_NAV_ITEMS[0];
    }
    if (pathname.startsWith('/review')) {
      return ALL_NAV_ITEMS.find((i) => i.href === '/review') || ALL_NAV_ITEMS[0];
    }
    if (pathname.startsWith('/settings')) {
      return ALL_NAV_ITEMS.find((i) => i.href === '/settings') || ALL_NAV_ITEMS[0];
    }
    if (pathname.startsWith('/library')) {
      return ALL_NAV_ITEMS.find((i) => i.href === '/library') || ALL_NAV_ITEMS[0];
    }
    if (pathname.startsWith('/progress')) {
      return ALL_NAV_ITEMS.find((i) => i.href === '/progress') || ALL_NAV_ITEMS[0];
    }
    return ALL_NAV_ITEMS[0];
  };

  const activeItem = getActiveItem();
  const ActiveIcon = activeItem.icon;

  const levelInfo = calculateLevel(profile?.totalXp ?? 0);
  const achievements = getAchievementsList({
    totalXp: profile?.totalXp ?? 0,
    streakCount: profile?.streakCount || 1,
    memorizedCount,
    completedLessonsCount,
  });

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-card/95 backdrop-blur-md border-b border-border transition-colors">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-4">
          {/* Left Side: Brand Logo + Dropdown Navigation Selector */}
          <div className="flex items-center gap-2 sm:gap-4 shrink-0 min-w-0">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 sm:gap-2.5 shrink-0 group" title="NurulQuran Home">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-md shadow-primary/20 group-hover:scale-105 transition-transform">
                <span className="font-arabic text-lg sm:text-xl font-bold" lang="ar" dir="rtl">
                  ن
                </span>
              </div>
              <div className="flex flex-col">
                <span className="font-extrabold text-sm sm:text-base tracking-tight text-foreground leading-none">
                  NurulQuran
                </span>
                <span className="hidden sm:block text-[9px] text-primary font-bold tracking-wider uppercase mt-0.5">
                  Quran & Arabic study
                </span>
              </div>
            </Link>

            {/* Subtle Divider */}
            <div className="h-6 w-px bg-border/80 shrink-0 hidden xs:block" />

            {/* Navigation Menu Dropdown Selector */}
            <div className="relative shrink-0" ref={dropdownRef}>
              <button
                id="header-nav-dropdown-btn"
                onClick={() => setDropdownOpen((prev) => !prev)}
                type="button"
                aria-haspopup="true"
                aria-expanded={dropdownOpen}
                className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl border text-left transition-all cursor-pointer select-none text-xs font-semibold ${
                  dropdownOpen
                    ? 'border-primary bg-primary/10 text-primary shadow-xs'
                    : 'border-border bg-muted/40 hover:bg-muted text-foreground hover:border-border-strong'
                }`}
              >
                <div className="w-5 h-5 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <ActiveIcon className="w-3.5 h-3.5" />
                </div>
                <span className="font-bold truncate max-w-[95px] sm:max-w-[140px] md:max-w-[170px]">
                  {activeItem.label}
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 shrink-0 ${
                    dropdownOpen ? 'rotate-180 text-primary' : ''
                  }`}
                />
              </button>

              {/* Dropdown Menu Popover */}
              {dropdownOpen && (
                <div className="absolute top-full left-0 mt-2 w-[290px] sm:w-[350px] max-h-[calc(100vh-80px)] overflow-y-auto rounded-2xl border border-border bg-card/98 backdrop-blur-xl shadow-2xl p-2.5 z-50 animate-in fade-in-50 zoom-in-95 duration-150 space-y-3">
                  <div className="px-2 py-1.5 flex items-center justify-between border-b border-border/60">
                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <LayoutGrid className="w-3 h-3 text-primary" />
                      <span>Go to</span>
                    </span>
                  </div>

                  {NAV_CATEGORIES.map((cat, catIdx) => (
                    <div key={catIdx} className="space-y-1">
                      <div className="px-2 text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider">
                        {cat.category}
                      </div>
                      <div className="space-y-0.5">
                        {cat.items.map((item) => {
                          const ItemIcon = item.icon;
                          const isCurrent = activeItem.href === item.href;

                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              onClick={() => setDropdownOpen(false)}
                              className={`flex items-start gap-2.5 p-2 rounded-xl text-left transition-all ${
                                isCurrent
                                  ? 'bg-primary/10 text-primary font-bold shadow-2xs'
                                  : 'text-foreground hover:bg-muted/70 hover:text-foreground'
                              }`}
                            >
                              <div
                                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                                  isCurrent
                                    ? 'bg-primary text-primary-foreground shadow-xs'
                                    : 'bg-muted text-muted-foreground'
                                }`}
                              >
                                <ItemIcon className="w-3.5 h-3.5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-bold truncate">{item.label}</span>
                                  {item.badge && (
                                    <span className="px-1.5 py-0.2 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[9px] font-black uppercase">
                                      {item.badge}
                                    </span>
                                  )}
                                  {isCurrent && (
                                    <Check className="w-3 h-3 text-primary ml-auto shrink-0" />
                                  )}
                                </div>
                                <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5 font-normal">
                                  {item.desc}
                                </p>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Side Action Bar: Responsive, Never Overflows */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {/* Gamification Level & XP: Only shown on larger screens to strictly prevent overflow */}
            <div className="hidden lg:flex items-center gap-2 shrink-0">
              <XPBar
                currentXp={levelInfo.currentLevelXp}
                nextLevelXp={levelInfo.nextLevelXp}
                level={levelInfo.level}
                title={levelInfo.title}
              />
            </div>

            {/* Streak Indicator Badge */}
            <div className="shrink-0">
              <StreakBadge
                streak={profile?.streakCount || 1}
                onClick={() => setIsAchievementOpen(true)}
              />
            </div>

            {/* Theme Toggle Button */}
            <div className="shrink-0">
              <ThemeToggle id="header-theme-toggle-btn" />
            </div>

            {/* Achievements & Badges Modal Trigger */}
            <button
              id="achievement-modal-trigger"
              onClick={() => setIsAchievementOpen(true)}
              type="button"
              className="p-2 rounded-xl text-foreground hover:bg-muted border border-border transition-colors shadow-2xs shrink-0"
              title="View Achievements & Badges"
            >
              <Award className="w-4 h-4 text-amber-500" />
            </button>

            {/* AI Tutor Trigger Button */}
            <button
              id="open-tutor-btn"
              onClick={() => setIsAiOpen(true)}
              type="button"
              aria-label="Open Study Assistant"
              className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold shadow-md shadow-primary/20 active:scale-95 transition-all shrink-0"
            >
              <MessagesSquare className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Study Assistant</span>
            </button>

            {/* Mobile Drawer Menu Toggle */}
            <button
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              type="button"
              className="md:hidden p-2 rounded-xl text-muted-foreground hover:bg-muted border border-border shrink-0"
              aria-label="Toggle Navigation Drawer"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Slide-Down Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border bg-card/98 backdrop-blur-md p-4 space-y-4 animate-in slide-in-from-top-2 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <XPBar
                currentXp={levelInfo.currentLevelXp}
                nextLevelXp={levelInfo.nextLevelXp}
                level={levelInfo.level}
                title={levelInfo.title}
              />
              <StreakBadge
                streak={profile?.streakCount || 1}
                onClick={() => {
                  setMobileMenuOpen(false);
                  setIsAchievementOpen(true);
                }}
              />
            </div>

            <div className="space-y-3">
              {NAV_CATEGORIES.map((cat, catIdx) => (
                <div key={catIdx} className="space-y-1.5">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">
                    {cat.category}
                  </span>
                  <div className="grid grid-cols-1 gap-1">
                    {cat.items.map((item) => {
                      const ItemIcon = item.icon;
                      const isCurrent = activeItem.href === item.href;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`flex items-center justify-between p-2.5 rounded-xl text-xs font-semibold ${
                            isCurrent
                              ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                              : 'bg-muted/40 text-foreground hover:bg-muted'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <ItemIcon className="w-4 h-4" />
                            <span>{item.label}</span>
                            {item.badge && (
                              <span className="px-1.5 py-0.2 rounded-md bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[9px] font-bold">
                                {item.badge}
                              </span>
                            )}
                          </div>
                          {isCurrent && <Check className="w-3.5 h-3.5" />}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
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

