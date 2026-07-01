import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Creative uploads (images/short video) go through a Server Action; the default
    // 1 MB body cap is too small. Large UGC video should later move to direct-to-Storage
    // uploads (decisions §9 open item) so big files don't route through the app server.
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
