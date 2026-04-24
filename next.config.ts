import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "**",
            },
        ],
        localPatterns: [
            {
                pathname: "/api/img-proxy",
            },
        ],
    }
};

export default nextConfig;
