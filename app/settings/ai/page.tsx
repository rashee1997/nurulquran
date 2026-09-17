'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { db, AIProviderRecord, SERVER_DEFAULT_PROVIDER_ID } from '@/lib/db';
import { encryptApiKey, decryptApiKey } from '@/lib/db/crypto';
import { PROVIDER_DEFAULT_MODELS } from '@/lib/ai/models';
import { AI_PROVIDER_VENDORS, type AIProviderVendor } from '@/lib/ai/types';
import { Bot, Plus, Trash2, ChevronLeft, ShieldCheck, Activity } from 'lucide-react';

/**
 * Model defaults come from `lib/ai/models`, the single source of truth the server
 * routes read. A local copy here had drifted (it still suggested the retired
 * `gemini-2.5-flash`), so a provider could be configured with a model id that every
 * evaluation route disagreed with.
 */
const DEFAULT_MODELS = PROVIDER_DEFAULT_MODELS;

function isProviderVendor(value: string): value is AIProviderVendor {
  return (AI_PROVIDER_VENDORS as readonly string[]).includes(value);
}

interface ProviderProbeResult {
  success: boolean;
  error?: string;
  latencyMs?: number;
}

/**
 * Narrows the provider-probe response.
 *
 * The previous version read properties off `await res.json()` directly, i.e. off `any`,
 * so a change to the route's error shape would have turned into "Connection test failed"
 * with no explanation instead of a type error here.
 */
function readProbeResult(payload: unknown): ProviderProbeResult {
  if (typeof payload !== 'object' || payload === null) return { success: false };
  const source = payload as Record<string, unknown>;
  return {
    success: source.success === true,
    error:
      typeof source.error === 'string' && source.error.trim().length > 0
        ? source.error.trim()
        : undefined,
    latencyMs:
      typeof source.latencyMs === 'number' && Number.isFinite(source.latencyMs)
        ? source.latencyMs
        : undefined,
  };
}

export default function AIProviderSettingsPage() {
  const [providers, setProviders] = useState<AIProviderRecord[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form state
  const [newType, setNewType] = useState<AIProviderVendor>('openai');
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

  // The add-provider sheet behaves like a dialog: Escape dismisses it.
  useEffect(() => {
    if (!showAddModal) return;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setShowAddModal(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showAddModal]);

  const reloadProviders = async (): Promise<void> => {
    const list = await db.aiProviders.toArray();
    setProviders(list);
  };

  const handleTypeChange = (value: string): void => {
    if (!isProviderVendor(value)) return;
    setNewType(value);
    setNewModel(DEFAULT_MODELS[value]);
    if (!newName || AI_PROVIDER_VENDORS.some((vendor) => newName.toLowerCase().includes(vendor))) {
      setNewName(value.charAt(0).toUpperCase() + value.slice(1));
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
      const selectedModel = newModel.trim() || DEFAULT_MODELS[newType];
      await db.aiProviders.add({
        id,
        name: newName || newType,
        type: newType,
        encryptedKey,
        baseUrl: newBaseUrl.trim() || undefined,
        models: [selectedModel],
        selectedModel,
        isDefault: providers.length === 0,
      });

      setShowAddModal(false);
      setNewApiKey('');
      setNewBaseUrl('');
      await reloadProviders();
    } catch (err) {
      console.error('Failed to save AI provider:', err);
    }
  };

  const handleSetDefault = async (id: string) => {
    // One transaction: without it an interrupted loop could leave two providers flagged
    // as default, and the resolver's "first default" lookup would be ambiguous.
    await db.transaction('rw', db.aiProviders, async () => {
      const all = await db.aiProviders.toArray();
      for (const provider of all) {
        const shouldBeDefault = provider.id === id;
        if (provider.isDefault !== shouldBeDefault) {
          await db.aiProviders.update(provider.id, { isDefault: shouldBeDefault });
        }
      }
    });
    await reloadProviders();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this AI provider configuration?')) {
      await db.aiProviders.delete(id);
      await reloadProviders();
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

      const payload: unknown = await res.json().catch(() => null);
      const probe = readProbeResult(payload);

      if (res.ok && probe.success) {
        setTestResult({
          id: prov.id,
          success: true,
          message: `Connected in ${probe.latencyMs ?? 0} ms — ${prov.selectedModel}`,
        });
      } else {
        setTestResult({
          id: prov.id,
          success: false,
          message:
            probe.error ??
            'The provider did not respond. Check the API key, model name and base URL.',
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
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        <span>Back to Settings</span>
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Bot className="w-6 h-6 text-primary" />
            <span>AI Providers</span>
          </h1>
          <p className="text-xs text-muted-foreground">
            Use your own API key. Keys are stored only in this browser.
          </p>
        </div>

        <button
          onClick={() => {
            setNewType('openai');
            setNewName('OpenAI');
            setNewModel('gpt-4o-mini');
            setShowAddModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold transition-all shadow-md active:scale-95 self-start sm:self-center"
        >
          <Plus className="w-4 h-4" />
          <span>Add provider</span>
        </button>
      </div>

      {/* Security notice */}
      <div className="p-4 rounded-2xl bg-surface border border-border flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="space-y-0.5 text-xs">
          <h4 className="font-bold text-foreground">
            Keys stay in this browser
          </h4>
          <p className="text-muted-foreground leading-relaxed">
            API keys are protected with AES-GCM using a key derived from this device, sent
            only with the requests that need them, and never stored on a server. This
            protects the value at rest in browser storage; it is not a defence against
            code already running on this page.
          </p>
        </div>
      </div>

      {/* Test feedback */}
      {testResult && (
        <div
          className={`p-3.5 rounded-2xl border text-xs flex items-center gap-2 animate-in fade-in ${
            testResult.success
              ? 'bg-success-subtle border-success/40 text-success-strong'
              : 'bg-danger-subtle border-danger/40 text-danger-strong'
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
                ? 'bg-card border-primary/60 shadow-sm ring-1 ring-primary/30'
                : 'bg-card border-border'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-foreground">
                    {prov.name}
                  </h3>
                  {prov.isDefault && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-primary-subtle text-primary-strong">
                      Default Active
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="capitalize font-medium">{prov.type}</span>
                  <span>•</span>
                  <span className="font-mono text-[11px] bg-surface border border-border text-foreground px-2 py-0.5 rounded">
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
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface border border-border hover:bg-surface-hover text-foreground transition-colors disabled:opacity-40"
                >
                  {testingId === prov.id ? 'Testing...' : 'Test Connection'}
                </button>

                {!prov.isDefault && (
                  <button
                    onClick={() => handleSetDefault(prov.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-primary-strong hover:bg-primary-subtle transition-colors"
                  >
                    Set Default
                  </button>
                )}

                {prov.id !== SERVER_DEFAULT_PROVIDER_ID && (
                  <button
                    onClick={() => handleDelete(prov.id)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-danger hover:bg-danger-subtle transition-colors"
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay backdrop-blur-xs animate-in fade-in"
          onClick={() => setShowAddModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-provider-title"
            className="bg-card border border-border rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-5 text-foreground"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="add-provider-title" className="text-base font-bold text-foreground">
              Add provider
            </h2>

            <form onSubmit={handleSaveProvider} className="space-y-4 text-xs">
              <div>
                <label htmlFor="provider-vendor" className="font-semibold text-foreground block mb-1">
                  Provider
                </label>
                <select
                  id="provider-vendor"
                  value={newType}
                  onChange={(e) => handleTypeChange(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-surface border border-border text-foreground outline-hidden focus:ring-2 focus:ring-primary"
                >
                  <option value="gemini">Google Gemini</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="groq">Groq</option>
                  <option value="mistral">Mistral AI</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="custom">Custom (Ollama / vLLM / Local)</option>
                </select>
              </div>

              <div>
                <label htmlFor="provider-name" className="font-semibold text-foreground block mb-1">
                  Display Name
                </label>
                <input
                  id="provider-name"
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. My Gemini key"
                  className="w-full p-2.5 rounded-xl bg-surface border border-border text-foreground outline-hidden focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label htmlFor="provider-model" className="font-semibold text-foreground block mb-1">
                  Model
                </label>
                <input
                  id="provider-model"
                  type="text"
                  required
                  value={newModel}
                  onChange={(e) => setNewModel(e.target.value)}
                  placeholder="e.g. gpt-4o-mini, llama-3.3-70b-versatile"
                  className="w-full p-2.5 rounded-xl bg-surface border border-border text-foreground outline-hidden focus:ring-2 focus:ring-primary font-mono"
                />
              </div>

              {newType === 'custom' || newType === 'openrouter' ? (
                <div>
                  <label htmlFor="provider-base-url" className="font-semibold text-foreground block mb-1">
                    Base URL
                  </label>
                  <input
                    id="provider-base-url"
                    type="url"
                    value={newBaseUrl}
                    onChange={(e) => setNewBaseUrl(e.target.value)}
                    placeholder="https://openrouter.ai/api/v1 or http://localhost:11434/v1"
                    className="w-full p-2.5 rounded-xl bg-surface border border-border text-foreground outline-hidden focus:ring-2 focus:ring-primary font-mono"
                  />
                </div>
              ) : null}

              <div>
                <label htmlFor="provider-api-key" className="font-semibold text-foreground block mb-1">
                  API Key (stored in this browser, protected with AES-GCM)
                </label>
                <input
                  id="provider-api-key"
                  type="password"
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  placeholder="sk-... or api key"
                  className="w-full p-2.5 rounded-xl bg-surface border border-border text-foreground outline-hidden focus:ring-2 focus:ring-primary font-mono"
                />
              </div>

              <div className="flex gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-surface hover:bg-surface-hover border border-border text-foreground font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground font-bold shadow-md"
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
