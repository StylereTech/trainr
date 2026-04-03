/** @type {import('next').NextConfig} */
const nextConfig = {
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
