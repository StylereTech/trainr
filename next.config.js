/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
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
