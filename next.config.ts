import type { NextConfig } from "next";

const config: NextConfig = {
  // Allow the Anki POST body to carry a base64 PNG screenshot — defaults
  // to 1MB which is too tight for 720p frames.
  experimental: {
    serverActions: { bodySizeLimit: "20mb" },
  },
};

export default config;
