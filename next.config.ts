import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /*
   * Lint runs on deploy. It was ignored, which is how a dead double-tap guard and a set of
   * unused imports reached `main` while the build stayed green; the same sweep has now been
   * cleared, so a lint error here is a real error rather than inherited noise.
   */
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Allow access to remote image placeholder.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**', // This allows any path under the hostname
      },
    ],
  },
  output: 'standalone',
  transpilePackages: ['motion'],
  /*
   * Cross-origin isolation unlocks SharedArrayBuffer, which onnxruntime-web needs for
   * multithreaded WASM SIMD inference inside the local engine worker. It is scoped to
   * `/quran/coach` — the only page that runs the engine — and to the service worker script,
   * which must carry the same COEP as the isolated client it controls.
   *
   * It must NOT be applied site-wide: the reciter audio CDN (cdn.islamic.network) sends no
   * CORS headers, and under COEP the browser blocks the reader's no-cors `<audio>` loads,
   * which surfaced as "Playback was blocked or the recitation could not be loaded" for every
   * reciter. On non-isolated pages media elements load exactly as before.
   */
  async headers() {
    return [
      {
        source: '/quran/coach',
        headers: [
          {key: 'Cross-Origin-Opener-Policy', value: 'same-origin'},
          {key: 'Cross-Origin-Embedder-Policy', value: 'credentialless'},
        ],
      },
      {
        source: '/sw.js',
        headers: [
          {key: 'Cross-Origin-Opener-Policy', value: 'same-origin'},
          {key: 'Cross-Origin-Embedder-Policy', value: 'credentialless'},
        ],
      },
    ];
  },
  webpack: (config, {dev}) => {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modify — file watching is disabled to prevent flickering during agent edits.
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};

export default nextConfig;
