/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        // Prevent embedding TRAINR without restricting its outgoing Stripe content.
        { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
      ],
    }]
  },
  webpack(config) {
    if (process.env.TRAINR_DISABLE_BUILD_CACHE === '1') config.cache = false
    return config
  },
  // TypeScript errors must be fixed before deploy
  // typescript: { ignoreBuildErrors: false },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },
  },
}

module.exports = nextConfig
