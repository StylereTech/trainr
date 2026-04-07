/** @type {import('next').NextConfig} */
const nextConfig = {
  // TypeScript errors must be fixed before deploy
  // typescript: { ignoreBuildErrors: false },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
  allowedDevOrigins: ['*.replit.dev', '*.replit.app', '*.picard.replit.dev'],
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },
  },
}

module.exports = nextConfig
