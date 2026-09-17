'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { db, UserProfile, exportDatabaseJson, importDatabaseJson, resetDatabase } from '@/lib/db';
import { RECITERS } from '@/components/quran/AudioBar';
import { Settings, Download, Upload, RotateCcw, Bot, Check, AlertCircle, Sparkles } from 'lucide-react';

export default function SettingsPage() {
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
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Settings className="w-6 h-6 text-emerald-600" />
          <span>Application Settings & Data Ownership</span>
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Configure reader preferences, reciter audio, and complete local-first data backup.
        </p>
      </div>

      {/* AI BYOK Callout Card */}
      <div className="p-6 rounded-3xl bg-linear-to-r from-emerald-900 to-teal-900 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-md">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-800 text-emerald-200 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>AI Model Registry</span>
          </div>
          <h3 className="text-base font-bold">Bring Your Own Key (BYOK)</h3>
          <p className="text-xs text-emerald-200/90 max-w-sm">
            Configure Gemini, OpenAI, Anthropic, Groq, Mistral, or custom Ollama endpoints with local AES-GCM key encryption.
          </p>
        </div>

        <Link
          href="/settings/ai"
          className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold transition-all shadow-md shrink-0"
        >
          Manage AI Keys
        </Link>
      </div>

      {/* Audio & Reciter Settings */}
      <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
          Default Reciter
        </h3>
        <div className="space-y-2">
          <select
            value={selectedReciter}
            onChange={(e) => setSelectedReciter(e.target.value)}
            className="w-full text-xs p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-hidden text-slate-800 dark:text-slate-200"
          >
            {RECITERS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-400">
            High-quality murattal audio streams verified from CDN sources.
          </p>
        </div>
      </div>

      {/* Local-First Data Ownership & Export / Import */}
      <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Data Ownership & Offline Backup
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            All your bookmarks, SRS review intervals, and lesson history reside securely in your browser&apos;s IndexedDB. You can export or import at any time.
          </p>
        </div>

        {importStatus && (
          <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{importStatus}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Export button */}
          <button
            onClick={handleExport}
            className="flex items-center justify-center gap-2 p-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition-colors"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span>{exportSuccess ? 'Backup Downloaded!' : 'Export JSON Backup'}</span>
          </button>

          {/* Import button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-2 p-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition-colors"
          >
            <Upload className="w-4 h-4 text-blue-600" />
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
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h4 className="text-xs font-bold text-rose-600">Reset Local Learning Database</h4>
            <p className="text-[11px] text-slate-400">Clears all lesson history and SRS intervals.</p>
          </div>
          <button
            onClick={handleReset}
            className="px-3.5 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold hover:bg-rose-100"
          >
            Reset Data
          </button>
        </div>
      </div>
    </div>
  );
}
