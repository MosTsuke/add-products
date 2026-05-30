/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/ddg',
        destination: 'https://api.duckduckgo.com/',
      },
    ];
  },
};

module.exports = nextConfig;
