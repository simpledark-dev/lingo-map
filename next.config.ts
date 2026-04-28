import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tell Next.js's file tracer to bundle the on-disk map JSONs with the
  // /api/maps serverless functions. Without this, Vercel's function bundle
  // doesn't include `data/` (it's outside the import graph), so
  // `fs.readFile('data/pokemon.json')` throws ENOENT in production and the
  // game falls back to the 4-object compiled scaffold in src/maps/pokemon.ts
  // — looking empty.
  outputFileTracingIncludes: {
    "/api/maps": ["./data/**/*.json"],
    "/api/maps/[id]": ["./data/**/*.json"],
  },
};

export default nextConfig;
