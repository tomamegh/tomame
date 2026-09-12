import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "**",
            },
            // SHEIN's CDN serves images over http on some product pages.
            // We upgrade to https in the scraper, but cached extractions
            // from before that fix still carry http URLs.
            {
                protocol: "http",
                hostname: "img.ltwebstatic.com",
            },
            {
                protocol: "http",
                hostname: "img.shein.com",
            },
        ],
        localPatterns: [
            {
                pathname: "/api/img-proxy",
            },
            {
                pathname: "/images/**",
            },
            {
                pathname: "/icons/**",
            },
            // Admin-uploaded marketing photos, streamed from the private
            // storage bucket by /api/media/[key]. Same-origin on purpose.
            {
                pathname: "/api/media/**",
            },
        ],
    }
};

export default nextConfig;
