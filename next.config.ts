import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  experimental: {
    // proxy.ts buffers each request body in memory, capped at 10MB by default.
    // Batch uploads send a full-resolution front+back scan pair (tens of MB),
    // which would otherwise be truncated and fail `req.formData()`.
    proxyClientMaxBodySize: "256mb",
  },
};

export default nextConfig;
