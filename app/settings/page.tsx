'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { db, UserProfile, exportDatabaseJson, importDatabaseJson, resetDatabase } from '@/lib/db';
import { RECITERS } from '@/components/quran/AudioBar';
import { OfflinePanel } from '@/components/settings/OfflinePanel';
import { Settings, Download, Upload, RotateCcw, Bot, Check, AlertCircle, Sparkles, Sun, Moon, Monitor, Volume2, Play, Mic, Globe, GraduationCap } from 'lucide-react';
import { useTheme } from '@/hooks/use-theme';
import { useLocale } from '@/lib/i18n/useLocale';
import { localDayKey } from '@/lib/time/day';
import { AI_TEACHER_VOICES, playVoiceHarmonicPreview } from '@/lib/audio/pcm-audio';
import {
  FEEDBACK_LANGUAGE_OPTIONS,
  FeedbackLanguage,
  normalizeFeedbackLanguage,
} from '@/lib/i18n/language';

export default function SettingsPage() {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  const { locale, setLocale, t } = useLocale();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [selectedReciter, setSelectedReciter] = useState('ar.alafasy');
  const [showEnglish, setShowEnglish] = useState(true);
  const [showTamil, setShowTamil] = useState(true);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [backupStatus, setBackupStatus] = useState<{ tone: 'success' | 'error'; message: string } | null>(
    null
  );
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [previewVoiceId, setPreviewVoiceId] = useState<string | null>(null);
  const [preferenceSavedNotice, setPreferenceSavedNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * Shows one result line for the backup controls.
   *
   * Failures used to be rendered through the success panel (green border, check icon),
   * so "Import failed" — often because the file was a different app's JSON — looked
   * like a completed import. Tone now decides the styling, and a new message replaces
   * the pending clear timer instead of racing it.
   */
  const notify = useCallback((tone: 'success' | 'error', message: string, ttlMs = 5000): void => {
    setBackupStatus({ tone, message });
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => setBackupStatus(null), ttlMs);
  }, []);

  // A queued clear timer must not fire after the page is gone.
  useEffect(
    () => () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    },
    []
  );

  // Single source of truth: what the AI teacher writes AND what the preview speaks
  const feedbackLanguage = normalizeFeedbackLanguage(profile?.aiFeedbackLanguage);
  const activeLanguageOption =
    FEEDBACK_LANGUAGE_OPTIONS.find((option) => option.id === feedbackLanguage) ||
    FEEDBACK_LANGUAGE_OPTIONS[0];

  useEffect(() => {
    async function load() {
      const p = await db.userProfile.get('default_user');
      if (p) setProfile(p);
    }
    load();
  }, []);

  const handleExport = async () => {
    try {
      const json = await exportDatabaseJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nurulquran_backup_${localDayKey()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
      notify('success', 'Backup downloaded to your downloads folder.');
    } catch (err) {
      console.error('Export failed:', err);
      notify('error', 'The backup could not be written. Check that this browser allows downloads.');
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const res = await importDatabaseJson(text);
      if (res.success) {
        notify('success', res.summary ?? 'Backup restored.');
        const p = await db.userProfile.get('default_user');
        if (p) setProfile(p);
      } else {
        notify('error', `Nothing was imported — ${res.error ?? 'the file could not be read.'}`);
      }
    } catch (err) {
      console.error('Import failed:', err);
      notify('error', 'That file could not be read.');
    } finally {
      // Clear the input so picking the same file again still fires a change event.
      e.target.value = '';
    }
  };

  const handleReset = async () => {
    if (confirm('Reset all learning progress? This cannot be undone.')) {
      await resetDatabase();
      const p = await db.userProfile.get('default_user');
      if (p) setProfile(p);
      notify('success', 'All progress was reset on this device.', 3000);
    }
  };

  const handleVoiceChange = async (voiceId: string) => {
    if (!profile) return;
    const updated = { ...profile, aiVoiceId: voiceId };
    setProfile(updated);
    await db.userProfile.update('default_user', { aiVoiceId: voiceId });
    setPreferenceSavedNotice('Voice updated.');
    setTimeout(() => setPreferenceSavedNotice(null), 3000);
  };

  const handlePersonaChange = async (persona: 'gentle' | 'balanced' | 'strict') => {
    if (!profile) return;
    const updated = { ...profile, aiTeacherPersona: persona };
    setProfile(updated);
    await db.userProfile.update('default_user', { aiTeacherPersona: persona });
    setPreferenceSavedNotice('Feedback level updated.');
    setTimeout(() => setPreferenceSavedNotice(null), 3000);
  };

  const handleLanguageChange = async (lang: FeedbackLanguage) => {
    if (!profile) return;
    const updated = { ...profile, aiFeedbackLanguage: lang };
    setProfile(updated);
    await db.userProfile.update('default_user', { aiFeedbackLanguage: lang });
    setPreferenceSavedNotice('Feedback language updated.');
    setTimeout(() => setPreferenceSavedNotice(null), 3000);
  };

  const handlePlayVoicePreview = async (e: React.MouseEvent, voiceId: string) => {
    e.stopPropagation();
    try {
      setPreviewVoiceId(voiceId);
      await playVoiceHarmonicPreview(voiceId, undefined, feedbackLanguage);
      // Bilingual previews speak English then Tamil, so give them more time before resetting
      setTimeout(() => {
        setPreviewVoiceId((current) => (current === voiceId ? null : current));
      }, feedbackLanguage === 'both' ? 7000 : 4500);
    } catch (err) {
      console.warn('Voice preview playback error:', err);
      setPreviewVoiceId(null);
    }
  };

  return (
    <div id="settings-page" className="max-w-2xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Title */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Settings className="w-6 h-6 text-primary" />
          <span>{t('settings.title', 'Settings')}</span>
        </h1>
        <p className="text-xs text-muted-foreground">
          Reader preferences, appearance, audio, language and a local backup of your data.
        </p>
      </div>

      {/* Appearance & Color Theme Section */}
      <div id="theme-settings-section" className="p-6 rounded-3xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-foreground">
              Appearance
            </h3>
            <p className="text-xs text-muted-foreground">
              Choose a theme or match your system.
            </p>
          </div>
          <button
            id="settings-theme-toggle-btn"
            type="button"
            onClick={toggleTheme}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-surface hover:bg-surface-hover text-xs font-semibold text-foreground transition-colors shadow-2xs"
          >
            {resolvedTheme === 'dark' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-secondary-strong" />
                <span>Switch to Light</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-primary-strong" />
                <span>Switch to Dark</span>
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 pt-2">
          <button
            type="button"
            onClick={() => setTheme('light')}
            className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col items-start justify-between gap-2.5 ${
              theme === 'light'
                ? 'border-primary bg-primary-subtle ring-2 ring-primary/20'
                : 'border-border bg-surface hover:bg-surface-hover'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div className="w-7 h-7 rounded-lg bg-secondary-subtle flex items-center justify-center text-secondary-strong">
                <Sun className="w-4 h-4" />
              </div>
              {theme === 'light' && <Check className="w-4 h-4 text-primary" />}
            </div>
            <div>
              <div className="text-xs font-bold text-foreground">Light Mode</div>
              <div className="text-[10px] text-muted-foreground">Always light</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setTheme('dark')}
            className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col items-start justify-between gap-2.5 ${
              theme === 'dark'
                ? 'border-primary bg-primary-subtle ring-2 ring-primary/20'
                : 'border-border bg-surface hover:bg-surface-hover'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div className="w-7 h-7 rounded-lg bg-surface-muted flex items-center justify-center text-primary">
                <Moon className="w-4 h-4" />
              </div>
              {theme === 'dark' && <Check className="w-4 h-4 text-primary" />}
            </div>
            <div>
              <div className="text-xs font-bold text-foreground">Dark Mode</div>
              <div className="text-[10px] text-muted-foreground">Always dark</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setTheme('system')}
            className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col items-start justify-between gap-2.5 ${
              theme === 'system'
                ? 'border-primary bg-primary-subtle ring-2 ring-primary/20'
                : 'border-border bg-surface hover:bg-surface-hover'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div className="w-7 h-7 rounded-lg bg-surface-muted flex items-center justify-center text-foreground">
                <Monitor className="w-4 h-4" />
              </div>
              {theme === 'system' && <Check className="w-4 h-4 text-primary" />}
            </div>
            <div>
              <div className="text-xs font-bold text-foreground">System Default</div>
              <div className="text-[10px] text-muted-foreground">Sync with OS theme</div>
            </div>
          </button>
        </div>
      </div>

      {/* Interface Language Section */}
      <div id="language-settings-section" className="p-6 rounded-3xl bg-card border border-border shadow-xs space-y-4">
        <div className="space-y-0.5">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" />
            <span>{t('settings.language.title', 'Interface language')}</span>
          </h3>
          <p className="text-xs text-muted-foreground">
            {t(
              'settings.language.desc',
              'Language for navigation, dashboard and settings chrome — scripture translations are unaffected.'
            )}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => void setLocale('en')}
            className={`flex-1 p-3.5 rounded-2xl border text-left transition-all ${
              locale === 'en'
                ? 'border-primary bg-primary-subtle ring-2 ring-primary/20'
                : 'border-border bg-surface hover:bg-surface-hover'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground">{t('settings.language.english', 'English')}</span>
              {locale === 'en' && <Check className="w-4 h-4 text-primary" />}
            </div>
          </button>
          <button
            type="button"
            onClick={() => void setLocale('ta')}
            className={`flex-1 p-3.5 rounded-2xl border text-left transition-all ${
              locale === 'ta'
                ? 'border-primary bg-primary-subtle ring-2 ring-primary/20'
                : 'border-border bg-surface hover:bg-surface-hover'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground">{t('settings.language.tamil', 'தமிழ்')}</span>
              {locale === 'ta' && <Check className="w-4 h-4 text-primary" />}
            </div>
          </button>
        </div>
      </div>

      <OfflinePanel />

      {/* AI Tajweed Teacher & Voice Preferences Section */}
      <div id="ai-teacher-voice-section" className="p-6 rounded-3xl bg-card border border-border shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-0.5">
            <h3 className="text-base font-bold text-foreground">
              Recitation Guide
            </h3>
            <p className="text-xs text-muted-foreground">
              Choose the voice, feedback level and language used by the Recitation Guide.
            </p>
          </div>

          {preferenceSavedNotice && (
            <div className="px-3 py-1.5 rounded-xl bg-success-subtle border border-success/30 text-success-strong text-xs font-semibold flex items-center gap-1.5 animate-in fade-in shrink-0">
              <Check className="w-3.5 h-3.5 text-success" />
              <span>{preferenceSavedNotice}</span>
            </div>
          )}
        </div>

        {/* Voice Selection Cards */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
              1. Qari voice
            </h4>
            <span className="text-[11px] text-muted-foreground">
              Select a voice • Samples speak {activeLanguageOption.short}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {AI_TEACHER_VOICES.map((v) => {
              const isSelected = (profile?.aiVoiceId || 'Kore') === v.id;
              const isPlaying = previewVoiceId === v.id;

              return (
                <div
                  key={v.id}
                  onClick={() => handleVoiceChange(v.id)}
                  className={`p-4 rounded-2xl border text-left cursor-pointer transition-all flex flex-col justify-between gap-3 ${
                    isSelected
                      ? 'border-primary bg-primary-subtle ring-2 ring-primary/20 shadow-xs'
                      : 'border-border bg-surface hover:bg-surface-hover'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-foreground">{v.name}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          v.gender === 'female'
                            ? 'bg-secondary-subtle text-secondary-strong'
                            : 'bg-info-subtle text-info-strong'
                        }`}
                      >
                        {v.gender === 'female' ? 'Female' : 'Male'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => handlePlayVoicePreview(e, v.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                          isPlaying
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-surface-muted hover:bg-card border border-border text-foreground'
                        }`}
                        title={`Play a sample of ${v.name}`}
                      >
                        <Volume2 className="w-3.5 h-3.5 text-primary" />
                        <span>{isPlaying ? 'Playing' : 'Play sample'}</span>
                      </button>

                      {isSelected && (
                        <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                          <Check className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs text-foreground font-medium leading-snug">{v.toneEn}</p>
                    <p className="font-tamil text-[11px] text-muted-foreground leading-snug">{v.toneTa}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Teaching Persona & Style */}
        <div className="space-y-3 pt-2 border-t border-border">
          <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
            2. Feedback level
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                id: 'gentle',
                name: 'Encouraging',
                desc: 'Overlooks minor pronunciation details while you build confidence.',
              },
              {
                id: 'balanced',
                name: 'Standard',
                desc: 'Checks Makhraj, vowel counts and common slips. Recommended.',
              },
              {
                id: 'strict',
                name: 'Strict',
                desc: 'Hafs standard. Enforces Ghunnah counts, Sifaat and stops exactly.',
              },
            ].map((p) => {
              const isSelected = (profile?.aiTeacherPersona || 'balanced') === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handlePersonaChange(p.id as 'gentle' | 'balanced' | 'strict')}
                  className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between gap-1.5 ${
                    isSelected
                      ? 'border-primary bg-primary-subtle ring-2 ring-primary/20'
                      : 'border-border bg-surface hover:bg-surface-hover'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-bold text-foreground">{p.name}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-primary" />}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{p.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Feedback Language */}
        <div className="space-y-3 pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
              3. Feedback Language Preference
            </h4>
            <span className="text-[11px] text-muted-foreground">
              Applies to voice samples, Recitation Guide replies and written feedback
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {FEEDBACK_LANGUAGE_OPTIONS.map((lang) => {
              const isSelected = feedbackLanguage === lang.id;
              return (
                <button
                  key={lang.id}
                  type="button"
                  onClick={() => handleLanguageChange(lang.id)}
                  className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between gap-1 ${
                    isSelected
                      ? 'border-primary bg-primary-subtle ring-2 ring-primary/20'
                      : 'border-border bg-surface hover:bg-surface-hover'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-bold text-foreground">{lang.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-primary" />}
                  </div>
                  <span className="text-[10px] text-muted-foreground">{lang.sub}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* AI BYOK Callout Card */}
      <div className="p-6 rounded-3xl bg-hero-bg text-hero-fg border border-hero-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-md">          <div className="space-y-1">
          <h3 className="text-base font-bold">AI providers</h3>
          <p className="text-xs text-hero-muted max-w-sm">
            Use your own API key with Gemini, OpenAI, Anthropic, Groq, Mistral or a local Ollama endpoint. Keys stay in this browser.
          </p>
        </div>

        <Link
          href="/settings/ai"
          className="px-4 py-2.5 rounded-xl bg-secondary hover:bg-secondary-hover text-secondary-foreground text-xs font-bold transition-all shadow-md shrink-0"
        >
          Manage providers
        </Link>
      </div>

      {/* Audio & Reciter Settings */}
      <div className="p-6 rounded-3xl bg-card border border-border shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-foreground">
          Default Reciter
        </h3>
        <div className="space-y-2">
          <select
            value={selectedReciter}
            onChange={(e) => setSelectedReciter(e.target.value)}
            className="w-full text-xs p-3 rounded-xl bg-surface border border-border outline-hidden text-foreground focus:ring-2 focus:ring-primary"
          >
            {RECITERS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground">
            Murattal recordings stream on demand.
          </p>
        </div>
      </div>

      {/* Local-First Data Ownership & Export / Import */}
      <div className="p-6 rounded-3xl bg-card border border-border shadow-xs space-y-5">
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-foreground">
            Data and backup
          </h3>
          <p className="text-xs text-muted-foreground">
            Review intervals, lesson history, game sessions and Arabic Lab progress are stored in
            this browser and never uploaded. The backup is a plain JSON file; importing one
            replaces the matching data on this device. Quran text is not included — it is fetched
            again from the text service.
          </p>
        </div>

        {backupStatus && (
          <div
            role="status"
            aria-live="polite"
            className={
              backupStatus.tone === 'success'
                ? 'p-3.5 rounded-xl bg-success-subtle border border-success/30 text-xs text-success-strong flex items-center gap-2'
                : 'p-3.5 rounded-xl bg-danger-subtle border border-danger/30 text-xs text-danger-strong flex items-center gap-2'
            }
          >
            {backupStatus.tone === 'success' ? (
              <Check className="w-4 h-4 text-success shrink-0" aria-hidden="true" />
            ) : (
              <AlertCircle className="w-4 h-4 text-danger shrink-0" aria-hidden="true" />
            )}
            <span>{backupStatus.message}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Export button */}
          <button
            onClick={handleExport}
            className="flex items-center justify-center gap-2 p-3.5 rounded-xl bg-surface hover:bg-surface-hover border border-border text-foreground text-xs font-bold transition-colors"
          >
            <Download className="w-4 h-4 text-primary" />
            <span>{exportSuccess ? 'Backup downloaded' : 'Export backup'}</span>
          </button>

          {/* Import button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-2 p-3.5 rounded-xl bg-surface hover:bg-surface-hover border border-border text-foreground text-xs font-bold transition-colors"
          >
            <Upload className="w-4 h-4 text-info" />
            <span>Import backup</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportFile}
            className="hidden"
          />
        </div>

        {/* Reset */}
        <div className="pt-3 border-t border-border flex items-center justify-between">
          <div>
            <h4 className="text-xs font-bold text-destructive">Reset progress</h4>
            <p className="text-[11px] text-muted-foreground">Clears all lesson history and review intervals.</p>
          </div>
          <button
            onClick={handleReset}
            className="px-3.5 py-2 rounded-xl bg-destructive-subtle border border-destructive/30 text-destructive text-xs font-semibold hover:bg-destructive/20 transition-colors"
          >
            Reset Data
          </button>
        </div>
      </div>
    </div>
  );
}
