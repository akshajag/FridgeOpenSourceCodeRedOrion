import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
