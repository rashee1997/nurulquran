'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { db, AIProviderRecord } from '@/lib/db';
import { encryptApiKey, decryptApiKey } from '@/lib/db/crypto';
import { Bot, Key, Plus, Check, Trash2, Globe, Cpu, ChevronLeft, ShieldCheck, Activity } from 'lucide-react';

const DEFAULT_MODELS: Record<string, string> = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-20241022',
  groq: 'llama-3.3-70b-versatile',
  mistral: 'mistral-small-latest',
  openrouter: 'google/gemini-2.5-flash',
  custom: 'local-model',
};

export default function AIProviderSettingsPage() {
  const [providers, setProviders] = useState<AIProviderRecord[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form state
  const [newType, setNewType] = useState('openai');
  const [newName, setNewName] = useState('');
  const [newApiKey, setNewApiKey] = useState('');
  const [newBaseUrl, setNewBaseUrl] = useState('');
  const [newModel, setNewModel] = useState('gpt-4o-mini');

  // Test state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);

  useEffect(() => {
    let active = true;
    db.aiProviders.toArray().then((list) => {
      if (active) {
        setProviders(list);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const reloadProviders = async () => {
    const list = await db.aiProviders.toArray();
    setProviders(list);
  };

  const handleTypeChange = (type: string) => {
    setNewType(type);
    setNewModel(DEFAULT_MODELS[type] || '');
    if (!newName || Object.keys(DEFAULT_MODELS).some(k => newName.toLowerCase().includes(k))) {
      setNewName(type.charAt(0).toUpperCase() + type.slice(1));
    }
  };

  const handleSaveProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let encryptedKey = '';
      if (newApiKey.trim()) {
        encryptedKey = await encryptApiKey(newApiKey.trim());
      }

      const id = `provider_${Date.now()}`;
      await db.aiProviders.add({
        id,
        name: newName || newType,
        type: newType as AIProviderRecord['type'],
        encryptedKey: encryptedKey,
        baseUrl: newBaseUrl.trim() || undefined,
        models: [newModel.trim() || DEFAULT_MODELS[newType] || 'default-model'],
        selectedModel: newModel.trim() || DEFAULT_MODELS[newType] || 'default-model',
        isDefault: providers.length === 0,
      });

      setShowAddModal(false);
      setNewApiKey('');
      setNewBaseUrl('');
      reloadProviders();
    } catch (err) {
      console.error('Failed to save AI provider:', err);
    }
  };

  const handleSetDefault = async (id: string) => {
    const all = await db.aiProviders.toArray();
    for (const p of all) {
      await db.aiProviders.update(p.id, { isDefault: p.id === id });
    }
    reloadProviders();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this AI provider configuration?')) {
      await db.aiProviders.delete(id);
      reloadProviders();
    }
  };

  const handleTestConnection = async (prov: AIProviderRecord) => {
    setTestingId(prov.id);
    setTestResult(null);

    let decryptedKey = '';
    if (prov.encryptedKey) {
      try {
        decryptedKey = await decryptApiKey(prov.encryptedKey);
      } catch (e) {
        console.warn('Decryption fallback:', e);
      }
    }

    try {
      const res = await fetch('/api/chat/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerConfig: {
            type: prov.type,
            apiKey: decryptedKey,
            baseUrl: prov.baseUrl,
            selectedModel: prov.selectedModel,
          },
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setTestResult({
          id: prov.id,
          success: true,
          message: `Connected successfully (${data.latencyMs || 0}ms - ${prov.selectedModel})`,
        });
      } else {
        setTestResult({
          id: prov.id,
          success: false,
          message: data.error || 'Connection test failed',
        });
      }
    } catch (err) {
      setTestResult({
        id: prov.id,
        success: false,
        message: 'Network error reaching test endpoint',
      });
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div id="byok-settings-page" className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Back button */}
      <Link
        href="/settings"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        <span>Back to Settings</span>
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Bot className="w-6 h-6 text-emerald-600" />
            <span>Bring Your Own Key (BYOK)</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Configure dynamic AI models with client-side AES-GCM encryption in IndexedDB.
          </p>
        </div>

        <button
          onClick={() => {
            setNewType('openai');
            setNewName('OpenAI');
            setNewModel('gpt-4o-mini');
            setShowAddModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-md active:scale-95 self-start sm:self-center"
        >
          <Plus className="w-4 h-4" />
          <span>Add AI Provider</span>
        </button>
      </div>

      {/* Security notice */}
      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        <div className="space-y-0.5 text-xs">
          <h4 className="font-bold text-slate-800 dark:text-slate-200">
            Zero Cloud Storage of API Keys
          </h4>
          <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
            All user-provided API keys are encrypted with standard AES-GCM in your browser using the Web Crypto API. Keys are only sent to the model resolver in transient request headers and never stored on a server database.
          </p>
        </div>
      </div>

      {/* Test feedback */}
      {testResult && (
        <div
          className={`p-3.5 rounded-2xl border text-xs flex items-center gap-2 animate-in fade-in ${
            testResult.success
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
          }`}
        >
          <Activity className="w-4 h-4 shrink-0" />
          <span>{testResult.message}</span>
        </div>
      )}

      {/* Providers List */}
      <div className="space-y-3">
        {providers.map((prov) => (
          <div
            key={prov.id}
            className={`p-5 rounded-2xl border transition-all ${
              prov.isDefault
                ? 'bg-white dark:bg-slate-900 border-emerald-400 dark:border-emerald-600/70 shadow-sm ring-1 ring-emerald-500/20'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {prov.name}
                  </h3>
                  {prov.isDefault && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                      Default Active
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                  <span className="capitalize font-medium">{prov.type}</span>
                  <span>•</span>
                  <span className="font-mono text-[11px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                    {prov.selectedModel}
                  </span>
                  {prov.baseUrl && (
                    <>
                      <span>•</span>
                      <span className="text-[11px] truncate max-w-[150px]">{prov.baseUrl}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  disabled={testingId === prov.id}
                  onClick={() => handleTestConnection(prov)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 transition-colors disabled:opacity-40"
                >
                  {testingId === prov.id ? 'Testing...' : 'Test Connection'}
                </button>

                {!prov.isDefault && (
                  <button
                    onClick={() => handleSetDefault(prov.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950 transition-colors"
                  >
                    Set Default
                  </button>
                )}

                {prov.id !== 'gemini-server-default' && (
                  <button
                    onClick={() => handleDelete(prov.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 transition-colors"
                    title="Delete Provider"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Provider Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-5">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Configure New AI Provider
            </h2>

            <form onSubmit={handleSaveProvider} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Provider Ecosystem
                </label>
                <select
                  value={newType}
                  onChange={(e) => handleTypeChange(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-hidden"
                >
                  <option value="gemini">Google Gemini</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="groq">Groq (Ultra-fast)</option>
                  <option value="mistral">Mistral AI</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="custom">Custom (Ollama / vLLM / Local)</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. My Fast Groq"
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-hidden"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Target Model Identifier
                </label>
                <input
                  type="text"
                  required
                  value={newModel}
                  onChange={(e) => setNewModel(e.target.value)}
                  placeholder="e.g. gpt-4o-mini, llama-3.3-70b-versatile"
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-hidden font-mono"
                />
              </div>

              {newType === 'custom' || newType === 'openrouter' ? (
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Base URL
                  </label>
                  <input
                    type="url"
                    value={newBaseUrl}
                    onChange={(e) => setNewBaseUrl(e.target.value)}
                    placeholder="https://openrouter.ai/api/v1 or http://localhost:11434/v1"
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-hidden font-mono"
                  />
                </div>
              ) : null}

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  API Key (Stored locally in IndexedDB with AES-GCM)
                </label>
                <input
                  type="password"
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  placeholder="sk-... or api key"
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-hidden font-mono"
                />
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md"
                >
                  Save Provider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
