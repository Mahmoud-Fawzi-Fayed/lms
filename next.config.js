/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
  // Allow large file uploads (up to 500MB for videos)
  experimental: {
    serverActions: {
      bodySizeLimit: '500mb',
    },
  },
  headers: async () => [
    {
      source: '/((?!api/content).*)',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-XSS-Protection', value: '1; mode=block' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        {
          key: 'Content-Security-Policy',
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdnjs.cloudflare.com",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: https:",
            "media-src 'self' blob: https:",
            "connect-src 'self' https://accept.paymob.com https://accept.paymobsolutions.com https://*.paymob.com https://*.paymobsolutions.com",
            "frame-src 'self' blob: https://accept.paymob.com https://accept.paymobsolutions.com",
            "frame-ancestors 'none'",
            "object-src blob:",
            "worker-src 'self' blob: https://cdnjs.cloudflare.com",
            "base-uri 'self'",
            "form-action 'self' https://accept.paymob.com https://accept.paymobsolutions.com",
          ].join('; '),
        },
        {
          key: 'Permissions-Policy',
          value: 'camera=(), microphone=(), geolocation=()',
        },
      ],
    },
    {
      source: '/api/content/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        {
          key: 'Content-Security-Policy',
          value: [
            "default-src 'self'",
            "frame-ancestors 'self'",
            "object-src 'none'",
            "base-uri 'self'",
          ].join('; '),
        },
        { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
        { key: 'Pragma', value: 'no-cache' },
        { key: 'Content-Disposition', value: 'inline' },
      ],
    },
  ],
  // Prevent source maps in production
  productionBrowserSourceMaps: false,
};

module.exports = nextConfig;
