require('dotenv').config({ path: '.env.local' });
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
/** @type {import('next').NextConfig} */
const nextConfig = {
  // App Router is enabled by default in Next.js 15
  // No need for experimental.appDir configuration

  // Production optimizations
  output: 'standalone',
  compress: true,
  productionBrowserSourceMaps: false,

  // Allow Turbopack (Next.js 16 default bundler)
  turbopack: {},

  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  // Headers for caching
  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig