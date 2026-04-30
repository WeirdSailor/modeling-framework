import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/elexon/:path*',
        destination: 'https://data.elexon.co.uk/bmrs/api/v1/:path*',
      },
    ]
  },
}

export default nextConfig
