import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The isolated game preview never shares an output directory with normal dev/build.
  distDir: process.env.QR_GAAP_ISOLATED_PREVIEW === '1' ? '.next-game-preview' : '.next',
};

export default nextConfig;
