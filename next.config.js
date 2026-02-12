require('dotenv').config({ path: '.env.local' });
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
}

// Log System ID on startup
if (process.env.NODE_ENV === 'development') {
  const username = process.env.NEXT_PUBLIC_NX_CLOUD_USERNAME;
  const password = process.env.NEXT_PUBLIC_NX_CLOUD_PASSWORD;

  if (username && password) {
    const auth = Buffer.from(`${username}:${password}`).toString('base64');
    fetch('https://meta.nxvms.com/cdb/systems', {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Basic ${auth}`
      }
    })
      .then(res => res.json())
      .then(data => {
        const systems = data.systems || [];
        if (systems.length > 0) {
          console.log('\x1b[36m%s\x1b[0m', '\n🚀 NX Cloud Systems Detected:');
          systems.forEach(sys => {
            console.log('\x1b[32m%s\x1b[0m', `   - ${sys.name}: ${sys.id} (${sys.stateOfHealth})`);
          });
          console.log('');
        }
      })
      .catch(err => {
        // Silently fail if cloud is unreachable
      });
  }
}

module.exports = nextConfig