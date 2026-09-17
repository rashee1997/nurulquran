'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { db, UserProfile, exportDatabaseJson, importDatabaseJson, resetDatabase } from '@/lib/db';
import { RECITERS } from '@/components/quran/AudioBar';
import { Settings, Download, Upload, RotateCcw, Bot, Check, AlertCircle, Sparkles, Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '@/hooks/use-theme';

export default function SettingsPage() {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [selectedReciter, setSelectedReciter] = useState('ar.alafasy');
  const [showEnglish, setShowEnglish] = useState(true);
  const [showTamil, setShowTamil] = useState(true);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
      a.download = `nurulquran_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const res = await importDatabaseJson(text);
      if (res.success) {
        setImportStatus('Successfully imported all learning data!');
        const p = await db.userProfile.get('default_user');
        if (p) setProfile(p);
      } else {
        setImportStatus(`Import error: ${res.error}`);
      }
    } catch (err) {
      setImportStatus('Failed to read backup file.');
    }
    setTimeout(() => setImportStatus(null), 4000);
  };

  const handleReset = async () => {
    if (confirm('Are you sure you want to reset all your learning progress and database? This action cannot be undone.')) {
      await resetDatabase();
      const p = await db.userProfile.get('default_user');
      if (p) setProfile(p);
      setImportStatus('Database reset to defaults.');
      setTimeout(() => setImportStatus(null), 3000);
    }
  };

  return (
    <div id="settings-page" className="max-w-2xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Title */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Settings className="w-6 h-6 text-primary" />
          <span>Application Settings & Data Ownership</span>
        </h1>
        <p className="text-xs text-muted-foreground">
          Configure reader preferences, appearance theme, reciter audio, and complete local-first data backup.
        </p>
      </div>

      {/* Appearance & Color Theme Section */}
      <div id="theme-settings-section" className="p-6 rounded-3xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-foreground">
              Appearance & Color Theme
            </h3>
            <p className="text-xs text-muted-foreground">
              Choose your reading ambiance or synchronize with system appearance.
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
              <div className="text-[10px] text-muted-foreground">Warm daylight clarity</div>
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
              <div className="text-[10px] text-muted-foreground">Nocturnal cypress & obsidian</div>
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

      {/* AI BYOK Callout Card */}
      <div className="p-6 rounded-3xl bg-hero-bg text-hero-fg border border-hero-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-md">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-hero-pill-bg text-hero-pill-fg text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-secondary" />
            <span>AI Model Registry</span>
          </div>
          <h3 className="text-base font-bold">Bring Your Own Key (BYOK)</h3>
          <p className="text-xs text-hero-muted max-w-sm">
            Configure Gemini, OpenAI, Anthropic, Groq, Mistral, or custom Ollama endpoints with local AES-GCM key encryption.
          </p>
        </div>

        <Link
          href="/settings/ai"
          className="px-4 py-2.5 rounded-xl bg-secondary hover:bg-secondary-hover text-secondary-foreground text-xs font-bold transition-all shadow-md shrink-0"
        >
          Manage AI Keys
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
            High-quality murattal audio streams verified from CDN sources.
          </p>
        </div>
      </div>

      {/* Local-First Data Ownership & Export / Import */}
      <div className="p-6 rounded-3xl bg-card border border-border shadow-xs space-y-5">
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-foreground">
            Data Ownership & Offline Backup
          </h3>
          <p className="text-xs text-muted-foreground">
            All your bookmarks, SRS review intervals, and lesson history reside securely in your browser&apos;s IndexedDB. You can export or import at any time.
          </p>
        </div>

        {importStatus && (
          <div className="p-3.5 rounded-xl bg-success-subtle border border-success/30 text-xs text-success-strong flex items-center gap-2">
            <Check className="w-4 h-4 text-success shrink-0" />
            <span>{importStatus}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Export button */}
          <button
            onClick={handleExport}
            className="flex items-center justify-center gap-2 p-3.5 rounded-xl bg-surface hover:bg-surface-hover border border-border text-foreground text-xs font-bold transition-colors"
          >
            <Download className="w-4 h-4 text-primary" />
            <span>{exportSuccess ? 'Backup Downloaded!' : 'Export JSON Backup'}</span>
          </button>

          {/* Import button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-2 p-3.5 rounded-xl bg-surface hover:bg-surface-hover border border-border text-foreground text-xs font-bold transition-colors"
          >
            <Upload className="w-4 h-4 text-info" />
            <span>Import JSON Backup</span>
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
            <h4 className="text-xs font-bold text-destructive">Reset Local Learning Database</h4>
            <p className="text-[11px] text-muted-foreground">Clears all lesson history and SRS intervals.</p>
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
