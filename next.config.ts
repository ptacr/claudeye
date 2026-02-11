import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: __dirname,
  },
  images: {
    unoptimized: true,
  },
  env: {
    // Expose CLAUDE_PROJECTS_PATH to the client-side if needed
    // Note: Only use this if you need it on the client side
    // For server-side only, you can access it via process.env.CLAUDE_PROJECTS_PATH
  },
};

export default nextConfig;
