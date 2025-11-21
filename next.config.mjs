/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  webpack: (config, { dev }) => {
    // Fix for react-pdf and pdfjs-dist canvas module
    // Canvas is a native module that doesn't work in browser, so we ignore it
    config.resolve.alias.canvas = false
    config.resolve.alias.encoding = false

    // CRITICAL FIX for PDF.js "Object.defineProperty called on non-object" error
    // Next.js defaults to 'eval-source-map' in dev, which corrupts PDF.js objects
    // Use Object.defineProperty to prevent Next.js from overriding back to eval
    // See: https://github.com/wojtekmaj/react-pdf/issues/1813
    if (dev) {
      Object.defineProperty(config, 'devtool', {
        get() {
          return 'source-map'
        },
        set() {
          // Prevent Next.js from overriding back to eval-source-map
        },
      })
    }

    return config
  },
}

export default nextConfig
