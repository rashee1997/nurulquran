# Vendored Piper phonemizer

These three files are the **unmodified** build artifacts of the Piper phonemizer: espeak-ng
compiled to WebAssembly together with its full `espeak-ng-data` tree. They are what turns Tamil
and English coaching text into the phoneme ids a Piper VITS voice expects — without them the
voice models in `lib/audio/model-registry.ts` cannot be run at all.

| File | Bytes | SHA-256 |
| --- | --- | --- |
| `piper_phonemize.js` | 120,714 | `fef0c2fc442d24fdef5c7c7cc37d5da2314407640fe11ab1bfe347c723dff19b` |
| `piper_phonemize.wasm` | 635,212 | `b777cd107a91d2bcc6a1ea46f2c26a662a7407394fe84589198aeaa83dd7a9d6` |
| `piper_phonemize.data` | 18,077,249 | `29f1025eb23a5b5c192cd14a6efbce4509402ff265405072ee6f7d1a09b78f8c` |

- **Package:** [`@diffusionstudio/piper-wasm`](https://www.npmjs.com/package/@diffusionstudio/piper-wasm) `1.0.0`
- **Upstream:** [diffusion-studio/piper-wasm](https://github.com/diffusion-studio/piper-wasm) — a WebAssembly build of [rhasspy/piper](https://github.com/rhasspy/piper)
- **Licence:** MIT
- **Verified by:** downloading the published npm tarball and confirming the three files above are
  byte-identical to it.

They are vendored rather than imported so the runtime has no build-time dependency on an
emscripten bundle (which is fragile under a bundler) and no runtime dependency on a third-party
CDN: the assets are served same-origin from `/piper/`, exactly like the app's other static
assets. `lib/audio/tts.worker.ts` loads them; `public/sw.js` caches them cache-first.

The `.data` file contains espeak-ng's pronunciation data for ~113 languages. Tamil (`ta_dict`)
is why this build was chosen. Refreshing these files should be done by re-running the
verification in `scripts/verify-piper-tts.ts`, which pins the phoneme→id table the voices are
checked against.
