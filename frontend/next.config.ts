import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  allowedDevOrigins: (process.env.FRIDGE_ALLOWED_HOSTS ?? "localhost,127.0.0.1").split(","),
  // Cache Components are off: this app renders per-request session/persona state
  // throughout the dashboard tree, and the demo store lives on the client.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    formats: ["image/webp"],
  },
};

export default nextConfig;
