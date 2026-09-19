<div align="center">
  <img src="public/icons/icon-192.png" height="80" alt="NurulQuran logo" />
  <h1>NurulQuran</h1>
  <p><strong>نُورُ الْقُرْآن</strong></p>
  <p>
    A local-first Quran reading and memorization platform: Tajweed evaluation, Arabic lessons,
    ten Hifz modes, spaced repetition, English and Tamil translations, and a bring-your-own-key AI tutor.
  </p>
  <p>
    <a href="#-features">Features</a> ·
    <a href="#-getting-started">Getting Started</a> ·
    <a href="#-external-services--attribution">Attribution</a>
  </p>
  <p>
    <a href="https://nextjs.org/docs"><img src="https://img.shields.io/badge/Next.js-15-059669?style=flat-square&logo=next.js&logoColor=white" alt="Next.js 15" /></a>
    <a href="https://www.typescriptlang.org/docs/"><img src="https://img.shields.io/badge/TypeScript-5.9-059669?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 5.9" /></a>
    <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-19-059669?style=flat-square&logo=react&logoColor=white" alt="React 19" /></a>
    <a href="https://bun.sh/docs"><img src="https://img.shields.io/badge/Bun-runtime-059669?style=flat-square&logo=bun&logoColor=white" alt="Bun" /></a>
    <a href="https://ai.google.dev/gemini-api/docs"><img src="https://img.shields.io/badge/Google_Gemini-API-059669?style=flat-square&logo=google&logoColor=white" alt="Google Gemini API" /></a>
    <a href="https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps"><img src="https://img.shields.io/badge/PWA-offline--first-059669?style=flat-square&logo=pwa&logoColor=white" alt="PWA" /></a>
  </p>
</div>

---

## Overview

NurulQuran is a Progressive Web App built with Next.js 15 and React 19. All learner data — progress,
memorization state, streaks, and AI provider configuration — is stored locally in the browser
(IndexedDB via Dexie), so the app works without a user account. AI features run server-side through
the Gemini API by default, or through a provider the learner configures with their own API key.

## Architecture

| Layer | Technology |
| --- | --- |
| Frontend | [Next.js 15](https://nextjs.org/docs) (App Router, `output: 'standalone'`), [React 19](https://react.dev/), TypeScript 5.9 (strict) |
| Styling | [Tailwind CSS 4](https://tailwindcss.com/docs) with `@tailwindcss/typography`, `tw-animate-css`, PostCSS + Autoprefixer |
| Animation | [Motion](https://motion.dev/docs/react) 12 (`motion`), transpiled via `transpilePackages` |
| Local database | [Dexie.js](https://dexie.org/) 4 — IndexedDB wrapper, with [`dexie-react-hooks`](https://dexie.org/docs/dexie-react-hooks/) for reactive queries |
| AI — text & speech | [Google Gen AI SDK](https://github.com/googleapis/js-genai) (`@google/genai`): text generation, JSON-graded recitation evaluation, TTS voice previews |
| AI — live voice | Gemini Live API (`bidiGenerateContent` over WebSocket) with PCM input/output and dual audio transcription |
| AI — provider abstraction | [Vercel AI SDK](https://ai-sdk.dev/docs/introduction) (`ai`, `@ai-sdk/react`, `@ai-sdk/google`, `@ai-sdk/openai`) for the BYOK tutor |
| Quran text & audio | [AlQuran.Cloud API](https://alquran.cloud/api) + [Islamic Network CDN](https://alquran.cloud/cdn) (keyless), with an in-app verified offline corpus |
| Word-level recitation | [Quran.com API v4](https://quran.com/developers) recitation segments → word-by-word highlight alignment |
| PWA | Installable manifest, service worker (`public/sw.js`), offline dashboard start (`/dashboard`) |
| Validation | [Zod](https://zod.dev/) schemas on every API route and server action |
| Forms | [`react-hook-form` resolvers](https://github.com/react-hook-form/resolvers) (`@hookform/resolvers`) |
| Icons | [Lucide](https://lucide.dev/) (`lucide-react`) |

## Features

- **Quran reader** — Uthmani and simple-script text, English and Tamil translations, word morphology,
  per-ayah recitation audio from 7 verified reciters, and word-by-word highlight synchronized to
  measured recitation timings (with a length-based fallback where no alignment exists).
- **Hifz (memorization) engine** — ten memorization modes across choice, recall, and recitation
  modes, plus a planner calendar for scheduled revision.
- **Spaced repetition & gamification** — XP, streaks, session accuracy tracking, and three practice
  games (Ayah Assembly, Mutashabihat Radar, Memory Matrix) with server-side XP derivation.
- **Tajweed evaluation** — microphone-based recitation submission graded by Gemini against Hafs 'an
  'Asim rules (Makharij, Noon/Meem Sakinah, Madd, Qalqalah, Tafkheem/Tarqeeq), with bilingual
  (English/Tamil) feedback and placement certificates.
- **Live Tajweed coach & voice storyteller** — real-time bidirectional voice sessions over the
  Gemini Live API with selectable teacher personas and voice previews via Gemini TTS. Every voice
  surface degrades in tiers: the authentic recording first, then the learner's on-device Piper voice
  (Tamil and English, ~63 MB per voice, downloaded from Settings), and only then the platform
  speech synthesizer — which is what makes Tamil coaching work on desktops that ship no Tamil voice.
- **Tafsir reflection** — lesson-grounded reflection grading: the verse text is re-fetched
  server-side from the verified Quran provider, so the model never recalls scripture from memory.
- **AI tutor (BYOK)** — streaming chat assistant. Works with the server Gemini default or a
  learner-configured provider (Gemini, OpenAI, Anthropic, Groq, Mistral, OpenRouter, or a custom
  OpenAI-compatible base URL); keys are stored client-side only.
- **Arabic Lab** — structured lessons for iʿrāb parsing, tashkīl placement, letter joining, ṣarf
  matching, stroke tracing, listening dialogues, and dictation, with pronunciation playback resolved
  against recorded recitations rather than synthesized speech.
- **Progress dashboard** — reactive local views of level, XP, streaks, and mastered entries.
- **Installable & offline** — service worker, manifest (`display: standalone`, `start_url:
  /dashboard`), and an in-app verified offline verse corpus.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/docs/installation) ≥ 1.x (package manager and script runner)
- [Node.js](https://nodejs.org/) ≥ 20 (`@types/node` is pinned to `^20`)
- A [Gemini API key](https://ai.google.dev/gemini-api/docs/api-key) for the AI features

### Installation

```bash
# 1. Install dependencies
bun install

# 2. Configure environment (see table below)
cp .env.example .env

# 3. Start the dev server
bun run dev
```

The app installs as a PWA from the browser's install prompt once served over HTTPS.

### Scripts

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start the Next.js dev server |
| `bun run build` | Production build (`output: 'standalone'`) |
| `bun run start` | Run the standalone production server |
| `bun run lint` | ESLint (`eslint-config-next`) |
| `bun run verify:arabic` | Validate the Arabic curriculum dataset (`lib/arabic/validate.ts`) |
| `bun run verify:pronunciation` | Verify every lesson's Arabic resolves to real recitation clips |
| `bun run verify:timings` | Verify reciter audio ↔ word-timing pairings against the live APIs |
| `bun run verify:whisper` | Verify the on-device log-mel front end against Whisper's own filterbank and token ids |
| `bun run verify:piper` | Verify the on-device voice: vendored phonemizer checksums, and every shipped voice's phoneme table against the ids the phonemizer emits (`PIPER_E2E=1` also synthesizes a phrase) |
| `bun run verify:games` | Verify the Ayah Assembly word-grid layout: cards never overlap, leave the stage, or hide under the tray, and stay above a usable size from a 320px phone to a wide desktop |
| `bun run clean` | Remove Next.js build output |

### Environment Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | Yes (AI features) | Server-side Gemini API key. AI Studio deploys inject it automatically; self-hosting reads it from the environment. |
| `APP_URL` | Deployments | Public URL of the hosted app, used for self-referential links and callbacks. |
| `GEMINI_MODEL` | No | Server override for the Gemini text model (default: `gemini-3.8-flash`). |
| `GEMINI_LIVE_MODEL` | No | Override for the Live (bidiGenerateContent) model (default: `gemini-3.8-live`). |
| `NEXT_PUBLIC_MORPHOLOGY_URL` | No | Optional endpoint for word morphology data. |
| `NEXT_PUBLIC_WORD_TIMINGS_URL` | No | Optional endpoint for word-timing data. |

API routes return a structured `503 not_configured` response when the Gemini key is absent —
evaluation features degrade explicitly instead of fabricating results.

## Project Structure

```
app/
  actions/       # Server actions (game sessions; server-side XP derivation)
  api/
    chat/        # BYOK AI tutor (streaming)
    tafsir/      # Reflection grading + Live session token minting
    tajweed/     # Recitation evaluation, live coach, TTS voice previews
  arabic-lab/ learn/ memorize/ quran/ review/ games/ progress/ settings/
components/      # ai/ arabic/ games/ memorize/ quran/ tafsir/ learning/ ...
hooks/           # e.g. use-gemini-live-tafsir (Live WebSocket session lifecycle)
lib/
  ai/            # Model registry, provider vendors, key resolution
  quran/         # AlQuran.Cloud provider, reciters, word timings, tajweed
  learning/      # Curriculum, pronunciation resolution
  db/            # Dexie schemas
  api/           # Request guards, rate limiting, Zod schemas
lib/arabic/      # Arabic dataset + validator
scripts/         # Curriculum / pronunciation / timings verification (run with Bun)
public/          # PWA icons, manifest, service worker
```

## External Services & Attribution

NurulQuran depends on the following external services. Each is keyless except the Gemini API.

| Service | Role in this app | Link |
| --- | --- | --- |
| **Google Gemini API** | Text generation and JSON-mode grading for Tajweed evaluation, live coaching, and tafsir reflection; TTS voice previews; Live API voice sessions over WebSocket | [Docs](https://ai.google.dev/gemini-api/docs) · [API reference](https://ai.google.dev/api) · [Key](https://ai.google.dev/gemini-api/docs/api-key) |
| **Google Gen AI SDK** (`@google/genai`) | Official TypeScript SDK used for all server-side Gemini calls and the client-side Live session | [Repository](https://github.com/googleapis/js-genai) |
| **Vercel AI SDK** (`ai`, `@ai-sdk/react`, `@ai-sdk/google`, `@ai-sdk/openai`) | Unified provider interface for the BYOK tutor, including streaming chat | [Docs](https://ai-sdk.dev/docs/introduction) · [npm: `ai`](https://www.npmjs.com/package/ai) |
| **AlQuran.Cloud API** | Keyless REST source for Quran text, translations, and search (`api.alquran.cloud/v1`) | [API docs](https://alquran.cloud/api) · [Terms](https://alquran.cloud/terms-and-conditions) |
| **Islamic Network CDN** | Per-ayah recitation audio (`cdn.islamic.network/quran/audio`) and word-by-word clips | [CDN](https://alquran.cloud/cdn) · [Services](https://islamic.network/services.html) |
| **Quran.com API v4** | Word-level recitation segments used for synchronized word highlight; text lookup in verification scripts | [Developers](https://quran.com/developers) |
| **Dexie.js** | Local-first IndexedDB persistence for all learner data | [Docs](https://dexie.org/docs) · [Repository](https://github.com/dexie/Dexie.js/) |
| **Tanzil** | Hafs Uthmani text dataset referenced by the in-app verification seal | [tanzil.net](https://tanzil.net/) |
| **Piper voices** (via Hugging Face) | On-device Tamil and English coaching voices (VITS, run with `onnxruntime-web`) | [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices) · [Tamil voices](https://huggingface.co/Jeyaram-K/piper-tamil-voices) |
| **piper-wasm** (`@diffusionstudio/piper-wasm`, MIT) | Vendored espeak-ng WebAssembly phonemizer that turns text into the phoneme ids the voices expect — see `public/piper/NOTICE.md` | [npm](https://www.npmjs.com/package/@diffusionstudio/piper-wasm) · [Upstream](https://github.com/diffusion-studio/piper-wasm) |

Quranic text and recitations are provided by third parties; their terms govern redistribution and
usage. This project is not affiliated with Google, Vercel, AlQuran.Cloud, Islamic Network, or
Quran.com.

## License

No license file is currently present in this repository. All rights reserved by the project
authors until a license is added.
