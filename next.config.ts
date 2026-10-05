import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Turbopack's persistent filesystem cache serializes values from the build
    // process's environment, so a real GEMINI_API_KEY present in `.env` would be
    // written verbatim into `.next/cache/turbopack` (and `.next/dev/cache`).
    // The key is only ever read at request time in `lib/gemma.ts`, so the cache
    // buys nothing here that is worth persisting a secret to disk for.
    turbopackFileSystemCacheForBuild: false,
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
