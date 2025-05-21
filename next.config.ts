
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  devIndicators: {
    // allowedDevOrigins: ['9003-firebase-studio-1747758193383.cluster-etsqrqvqyvd4erxx7qq32imrjk.cloudworkstations.dev'],
  },
};

export default nextConfig;
