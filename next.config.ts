import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
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
   * Cross-origin isolation is what unlocks SharedArrayBuffer, which onnxruntime-web needs for
   * multithreaded WASM SIMD inference inside the local engine worker. COEP is `credentialless`
   * rather than `require-corp` so third-party subresources (scripture CDNs, images) keep loading
   * without per-resource CORP opt-ins, while crossOriginIsolated still evaluates to true in
   * Chromium. Audio CDNs are fetched with CORS already, so they are unaffected.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {key: 'Cross-Origin-Opener-Policy', value: 'same-origin'},
          {key: 'Cross-Origin-Embedder-Policy', value: 'credentialless'},
        ],
      },
    ];
  },
  webpack: (config, {dev}) => {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};

export default nextConfig;
