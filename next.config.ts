import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Creative uploads (images/short video) go through a Server Action; the default
    // 1 MB body cap is too small. Large UGC video should later move to direct-to-Storage
    // uploads (decisions §9 open item) so big files don't route through the app server.
    serverActions: {
      bodySizeLimit: "25mb",
    },
    // Keep pages the user just visited in the browser for 30s, so going back to
    // Library/Dashboard from an ad or a drawer is instant instead of a full server
    // re-render. Every save already calls router.refresh()/revalidatePath, which
    // clears this cache, so edits still show up immediately.
    staleTimes: {
      dynamic: 30,
    },
  },
};

export default nextConfig;
